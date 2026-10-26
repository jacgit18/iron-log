import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = '.github/workflows';
const ACTION = '.github/actions/install-chromium/action.yml';

describe('the Chromium install for Playwright', () => {
  it('goes through the retrying action in every workflow, never a bare `playwright install`', () => {
    const bare = readdirSync(WORKFLOWS)
      .filter(f => /\.ya?ml$/.test(f))
      .filter(f => /^(?!\s*#).*\bplaywright install\b/m.test(readFileSync(join(WORKFLOWS, f), 'utf8'))); // any non-comment line, so a `run: |` block counts too
    expect(bare, 'use `uses: ./.github/actions/install-chromium` (a stuck apt mirror took 10 minutes on 2026-10-26)').toEqual([]);
  });

  it('cuts off a stuck first attempt and tries once more', () => {
    const action = readFileSync(ACTION, 'utf8');
    expect(action).toMatch(/timeout 90 npx playwright install --with-deps chromium/);
    expect(action).toMatch(/timeout 180 npx playwright install --with-deps chromium/);
    expect(action).toMatch(/::warning::/); // a retry stays visible in the run
    expect(action).toMatch(/dpkg --configure -a/); // a first attempt killed during unpack leaves dpkg half done
    expect(action).toMatch(/pkill -x apt-get/); // timeout stops npx, not the apt-get under it, which keeps the dpkg lock
    expect(action.indexOf('pkill -x apt-get')).toBeLessThan(action.indexOf('dpkg --configure -a'));
  });

  it('caches the downloaded .deb files, keyed on the Playwright version, and puts them back before apt runs', () => {
    const action = readFileSync(ACTION, 'utf8');
    expect(action).toMatch(/uses: actions\/cache@v\d+/);
    expect(action).toMatch(/key: .*playwright-\$\{\{ steps\.version\.outputs\.playwright \}\}/);
    expect(action.indexOf('/var/cache/apt/archives/')).toBeGreaterThan(-1);
    // restored files are copied in before the install, the install's downloads are copied out after it
    expect(action.indexOf('playwright-apt-debs/*.deb /var/cache/apt/archives/')).toBeLessThan(action.indexOf('timeout 90 npx'));
    expect(action.indexOf('/var/cache/apt/archives/*.deb ~/.cache/playwright-apt-debs/')).toBeGreaterThan(action.indexOf('npx playwright install --with-deps chromium\n          }\n        }'));
  });

  it('ends with an attempt that has no cutoff, so a slow install passes instead of failing', () => {
    const lines = readFileSync(ACTION, 'utf8').split('\n').filter(l => /npx playwright install --with-deps chromium/.test(l));
    expect(lines).toHaveLength(3);
    expect(lines[2]).not.toMatch(/timeout \d/);
  });

  it('is used by the three jobs that run a browser', () => {
    const used = readdirSync(WORKFLOWS).filter(f => readFileSync(join(WORKFLOWS, f), 'utf8').includes('./.github/actions/install-chromium'));
    expect(used.sort()).toEqual(['screenshots.yml', 'test.yml']);
  });
});
