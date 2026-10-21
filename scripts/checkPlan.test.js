import { describe, expect, it } from 'vitest';
import { planChecks } from './lib/check-plan.mjs';

const names = files => [...planChecks(files).checks.keys()].sort();

describe('planChecks', () => {
  it('runs nothing for docs and repo metadata', () => {
    expect(names(['README.md', '.github/CODEOWNERS', 'docs/a.txt'])).toEqual([]);
  });
  it('checks a workflow, an action or pr-kit.json (no longer treated as docs)', () => {
    expect(names(['.github/workflows/test.yml'])).toEqual(['workflows']);
    expect(names(['.github/actions/deploy-candidate/action.yml'])).toEqual(['workflows']);
    expect(names(['.github/pr-kit.json'])).toEqual(['lint', 'test', 'workflows']);
  });
  it('runs the browser tests (which build the app) for public/ and index.html, as CI does', () => {
    for (const f of ['public/icon.png', 'index.html', 'src/lib/logic.ts']) {
      const n = names([f]);
      expect(n, f).toContain('e2e');
      expect(n, f).not.toContain('build');
      expect(n, f).toContain('lint');
    }
  });
  it('does not run the browser tests for a helper tool', () => {
    expect(names(['tools/x.mjs'])).not.toContain('e2e');
  });
  it('runs everything for tooling or an unknown file', () => {
    expect(planChecks(['package.json']).fullTests).toBe(true);
    expect(names(['mystery.bin'])).toEqual(expect.arrayContaining(['typecheck', 'test', 'lint', 'e2e', 'workflows']));
  });
});
