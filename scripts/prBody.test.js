import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBody, inferAudience, shorten, touchesUi } from './pr-body.mjs';

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
// The ticked boxes under Audience (the part the CI check counts).
const ticked = body => (body.match(/## Audience[\s\S]*?(?=\n## |$)/) || [''])[0].split('\n').filter(l => /^- \[x\]/i.test(l));

describe('inferAudience', () => {
  it('is n/a when nothing a user can see changed', () => {
    expect(inferAudience(['README.md', 'e2e/board.spec.js', 'scripts/check.mjs', '.github/workflows/test.yml', '.githooks/pre-push', 'src/lib/logic.test.js']).audience).toBe('na');
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

describe('the Lighthouse line', () => {
  it('is ticked for a change that touches no UI and left for the author on a UI change', () => {
    expect(buildBody(template, 'na', '', false)).toMatch(/- \[x\].*lighthouse\.mjs/);
    expect(buildBody(template, 'everyone', '', true)).toMatch(/- \[ \].*lighthouse\.mjs/);
  });
  it('knows what touches the UI', () => {
    expect(touchesUi(['src/components/board/Card.tsx'])).toBe(true);
    expect(touchesUi(['src/styles.css'])).toBe(true);
    expect(touchesUi(['vite.config.js'])).toBe(true);
    expect(touchesUi(['server/app.ts', 'src/lib/logic.ts', 'scripts/check.mjs'])).toBe(false);
  });
});

describe('the Changelog section', () => {
  it('is filled from --what, or from --changelog when given, and keeps the hint comment', () => {
    expect(buildBody(template, 'na', 'Does the thing.')).toMatch(/## Changelog\n\n<!--[\s\S]*?-->\nDoes the thing\.\n/);
    expect(buildBody(template, 'na', 'Long what.', false, 'Short entry.')).toMatch(/## Changelog[\s\S]*?-->\nShort entry\.\n/);
  });
  it('stays empty when nothing is given, so the check can fail it', () => {
    expect(buildBody(template, 'na')).not.toMatch(/## Changelog[\s\S]*?-->\n\S/);
  });
});

describe('shorten', () => {
  it('keeps a short text and cuts a long one at a sentence end, never mid-word', () => {
    expect(shorten('One. Two.')).toBe('One. Two.');
    const long = 'First sentence here. ' + 'word '.repeat(200);
    expect(shorten(long)).toBe('First sentence here.');
    const noStop = 'word '.repeat(200);
    const cut = shorten(noStop);
    expect(cut.endsWith('word…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(601);
  });
});
