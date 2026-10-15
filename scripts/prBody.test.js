import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBody, inferAudience } from './pr-body.mjs';

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
const ticked = body => body.split('\n').filter(l => /^- \[x\]/i.test(l));

describe('inferAudience', () => {
  it('is n/a when nothing a user can see changed', () => {
    expect(inferAudience(['README.md', 'e2e/board.spec.js', 'scripts/check.mjs', '.github/workflows/test.yml', 'src/lib/logic.test.js']).audience).toBe('na');
  });
  it('is admin when an admin-only entry is added or the admin guard changes', () => {
    expect(inferAudience(['src/features.ts', 'src/App.tsx'], "+  webPush: 'admin', // Push alerts").audience).toBe('admin');
    expect(inferAudience(['server/admin.ts']).audience).toBe('admin');
    expect(inferAudience(['src/features.ts'], "+  webPush: 'all',").audience).toBe('everyone'); // releasing a feature is not adding an admin one
  });
  it('is everyone for any other source change, and never n/a for an empty diff', () => {
    expect(inferAudience(['src/App.tsx', 'CHANGELOG.md']).audience).toBe('everyone');
    expect(inferAudience([]).audience).toBe('everyone');
  });
});

describe('buildBody', () => {
  it.each([['na', 'n/a:'], ['admin', 'Admin only'], ['everyone', 'Everyone']])('ticks exactly the %s box', (audience, text) => {
    const t = ticked(buildBody(template, audience));
    expect(t).toHaveLength(1);
    expect(t[0]).toContain(text);
  });
  it('keeps a $ in the description as typed', () => {
    expect(buildBody(template, 'na', 'Costs $& and $1 less.')).toContain('Costs $& and $1 less.');
  });
  it('puts the description under What and why', () => {
    expect(buildBody(template, 'everyone', 'Fixes the thing.')).toMatch(/## What and why\n\nFixes the thing\.\n/);
  });
});
