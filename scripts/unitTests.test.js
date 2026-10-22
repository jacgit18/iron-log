// Guards scripts/unit-tests.mjs: which unit tests a change runs, and that the board reorder and log write path tests are never left out.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PROTECTED, TEXT_READERS, plan, workerArgs } from './unit-tests.mjs';

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

  it('still runs the protected tests and the source-reading tests when nothing related changed', () => {
    expect(plan(['README.md']).related).toEqual([...PROTECTED, ...TEXT_READERS]);
  });

  it('a change to the push payload runs the privacy policy test, which reads it as text (PR #457 broke main this way)', () => {
    expect(plan(['server/push/cloudTasks.ts']).related).toContain('server/legal.test.ts');
  });

  it('the source-reading tests exist, and every test that reads a repo source file by path is listed (or is a workflow or fixture reader)', () => {
    for (const f of TEXT_READERS) expect(existsSync(f), f).toBe(true);
    // legal.test.ts reads src/ and server/ files by path; if another test starts doing that, list it in TEXT_READERS.
    expect(readFileSync('server/legal.test.ts', 'utf8')).toMatch(/read\('server\/push\/cloudTasks\.ts'\)/);
  });

  it.each(['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.js', '.oxlintrc.json', 'src/test/setup.ts'])('runs every test when %s changes', f => {
    expect(plan(['src/lib/logic.ts', f]).full).toBe(true);
  });
});

describe('unit-tests worker cap', () => {
  it('uses UNIT_WORKERS when it is a positive number', () => {
    expect(workerArgs({ UNIT_WORKERS: '3' }, 12, [])).toEqual(['--maxWorkers=3']);
    expect(workerArgs({ UNIT_WORKERS: '3', CI: 'true' }, 12, [])).toEqual(['--maxWorkers=3']);
  });
  it('defaults to half the cores, at least 2, off CI', () => {
    expect(workerArgs({}, 12, [])).toEqual(['--maxWorkers=6']);
    expect(workerArgs({}, 2, [])).toEqual(['--maxWorkers=2']);
    expect(workerArgs({ UNIT_WORKERS: 'many' }, 8, [])).toEqual(['--maxWorkers=4']);
    expect(workerArgs({ UNIT_WORKERS: '0' }, 8, [])).toEqual(['--maxWorkers=4']);
  });
  it('leaves Vitest alone on CI, and when the caller passed its own worker flag', () => {
    expect(workerArgs({ CI: 'true' }, 12, [])).toEqual([]);
    expect(workerArgs({}, 12, ['--maxWorkers=1'])).toEqual([]);
    expect(workerArgs({ UNIT_WORKERS: '4' }, 12, ['--pool=forks'])).toEqual([]);
  });
});
