// Guards scripts/unit-tests.mjs: which unit tests a change runs, and that the board reorder and log write path tests are never left out.
import { describe, expect, it } from 'vitest';
import { PROTECTED, plan } from './unit-tests.mjs';

describe('unit-tests plan', () => {
  it('runs the tests related to a changed source file and always the protected ones', () => {
    const p = plan(['src/lib/logic.ts', 'scripts/pr-body.mjs', 'README.md']);
    expect(p.full).toBe(false);
    expect(p.related).toEqual(expect.arrayContaining(['src/lib/logic.ts', 'scripts/pr-body.mjs', ...PROTECTED]));
    expect(p.related).not.toContain('README.md');
  });

  it.each(['scripts/prod-db.sh', 'scripts/deploy-cloud-run.sh', '.github/pull_request_template.md', 'src/gone-file.ts'])('runs every test when %s changes (tests read it without importing it, or it was deleted)', f => {
    expect(plan([f]).full).toBe(true);
  });

  it('still runs the protected tests when nothing related changed', () => {
    expect(plan(['README.md']).related).toEqual(PROTECTED);
  });

  it.each(['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.js', '.oxlintrc.json', 'src/test/setup.ts'])('runs every test when %s changes', f => {
    expect(plan(['src/lib/logic.ts', f]).full).toBe(true);
  });
});
