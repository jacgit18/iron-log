import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INVENTORY, PREFIXES, inventoryNames, toMarkdown } from './secret-inventory.mjs';

// The inventory (scripts/secret-inventory.mjs) must name every secret the deploy scripts and workflows use, so it cannot fall behind the code.
const read = f => readFileSync(f, 'utf8');
const names = inventoryNames();

describe('the secret inventory covers what the code uses', () => {
  it('every Secret Manager name set in the deploy and backup scripts is listed', () => {
    const deploy = read('scripts/deploy-cloud-run.sh');
    const found = new Set();
    for (const m of deploy.matchAll(/^\s*(?:local )?[A-Z_]*SECRET="([a-z0-9-]+)"/gm)) found.add(m[1]);
    for (const m of read('scripts/backup-cloud-run.sh').matchAll(/^SECRET="([a-z0-9-]+)"/gm)) found.add(m[1]);
    expect([...found].length).toBeGreaterThanOrEqual(7); // the regexes still find the names
    const missing = [...found].filter(n => !names.has(n));
    expect(missing, `add these to scripts/secret-inventory.mjs: ${missing.join(', ')}`).toEqual([]);
  });
  it('every {prefix}-name the deploy script builds is listed for each environment that gets it', () => {
    const suffixes = new Set([...read('scripts/deploy-cloud-run.sh').matchAll(/\$\{SECRET_PREFIX\}-([a-z0-9-]+)/g)].map(m => m[1].replace(/-$/, '')));
    expect(suffixes.size).toBeGreaterThanOrEqual(8);
    for (const s of suffixes) {
      if (s === 'stripe') continue; // "${SECRET_PREFIX}-stripe-" is a prefix in a message; the four stripe names are checked by name
      const hit = INVENTORY.some(e => e.name === `{p}-${s}`);
      expect(hit, `${s}: add "{p}-${s}" to scripts/secret-inventory.mjs`).toBe(true);
    }
  });
  it('every GitHub secret a workflow reads is listed', () => {
    const files = [];
    const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.ya?ml$/.test(e.name)) files.push(p); } };
    walk('.github');
    const used = new Set(files.flatMap(f => [...read(f).matchAll(/secrets\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1])));
    used.delete('GITHUB_TOKEN');
    expect(used.size).toBeGreaterThanOrEqual(3);
    const missing = [...used].filter(n => !names.has(n));
    expect(missing, `add these to scripts/secret-inventory.mjs: ${missing.join(', ')}`).toEqual([]);
  });
  it('lists the production owner URL secret that prod-db.sh fetches', () => {
    const m = read('scripts/prod-db.sh').match(/PROD_URL_SECRET:-([a-z0-9-]+)\}/);
    expect(m?.[1]).toBeTruthy();
    expect(names.has(m[1])).toBe(true);
  });
});

describe('the inventory itself', () => {
  it('has a unique name per entry, a place, a user and a rotation line, and never a value', () => {
    const all = INVENTORY.map(e => e.name);
    expect(new Set(all).size).toBe(all.length);
    for (const e of INVENTORY) {
      expect(['SM', 'GH', 'LOCAL'], e.name).toContain(e.where);
      expect(e.usedBy.length, e.name).toBeGreaterThan(5);
      expect(e.rotate.length, e.name).toBeGreaterThan(5);
      expect(`${e.usedBy} ${e.rotate} ${e.note}`, e.name).not.toMatch(/postgres(ql)?:\/\/|sk_(live|test)_|whsec_/);
    }
    expect(Object.keys(PREFIXES)).toEqual(['production', 'staging', 'qa']);
  });
  it('prints a markdown table with one row per entry', () => {
    const lines = toMarkdown().split('\n');
    expect(lines).toHaveLength(INVENTORY.length + 2);
    expect(lines[0]).toContain('Last rotated');
  });
});
