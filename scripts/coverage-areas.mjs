// The logic areas the coverage gate covers (ADR 069), one entry per area, so the floor and the cap cannot drift apart: vite.config.js builds
// coverage.thresholds from `floor`, scripts/coverage-report.mjs builds CAPS from `cap`. A floor is a point or two under what the area measured
// on 2026-10-23 (statements and branches); raise it in the PR that earns it. A cap is how many files no test loads the area may have
// (Vitest 5's v8 provider reports such a file as 0 statements, so no floor sees it); it only goes down, and `--check` fails if it is too high.
// src/components has no entry: the UI is covered by Playwright until the component-test decision.
export const AREAS = {
  server: { floor: { statements: 92, branches: 86 }, cap: 0 },
  'src/hooks': { cap: 7 },
  'src/lib': { floor: { statements: 93, branches: 88 }, cap: 4 },
  'src/shared': { floor: { statements: 97, branches: 96 }, cap: 0 },
  'src/store': { floor: { statements: 85, branches: 78 }, cap: 0 },
  'src/sync': { floor: { statements: 92, branches: 84 }, cap: 2 },
};

// Files that hold only types or re-exports have no statements even when imported, so they would count as unloaded and a test cannot
// change that. List one here (path from the repo root) instead of raising a cap; `--check` fails on a listed path that is not in the
// coverage summary any more (renamed or deleted). Empty today: every unloaded file has runtime code.
export const NO_STATEMENTS = [];
