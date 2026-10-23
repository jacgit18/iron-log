import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXIT, classify, migrationFiles, versionOf } from './lib/migration-state.mjs';

// The pure part of the parity report: which versions a folder holds, and how a database compares with main.
describe('migrationFiles and versionOf', () => {
  it('keeps <digits>_<name>.sql in order and ignores everything else', () => {
    expect(migrationFiles(['20261002_b.sql', 'README.md', '20261001_a.sql', '.keep', 'x_1.sql'])).toEqual(['20261001_a.sql', '20261002_b.sql']);
    expect(versionOf('20261014000001_grocery.sql')).toBe('20261014000001');
  });
});

describe('classify', () => {
  it('is OK when the versions match, whatever the order', () => {
    expect(classify(['1', '2'], new Set(['2', '1']))).toMatchObject({ status: 'OK', code: EXIT.OK, behind: [], ahead: [] });
  });
  it('is BEHIND, naming what the database lacks', () => {
    expect(classify(['1', '2', '3'], new Set(['1']))).toMatchObject({ status: 'BEHIND', code: 3, behind: ['2', '3'] });
  });
  it('is AHEAD when the database has a version main lacks, and ahead wins over behind', () => {
    expect(classify(['1'], new Set(['1', '9']))).toMatchObject({ status: 'AHEAD', code: 4, ahead: ['9'] });
    expect(classify(['1', '2'], new Set(['1', '9']))).toMatchObject({ status: 'AHEAD', code: 4, behind: ['2'], ahead: ['9'] });
  });
  it('compares versions as text, so a number read from the database matches the file name', () => {
    expect(classify(['20261014000001'], new Set([20261014000001])).status).toBe('OK');
  });
});

describe('the report reads and never writes', () => {
  it('the only SQL in the shared module and the job entry is one select on schema_migrations', () => {
    for (const f of ['scripts/lib/migration-state.mjs', 'scripts/env-parity.mjs']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(insert|update|delete|create|alter|drop|grant|truncate)\s+(into|table|role|from|database|schema)\b/i);
    }
    expect(readFileSync('scripts/lib/migration-state.mjs', 'utf8').match(/client\.query\(/g)).toHaveLength(1);
    expect(readFileSync('scripts/lib/migration-state.mjs', 'utf8')).toContain("client.query('select version from schema_migrations')");
  });
});
