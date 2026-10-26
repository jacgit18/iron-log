import { describe, expect, it } from 'vitest';
import { planChecks } from './lib/check-plan.mjs';

const names = files => [...planChecks(files).checks.keys()].sort();

describe('planChecks', () => {
  it('runs nothing for docs and repo metadata', () => {
    expect(names(['.github/CODEOWNERS', 'docs/a.txt'])).toEqual([]);
  });
  it('lints README.md and SETUP.md, which carry a generated table of contents', () => {
    expect(names(['README.md'])).toEqual(['lint']);
    expect(names(['SETUP.md'])).toEqual(['lint']);
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

describe('planChecks e2eSpecs', () => {
  const specs = files => planChecks(files).e2eSpecs;
  it('runs only the changed specs when specs are the only reason for the browser tests', () => {
    expect(specs(['e2e/board.spec.js', 'e2e/layout.spec.js'])).toEqual(['e2e/board.spec.js', 'e2e/layout.spec.js']);
  });
  it('runs the whole suite when app code, a style or tooling changed too', () => {
    for (const other of ['src/lib/logic.ts', 'src/styles.css', 'public/icon.png', 'package.json']) {
      expect(specs(['e2e/board.spec.js', other]), other).toBeNull();
    }
  });
  it('runs the whole suite for a fixture, a helper, a deleted spec or the accounts specs', () => {
    for (const f of ['e2e/fixtures.js', 'e2e/gone.spec.js', 'e2e-accounts/a.spec.js']) expect(specs([f]), f).toBeNull();
  });
  it('is null when the browser tests are not planned or --all asks for everything', () => {
    expect(specs(['tools/x.mjs'])).toBeNull();
    expect(planChecks([], true).e2eSpecs).toBeNull();
  });
});
