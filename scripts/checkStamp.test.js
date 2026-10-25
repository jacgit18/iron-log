import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeStamp, ticksFrom } from './lib/check-stamp.mjs';
import { buildBody, loadConfig } from './pr-body.mjs';

const HEAD = 'a'.repeat(40);
const rules = [
  { line: 'npm run typecheck && npm test', needs: ['typecheck', 'test', 'lint', 'build|e2e'] },
  { line: 'npm run e2e`', needs: ['e2e'] },
];
const full = ['typecheck', 'lint', 'test', 'build', 'e2e'];
const stamp = (over = {}) => makeStamp({ head: HEAD, dirty: false, ran: full, ...over });

describe('makeStamp', () => {
  it('records related-only unit tests as test:related, never as the full suite', () => {
    expect(stamp({ relatedTests: true }).ran).toContain('test:related');
    expect(stamp({ relatedTests: true }).ran).not.toContain('test');
    expect(stamp().ran).toContain('test');
  });
});

describe('ticksFrom', () => {
  it('ticks the boxes whose checks all ran for this commit on a clean tree', () => {
    expect(ticksFrom(stamp(), HEAD, rules).lines).toEqual(rules.map(r => r.line));
  });
  it('takes either check of an "a|b" need', () => {
    expect(ticksFrom(stamp({ ran: ['typecheck', 'test', 'lint', 'e2e'] }), HEAD, rules).lines).toEqual(rules.map(r => r.line));
    expect(ticksFrom(stamp({ ran: ['typecheck', 'test', 'lint'] }), HEAD, rules).lines).toEqual([]);
  });
  it('leaves a box open when one of its checks did not run, and says so', () => {
    const r = ticksFrom(stamp({ ran: ['typecheck', 'lint', 'test'] }), HEAD, rules);
    expect(r.lines).toEqual([]);
    expect(r.note).toMatch(/2 stay open/);
  });
  it('does not count related-only unit tests as the full suite, but still backs the e2e box', () => {
    expect(ticksFrom(stamp({ relatedTests: true }), HEAD, rules).lines).toEqual(['npm run e2e`']);
  });
  it('ticks nothing without a stamp, for another commit, or after a dirty run', () => {
    expect(ticksFrom(null, HEAD, rules).lines).toEqual([]);
    expect(ticksFrom(stamp(), 'b'.repeat(40), rules).lines).toEqual([]);
    expect(ticksFrom(stamp({ dirty: true }), HEAD, rules).lines).toEqual([]);
  });
  it('does nothing for a project with no rules', () => {
    expect(ticksFrom(stamp(), HEAD, [])).toEqual({ lines: [], note: '' });
  });
});

describe('buildBody with verified lines', () => {
  const template = `## Audience

- [ ] n/a: no user-facing change
- [ ] **Everyone**: released

## Changelog

## Checks

- [ ] \`npm run typecheck && npm test && npm run lint\`
- [ ] \`npm run e2e\`
- [ ] something only a person can tick
`;
  const config = { ...loadConfig('/nonexistent') };
  it('ticks only the Checks lines it is given, and never the others', () => {
    const body = buildBody(template, 'na', '', true, '', config, {}, ['npm run typecheck && npm test']);
    expect(body).toMatch(/- \[x\] `npm run typecheck && npm test/);
    expect(body).toMatch(/- \[ \] `npm run e2e`/);
    expect(body).toMatch(/- \[ \] something only a person/);
  });
  it('does not touch the Audience boxes when a verified pattern would match them', () => {
    const body = buildBody(template, 'na', '', true, '', config, {}, ['released']);
    expect(body).toMatch(/- \[ \] \*\*Everyone\*\*/);
  });
});

describe('the project config against the real template', () => {
  const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
  const { autoTickFromCheck } = loadConfig();
  it('each rule matches exactly one open Checks line, so a reworded template cannot silently stop the ticking', () => {
    const checks = template.split('## Checks')[1].split('\n').filter(l => /^- \[ \]/.test(l));
    for (const r of autoTickFromCheck) expect(checks.filter(l => new RegExp(r.line).test(l)), r.line).toHaveLength(1);
  });
});
