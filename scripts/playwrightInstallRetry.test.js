import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOWS = '.github/workflows';
const ACTION = '.github/actions/install-chromium/action.yml';

describe('the Chromium install for Playwright', () => {
  it('goes through the retrying action in every workflow, never a bare `playwright install`', () => {
    const bare = readdirSync(WORKFLOWS)
      .filter(f => /\.ya?ml$/.test(f))
      .filter(f => /^\s*-?\s*run:.*playwright install/m.test(readFileSync(join(WORKFLOWS, f), 'utf8')));
    expect(bare, 'use `uses: ./.github/actions/install-chromium` (a stuck apt mirror took 10 minutes on 2026-10-26)').toEqual([]);
  });

  it('cuts off a stuck first attempt and tries once more', () => {
    const action = readFileSync(ACTION, 'utf8');
    expect(action).toMatch(/timeout 90 npx playwright install --with-deps chromium/);
    expect(action).toMatch(/timeout 180 npx playwright install --with-deps chromium/);
    expect(action).toMatch(/::warning::/); // a retry stays visible in the run
    expect(action).toMatch(/dpkg --configure -a/); // a first attempt killed during unpack leaves dpkg half done
  });

  it('is used by the three jobs that run a browser', () => {
    const used = readdirSync(WORKFLOWS).filter(f => readFileSync(join(WORKFLOWS, f), 'utf8').includes('./.github/actions/install-chromium'));
    expect(used.sort()).toEqual(['screenshots.yml', 'test.yml']);
  });
});
