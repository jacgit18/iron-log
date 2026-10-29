import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { connectHost, guardHost, productionUrl } from './lib/db-script.mjs';

// The guard also asks DNS whether two names are the same machine (audit S-7). These hosts are made up, so keep the test off the network: no record, no alias.
vi.mock('node:dns/promises', () => ({ resolveCname: () => Promise.reject(new Error('ENOTFOUND')), lookup: () => Promise.reject(new Error('ENOTFOUND')) }));

// Code review R-01 of the QA and staging database scripts: guardHost must refuse production's database however its URL is spelled. The old check compared
// `new URL(url).hostname`, which for a postgres: URL keeps the case and any percent-escapes and ignores a ?host= parameter that the pg driver lets replace the host,
// so each of the forms below passed the guard and then connected to production (qa-db.mjs reset --apply empties user data; staging-db.mjs clear --apply signs everyone out).

// productionUrl() falls back to DATABASE_URL_UNPOOLED in the working directory's .env. A developer's own .env would make "cannot tell production" untrue, so this file never sees one.
const dotenv = vi.hoisted(() => ({ text: null })); // null: no .env; a string: the file's text (a case below)
vi.mock('node:fs', async importOriginal => {
  const real = await importOriginal();
  return {
    ...real,
    existsSync: path => (path === '.env' ? dotenv.text !== null : real.existsSync(path)),
    readFileSync: (path, ...rest) => (path === '.env' && dotenv.text !== null ? dotenv.text : real.readFileSync(path, ...rest)),
  };
});

// productionUrl() also asks Secret Manager (gcloud) for iron-log-prod-owner-url; here gcloud is replaced, so no test reaches a real login.
vi.mock('node:child_process', () => ({ execFileSync: vi.fn(() => { throw new Error('no gcloud'); }) }));

const PROD_HOST = 'ep-cool-123.us-east-2.aws.neon.tech';
const PROD = `postgres://owner:pw@${PROD_HOST}/neondb`;
const OTHER = 'ep-other-9.us-east-2.aws.neon.tech';

// What the script's --host argument would be when the URL is honest.
const refused = async (url, host = connectHost(url) || 'x') => {
  try { await guardHost(url, host, 'QA_DATABASE_URL'); return false; } catch (e) { return e.message.startsWith('exit'); }
};

let saved;
beforeEach(() => {
  saved = process.env.PROD_DATABASE_URL;
  process.env.PROD_DATABASE_URL = PROD;
  delete process.env.PROD_URL_LOOKUP;
  dotenv.text = null;
  vi.spyOn(process, 'exit').mockImplementation(code => { throw new Error(`exit ${code}`); });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  if (saved === undefined) delete process.env.PROD_DATABASE_URL; else process.env.PROD_DATABASE_URL = saved;
});

describe('connectHost', () => {
  it('is the host the pg driver connects to, in one spelling', () => {
    expect(connectHost(`postgres://o:p@${PROD_HOST}/neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${PROD_HOST.toUpperCase()}/neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${PROD_HOST}./neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${PROD_HOST.replaceAll('-', '%2D')}/neondb`)).toBe(PROD_HOST);
    expect(connectHost(`postgres://o:p@${OTHER}/neondb?host=${PROD_HOST}`)).toBe(PROD_HOST); // the ?host= parameter wins in pg, so it wins here
  });
});

describe('guardHost refuses production, however the URL is spelled', () => {
  it.each([
    ['the same host', `postgres://o:p@${PROD_HOST}/neondb`],
    ['the pooled form', 'postgres://o:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb'],
    ['an explicit port', `postgres://o:p@${PROD_HOST}:5432/neondb`],
    ['upper case', `postgres://o:p@${PROD_HOST.toUpperCase()}/neondb`],
    ['an upper case pooled host', 'postgres://o:p@EP-COOL-123-POOLER.US-EAST-2.AWS.NEON.TECH/neondb'],
    ['a trailing dot', `postgres://o:p@${PROD_HOST}./neondb`],
    ['a percent-escaped hyphen', `postgres://o:p@${PROD_HOST.replaceAll('-', '%2D')}/neondb`],
    ['a ?host= parameter on another host', `postgres://o:p@${OTHER}/neondb?host=${PROD_HOST}`],
    ['production in the userinfo and another host after it', `postgres://${PROD_HOST}@${OTHER}/neondb?host=${PROD_HOST}`],
  ])('%s', async (_name, url) => {
    expect(await refused(url)).toBe(true);
  });

  it('also refuses when the typed --host matches production in a different case', async () => {
    expect(await refused(PROD, PROD_HOST.toUpperCase())).toBe(true);
  });

  it('refuses a host that does not match the typed --host (a typo), even when it is not production', async () => {
    expect(await refused(`postgres://o:p@${OTHER}/neondb`, 'ep-another-1.us-east-2.aws.neon.tech')).toBe(true);
  });

  it('refuses a URL with no host the driver can read (a socket path)', async () => {
    expect(await refused('postgres://o:p@%2Fvar%2Frun%2Fpostgresql/neondb', 'x')).toBe(true);
  });

  it('refuses when production cannot be told (nothing set to compare with)', async () => {
    delete process.env.PROD_DATABASE_URL;
    expect(await refused(`postgres://o:p@${OTHER}/neondb`)).toBe(true);
  });
});

describe('guardHost lets another database through', () => {
  it.each([
    ['its own host', `postgres://o:p@${OTHER}/neondb`],
    ['an upper case spelling of its own host', `postgres://o:p@${OTHER.toUpperCase()}/neondb`],
    ['its pooled form', 'postgres://o:p@ep-other-9-pooler.us-east-2.aws.neon.tech/neondb'],
    ['a ?host= parameter that names itself', `postgres://o:p@${OTHER}/neondb?host=${OTHER}`],
  ])('%s', async (_name, url) => {
    expect(await refused(url)).toBe(false);
  });
});

describe('productionUrl: where production\'s URL comes from', () => {
  it('prefers PROD_DATABASE_URL and does not ask gcloud', () => {
    expect(productionUrl()).toBe(PROD);
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it('fetches it from Secret Manager (iron-log-prod-owner-url) when the variable is not set', () => {
    delete process.env.PROD_DATABASE_URL;
    execFileSync.mockReturnValueOnce(`${PROD}\n`);
    expect(productionUrl()).toBe(PROD);
    const [cmd, args] = execFileSync.mock.calls.at(-1);
    expect(cmd).toBe('gcloud');
    expect(args).toEqual(expect.arrayContaining(['secrets', 'versions', 'access', 'latest', '--secret', 'iron-log-prod-owner-url']));
  });
  it('is null, not a throw, when gcloud is missing or signed out and no .env names production', () => {
    delete process.env.PROD_DATABASE_URL;
    expect(productionUrl()).toBeNull();
  });
  it('falls back to the old .env line, and says so on stderr (the same warning prod-db.sh gives)', () => {
    delete process.env.PROD_DATABASE_URL;
    process.env.PROD_URL_LOOKUP = 'off';
    dotenv.text = `OTHER=1\nDATABASE_URL_UNPOOLED="${PROD}"\n`;
    expect(productionUrl()).toBe(PROD);
    const said = console.error.mock.calls.map(c => c.join(' ')).join('\n');
    expect(said).toContain('Warning: using the production URL in .env');
    expect(said).toContain('store-owner-url --apply');
    expect(said).not.toContain('pw@'); // the URL itself is never printed
  });
  it('does not warn when there is no .env line', () => {
    delete process.env.PROD_DATABASE_URL;
    process.env.PROD_URL_LOOKUP = 'off';
    dotenv.text = 'OTHER=1\n';
    expect(productionUrl()).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });
  it('skips the lookup entirely with PROD_URL_LOOKUP=off', () => {
    delete process.env.PROD_DATABASE_URL;
    process.env.PROD_URL_LOOKUP = 'off';
    execFileSync.mockClear();
    expect(productionUrl()).toBeNull();
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('sameServer with a provider\'s shared front name (found 2026-10-23 against real DNS)', () => {
  // Every Neon endpoint of a region is a CNAME to the same regional name; that must not make two endpoints one server.
  const REGION = 'c-6.us-east-2.aws.neon.tech';
  const records = { [`ep-prod-1.${REGION}`]: REGION, [`ep-stage-2.${REGION}`]: REGION, [`ep-qa-3.${REGION}`]: REGION, 'db.example.com': `ep-prod-1.${REGION}` };
  const cname = async h => { if (records[h]) return [records[h]]; throw new Error('ENOTFOUND'); };
  const addrs = async () => [];
  it('treats two endpoints behind the same regional name as different servers', async () => {
    const { sameServer } = await import('./lib/db-script.mjs');
    expect(await sameServer(`ep-prod-1.${REGION}`, `ep-stage-2.${REGION}`, { cname, addrs })).toBe(false);
    expect(await sameServer(`ep-prod-1.${REGION}`, `ep-qa-3.${REGION}`, { cname, addrs })).toBe(false);
  });
  it('still treats the pooled spelling and a real alias of one endpoint as the same server', async () => {
    const { sameServer } = await import('./lib/db-script.mjs');
    expect(await sameServer(`ep-prod-1-pooler.${REGION}`, `ep-prod-1.${REGION}`, { cname, addrs })).toBe(true);
    expect(await sameServer('db.example.com', `ep-prod-1.${REGION}`, { cname, addrs })).toBe(true);
    expect(await sameServer('db.example.com', `ep-stage-2.${REGION}`, { cname, addrs })).toBe(false);
  });
});
