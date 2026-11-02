import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSecretNames, describe as line, expectedSecrets, inventoryFor, listSecretNames } from './lib/secret-names.mjs';
import { INVENTORY, decodeInventory, encodeInventory } from './secret-inventory.mjs';

// The secrets-name check of the parity job: Secret Manager's secret NAMES against the inventory. Names only, never a value.
const required = () => new Set(expectedSecrets().filter(x => !x.optional).map(x => x.name));

describe('expectedSecrets', () => {
  it('has one entry per concrete Secret Manager name, per-environment prefixes expanded, and only SM entries', () => {
    const names = expectedSecrets().map(x => x.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('iron-log-staging-auth-secret');
    expect(names).toContain('iron-log-qa-google-client-id');
    expect(names).toContain('iron-log-parity-production-url');
    expect(names).not.toContain('CLAUDE_CODE_OAUTH_TOKEN'); // a GitHub secret, not Secret Manager
    expect(expectedSecrets().find(x => x.name === 'iron-log-pii-key').envs).toEqual(['production']); // staging has its own since backlog EP2
    expect(names).toContain('iron-log-staging-pii-key');
    expect(names).toContain('iron-log-qa-pii-key');
  });
});

describe('the inventory argument (a job image older than main must not cause a false UNLISTED)', () => {
  it('round-trips: one comma-free string, Secret Manager entries only, names and flags with no value', () => {
    const arg = encodeInventory();
    expect(arg).toMatch(/^[A-Za-z0-9+/=]+$/);
    const { inventory } = decodeInventory(arg);
    expect(inventory.every(e => e.where === 'SM')).toBe(true);
    expect(inventory.length).toBe(INVENTORY.filter(e => e.where === 'SM').length);
    expect(Object.keys(inventory[0]).sort()).toEqual(['envs', 'name', 'optional', 'trigger', 'where']);
    expect(inventoryFor(arg).expected).toEqual(expectedSecrets());
  });
  it('wins over the baked inventory: a secret only main knows is not UNLISTED, and without the argument it is, with the stale-image note', () => {
    const newer = INVENTORY.concat({ name: '{p}-new-thing', where: 'SM', envs: ['staging'], usedBy: 'x', rotate: 'x', note: '' });
    const present = new Set([...required(), 'iron-log-staging-new-thing']);
    const viaArg = inventoryFor(encodeInventory(newer));
    expect(checkSecretNames(present, viaArg.expected, viaArg.known)).toMatchObject({ code: 0, unlisted: [] });
    expect(viaArg.source).toBe('main');
    const baked = inventoryFor(undefined);
    const r = checkSecretNames(present, baked.expected, baked.known);
    expect(r).toMatchObject({ code: 3, unlisted: ['iron-log-staging-new-thing'] });
    expect(baked.source).toBe('image');
    expect(line(r, baked.source)).toContain('inventory from the job image, not main');
    expect(line(r, 'main')).not.toContain('job image');
  });
  it('throws on an argument that is not an inventory, so the job answers UNKNOWN and never a guess', () => {
    expect(() => inventoryFor('not-base64-json!')).toThrow();
    expect(() => inventoryFor(Buffer.from('{"prefixes":{},"entries":[]}').toString('base64'))).toThrow(/not a valid inventory/);
    expect(() => inventoryFor(Buffer.from(JSON.stringify({ prefixes: { qa: 'x' }, entries: [{ name: 'a', envs: ['nope'] }] })).toString('base64'))).toThrow();
  });
});

describe('checkSecretNames', () => {
  it('is OK (0) when every required secret exists, whether or not the optional ones do', () => {
    const r = checkSecretNames(required());
    expect(r).toMatchObject({ code: 0, missing: [], unlisted: [] });
    expect(line(r)).toMatch(/^secrets: OK \(\d+ expected secrets exist\)$/);
  });
  it('is MISSING (4, red) and names what is absent, e.g. QA losing its own key', () => {
    const have = required(); have.delete('iron-log-qa-pii-key'); have.delete('iron-log-staging-auth-secret');
    const r = checkSecretNames(have);
    expect(r.code).toBe(4);
    expect(r.missing).toEqual(['iron-log-qa-pii-key', 'iron-log-staging-auth-secret']);
    expect(line(r)).toContain('MISSING 2 (iron-log-qa-pii-key, iron-log-staging-auth-secret)');
  });
  it('is UNLISTED (3, yellow) for an iron-log-* secret the inventory does not know, and ignores other projects\' names', () => {
    const have = required(); have.add('iron-log-staging-experiment-key'); have.add('somebody-elses-secret');
    const r = checkSecretNames(have);
    expect(r).toMatchObject({ code: 3, unlisted: ['iron-log-staging-experiment-key'] });
    expect(line(r)).toContain('UNLISTED 1 (iron-log-staging-experiment-key; add to scripts/secret-inventory.mjs or delete)');
  });
  it('lets MISSING win over UNLISTED, and reports both', () => {
    const have = required(); have.delete('iron-log-pii-key'); have.add('iron-log-extra');
    const r = checkSecretNames(have);
    expect(r.code).toBe(4);
    expect(line(r)).toContain('MISSING 1');
    expect(line(r)).toContain('UNLISTED 1');
  });
  it('mentions, without failing, an optional feature set in some environments only (Stripe in production, not staging)', () => {
    const have = required();
    for (const n of ['secret-key', 'webhook-secret', 'price-monthly', 'price-yearly']) have.add(`iron-log-stripe-${n}`);
    const r = checkSecretNames(have);
    expect(r.code).toBe(0);
    expect(r.mixed).toEqual([expect.objectContaining({ entry: '{p}-stripe-secret-key', set: ['production'], notSet: ['staging', 'qa'] })]);
    expect(line(r)).toContain('optional features set in some environments only: {p}-stripe-secret-key (set: production; not set: staging, qa)');
  });
  it('requires the rest of a group once its trigger exists: Stripe secret key set, webhook secret missing is MISSING (4), not OK', () => {
    const have = required();
    for (const n of ['iron-log-stripe-secret-key', 'iron-log-stripe-price-monthly', 'iron-log-stripe-price-yearly']) have.add(n); // webhook secret absent
    const r = checkSecretNames(have);
    expect(r.code).toBe(4);
    expect(r.missing).toEqual(['iron-log-stripe-webhook-secret']);
    expect(line(r)).toContain('MISSING 1 (iron-log-stripe-webhook-secret)');
  });
  it('treats each environment on its own: Stripe complete in production, not started in staging, is OK', () => {
    const have = required();
    for (const n of ['secret-key', 'webhook-secret', 'price-monthly', 'price-yearly']) have.add(`iron-log-stripe-${n}`);
    expect(checkSecretNames(have).code).toBe(0);
  });
  it('requires the whole Web Push group once the private key exists, and the whole Stripe group names every missing member', () => {
    const push = required(); push.add('iron-log-vapid-private-key');
    expect(checkSecretNames(push).missing).toEqual(['iron-log-vapid-public-key', 'iron-log-vapid-subject']);
    const stripe = required(); stripe.add('iron-log-staging-stripe-secret-key');
    expect(checkSecretNames(stripe).missing).toEqual(['iron-log-staging-stripe-price-monthly', 'iron-log-staging-stripe-price-yearly', 'iron-log-staging-stripe-webhook-secret']);
  });
  it('does not require a group member when only that member exists and the trigger does not (a stray price id is not a switched-on feature)', () => {
    const have = required(); have.add('iron-log-stripe-price-monthly');
    expect(checkSecretNames(have).code).toBe(0);
  });
  it('does not call an optional secret that nobody set a mismatch', () => {
    expect(checkSecretNames(required()).mixed).toEqual([]);
  });
});

describe('listSecretNames (the Secret Manager call, with a fake fetch)', () => {
  const fake = (pages, { failAt } = {}) => {
    const calls = [];
    const fn = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('metadata.google.internal')) {
        if (failAt === 'metadata') return { ok: false, status: 404 };
        return String(url).endsWith('project-id') ? { ok: true, text: async () => 'proj-1\n' } : { ok: true, json: async () => ({ access_token: 'tok' }) };
      }
      if (failAt === 'api') return { ok: false, status: 403, text: async () => 'SECRET DETAIL' };
      const i = String(url).includes('pageToken=p2') ? 1 : 0;
      return { ok: true, json: async () => pages[i] };
    };
    return { fn, calls };
  };
  it('returns the last path segment of every secret across pages, using the job\'s own token and asking for metadata only', async () => {
    const { fn, calls } = fake([{ secrets: [{ name: 'projects/1/secrets/a' }], nextPageToken: 'p2' }, { secrets: [{ name: 'projects/1/secrets/b' }] }]);
    expect(await listSecretNames({ fetchFn: fn })).toEqual(['a', 'b']);
    const api = calls.filter(c => new URL(c.url).host === 'secretmanager.googleapis.com');
    expect(api).toHaveLength(2);
    expect(api[0].url).toContain('/projects/proj-1/secrets');
    expect(api[0].init.headers.Authorization).toBe('Bearer tok');
    expect(calls.every(c => !c.url.includes(':access') && !c.url.includes('/versions'))).toBe(true); // never a version, so never a value
  });
  it('throws with the HTTP status only, never the response body', async () => {
    await expect(listSecretNames({ fetchFn: fake([], { failAt: 'api' }).fn })).rejects.toThrow('Secret Manager answered 403');
    await expect(listSecretNames({ fetchFn: fake([], { failAt: 'api' }).fn })).rejects.not.toThrow(/SECRET DETAIL/);
    await expect(listSecretNames({ fetchFn: fake([], { failAt: 'metadata' }).fn })).rejects.toThrow('metadata server answered 404');
  });
});

describe('env-parity.mjs secrets', () => {
  it('exits 2 UNKNOWN, never OK, when it cannot reach Secret Manager (here: no metadata server)', async () => {
    const r = await new Promise(done => {
      execFile('node', [resolve('scripts/env-parity.mjs'), 'secrets', '1,2'], { env: { PATH: process.env.PATH, PARITY_METADATA_TIMEOUT_MS: '300' }, encoding: 'utf8' }, (err, stdout) => done({ status: err ? Number(err.code ?? 1) : 0, out: stdout }));
    });
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/^secrets: UNKNOWN \(cannot list the secrets: /);
  });
});
