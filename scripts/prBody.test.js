import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBody, inferAudience, labelsOf, loadConfig, shorten, touchesUi } from './pr-body.mjs';

const projectTemplate = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
const template = `## What and why


## Audience (user-facing changes)

<!-- Tick exactly one. -->

- [ ] n/a: no user-facing change
- [ ] **Admin only**: flag
- [ ] **Paid subscribers**: flag
- [ ] **Everyone**: released

## Changelog

<!-- One or two sentences. -->

## Checks

- [ ] tests
- [ ] UI change: \`node scripts/lighthouse.mjs --check\` run (n/a otherwise)
`;
// This file is the same in every project, so it tests the script with its own template and config; the project's real config is checked against its real template below.
const config = {
  ...loadConfig('/nonexistent'),
  audiences: loadConfig().audiences, // the real rules: the tests below pin what they do and do not match
  ui: loadConfig().ui,
  notUserFacing: loadConfig().notUserFacing,
  autoTickWhenNoUi: 'lighthouse\\.mjs',
};
const features = text => ({ 'src/features.ts': text });
// The ticked boxes under Audience (the part the CI check counts).
const ticked = body => (body.match(/## Audience[\s\S]*?(?=\n## |$)/) || [''])[0].split('\n').filter(l => /^- \[x\]/i.test(l));

describe('inferAudience', () => {
  it('is n/a when nothing a user can see changed', () => {
    expect(inferAudience(['README.md', 'e2e/board.spec.js', 'scripts/check.mjs', '.github/workflows/test.yml', '.githooks/pre-push', 'src/lib/logic.test.js'], {}, config).audience).toBe('na');
  });
  it('is paid when a paid-subscriber entry is added, and a paid entry wins over an admin one', () => {
    expect(inferAudience(['src/features.ts', 'src/App.tsx'], features("+  coach: 'paid', // Coaching notes"), config).audience).toBe('paid');
    expect(inferAudience(['src/features.ts'], features("+  a: 'admin',\n+  b: 'paid',"), config).audience).toBe('paid');
    expect(inferAudience(['src/features.ts'], features("+  coach: 'all',"), config).audience).toBe('everyone'); // releasing it is not adding one
    expect(inferAudience(['server/plan.ts', 'src/features.ts'], {}, config).audience).toBe('everyone'); // the flag's own plumbing is not a paid feature
  });
  it('is admin when an admin-only entry is added or the admin guard changes', () => {
    expect(inferAudience(['src/features.ts', 'src/App.tsx'], features("+  webPush: 'admin', // Push alerts"), config).audience).toBe('admin');
    expect(inferAudience(['server/admin.ts'], {}, config).audience).toBe('admin');
    expect(inferAudience(['src/features.ts'], features("+  webPush: 'all',"), config).audience).toBe('everyone'); // releasing a feature is not adding an admin one
  });
  it('is not admin or paid for a reworded comment or doc line that only contains the word', () => {
    expect(inferAudience(['src/features.ts'], features("+     'admin' - only an account on the list sees it"), config).audience).toBe('everyone');
    expect(inferAudience(['src/features.ts'], features("+  // note: 'admin' entries need requireAdmin"), config).audience).toBe('everyone');
    expect(inferAudience(['src/features.ts'], features("+   see: 'paid' plans"), config).audience).toBe('everyone');
    expect(inferAudience(['src/features.ts', 'src/App.tsx'], features("+  newThing: 'admin'"), config).audience).toBe('admin'); // last entry, no comma or comment
  });
  it('is everyone for any other source change, and never n/a for an empty diff', () => {
    expect(inferAudience(['src/App.tsx', 'CHANGELOG.md'], {}, config).audience).toBe('everyone');
    expect(inferAudience([], {}, config).audience).toBe('everyone');
  });
});

describe('a build config change', () => {
  // vite.config can change the bundle and so the Lighthouse score and what loads: it is not "nothing a user can see" (n/a), it is Everyone with the Lighthouse line left to the author.
  it('is not n/a and counts as UI', () => {
    expect(inferAudience(['vite.config.js'], {}, config).audience).toBe('everyone');
    expect(touchesUi(['vite.config.js'], config)).toBe(true);
    expect(inferAudience(['playwright.config.js'], {}, config).audience).toBe('na');
  });
});

describe('buildBody', () => {
  it.each([['na', 'n/a:'], ['admin', 'Admin only'], ['paid', 'Paid subscribers'], ['everyone', 'Everyone']])('ticks exactly the %s box', (audience, text) => {
    const t = ticked(buildBody(template, audience, '', false, '', config));
    expect(t).toHaveLength(1);
    expect(t[0]).toContain(text);
  });
  it('keeps a $ in the description as typed', () => {
    expect(buildBody(template, 'na', 'Costs $& and $1 less.', false, '', config)).toContain('Costs $& and $1 less.');
  });
  it('puts the description under What and why', () => {
    expect(buildBody(template, 'everyone', 'Fixes the thing.', false, '', config)).toMatch(/## What and why\n\nFixes the thing\.\n/);
  });
});

describe('the Lighthouse line', () => {
  it('is ticked for a change that touches no UI and left for the author on a UI change', () => {
    expect(buildBody(template, 'na', '', false, '', config)).toMatch(/- \[x\].*lighthouse\.mjs/);
    expect(buildBody(template, 'everyone', '', true, '', config)).toMatch(/- \[ \].*lighthouse\.mjs/);
  });
  it('knows what touches the UI', () => {
    expect(touchesUi(['src/components/board/Card.tsx'], config)).toBe(true);
    expect(touchesUi(['src/styles.css'], config)).toBe(true);
    expect(touchesUi(['public/icon.png'], config)).toBe(true);
    for (const f of ['src/fonts.ts', 'src/sw.ts', 'src/features.ts', 'vite.config.js']) expect(touchesUi([f], config), f).toBe(true);
    expect(touchesUi(['server/app.ts', 'src/lib/logic.ts', 'scripts/check.mjs'], config)).toBe(false);
  });
});

describe('the Changelog section', () => {
  it('is filled from --what, or from --changelog when given, and keeps the hint comment', () => {
    expect(buildBody(template, 'na', 'Does the thing.', false, '', config)).toMatch(/## Changelog\n\n<!--[\s\S]*?-->\nDoes the thing\.\n/);
    expect(buildBody(template, 'na', 'Long what.', false, 'Short entry.', config)).toMatch(/## Changelog[\s\S]*?-->\nShort entry\.\n/);
  });
  it('stays empty when nothing is given, so the check can fail it', () => {
    expect(buildBody(template, 'na', '', false, '', config)).not.toMatch(/## Changelog[\s\S]*?-->\n\S/);
  });
});

describe('the project config', () => {
  it('has one Audience box in the template for every audience it can pick', () => {
    const real = loadConfig();
    const box = (body, label) => (body.match(/## Audience[\s\S]*?(?=\n## |$)/) || [''])[0].split('\n').filter(l => /^- \[ \]/.test(l) && l.includes(label));
    for (const label of Object.values(labelsOf(real))) expect(box(projectTemplate, label), label).toHaveLength(1);
  });
  it('picks n/a for a docs-only change and an audience from the config otherwise', () => {
    expect(inferAudience(['README.md']).audience).toBe('na');
    expect(['everyone', ...loadConfig().audiences.map(a => a.key)]).toContain(inferAudience(['src/App.tsx']).audience);
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
