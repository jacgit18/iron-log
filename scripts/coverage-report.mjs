// Prints the coverage per area from coverage/coverage-summary.json (written by `npm run coverage`), then lists the files
// no test loaded. Vitest 5's v8 provider reports such a file as 0 statements / 100%, so the percentages cover loaded files only
// and a new file with no tests lowers none of them. `--check` (ADR 069) closes that gap: it exits 1 when a logic area has more
// unloaded files than its cap. The floors on the percentages are in vite.config.js (coverage.thresholds). `--list` prints the names.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Unloaded files allowed per logic area, as of 2026-10-23. A cap only goes down: load a file from a test, then lower its cap.
// src/components has none (the UI is covered by Playwright until the component-test decision).
export const CAPS = { server: 0, 'src/hooks': 7, 'src/lib': 6, 'src/shared': 0, 'src/store': 0, 'src/sync': 2 };

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');

export const area = f => { const p = f.split('/'); return p.length > 2 ? `${p[0]}/${p[1]}` : `${p[0]}/(root)`; };
export const capArea = f => (f.startsWith('server/') ? 'server' : area(f));

// A source file with no statements counted: not loaded by any test (a type-only file has none either, so those are skipped by name).
export const unloadedFiles = entries => entries
  .filter(([f, v]) => v.statements.total === 0 && /\.(tsx?|jsx?)$/.test(f) && !/(^|\/)types?\.ts$/.test(f))
  .map(([f]) => f);

export function overCap(unloaded, caps = CAPS) {
  const counts = {};
  for (const f of unloaded) counts[capArea(f)] = (counts[capArea(f)] ?? 0) + 1;
  return Object.entries(caps).filter(([k, cap]) => (counts[k] ?? 0) > cap).map(([k, cap]) => ({ area: k, cap, count: counts[k] }));
}

function main() {
  const root = `${process.cwd()}/`;
  const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
  const files = Object.entries(summary).filter(([f]) => f !== 'total').map(([f, v]) => [f.replace(root, ''), v]);

  const loaded = new Map();
  for (const [f, v] of files) {
    if (v.statements.total === 0) continue;
    const a = loaded.get(area(f)) ?? { n: 0, s: 0, st: 0, b: 0, bt: 0 };
    a.n++; a.s += v.statements.covered; a.st += v.statements.total; a.b += v.branches.covered; a.bt += v.branches.total;
    loaded.set(area(f), a);
  }
  console.log('\nLoaded by a test (percentages are for these files only)');
  const tot = { s: 0, st: 0, b: 0, bt: 0 };
  for (const [k, a] of [...loaded].sort()) {
    console.log(`  ${k.padEnd(20)} ${String(a.n).padStart(3)} files  ${pct(a.s, a.st).padStart(6)} statements  ${pct(a.b, a.bt).padStart(6)} branches`);
    for (const key of Object.keys(tot)) tot[key] += a[key];
  }
  console.log(`  ${'total'.padEnd(20)} ${' '.repeat(9)}  ${pct(tot.s, tot.st).padStart(6)} statements  ${pct(tot.b, tot.bt).padStart(6)} branches`);

  const lines = f => { try { return readFileSync(f, 'utf8').split('\n').length; } catch { return 0; } };
  const unloaded = unloadedFiles(files);
  const byArea = new Map();
  for (const f of unloaded) { const a = byArea.get(area(f)) ?? { n: 0, l: 0 }; a.n++; a.l += lines(f); byArea.set(area(f), a); }
  console.log(`\nNot loaded by any test, so not in the percentages above (${unloaded.length} files)`);
  for (const [k, a] of [...byArea].sort((x, y) => y[1].l - x[1].l)) console.log(`  ${k.padEnd(20)} ${String(a.n).padStart(3)} files  ${String(a.l).padStart(6)} lines`);
  if (process.argv.includes('--list')) for (const f of unloaded) console.log(`    ${f}`);

  if (process.argv.includes('--check')) {
    const over = overCap(unloaded);
    for (const o of over) console.error(`\n${o.area}: ${o.count} files no test loads, cap is ${o.cap}. Add a test that imports the new file (run with --list to see which).`);
    if (over.length) process.exit(1);
    console.log('\nUnloaded-file caps hold.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
