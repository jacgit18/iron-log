// Prints the coverage per area from coverage/coverage-summary.json (written by `npm run coverage`), then lists the files
// no test loaded. Vitest 5's v8 provider reports such a file as 0 statements / 100%, so the percentages cover loaded files only
// and a new file with no tests lowers none of them. `--check` (ADR 069) closes that gap: it exits 1 when a logic area has more
// unloaded files than its cap, or fewer (the cap is then lowered). The floors on the percentages are in vite.config.js (coverage.thresholds). `--list` prints the names.
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { AREAS } from './coverage-areas.mjs';

// Unloaded files allowed per logic area (scripts/coverage-areas.mjs). A cap only goes down: load a file from a test, then lower its cap.
export const CAPS = Object.fromEntries(Object.entries(AREAS).map(([k, a]) => [k, a.cap]));

// Files that hold only types or re-exports have no statements even when imported, so they would count as unloaded and a test cannot
// change that. List one here (path from the repo root) instead of raising a cap. Empty today: every unloaded file has runtime code.
export const NO_STATEMENTS = [];

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');

export const area = f => { const p = f.split('/'); return p.length > 2 ? `${p[0]}/${p[1]}` : `${p[0]}/(root)`; };
export const capArea = f => (f.startsWith('server/') ? 'server' : area(f));

// A source file with no statements counted: not loaded by any test (a type-only file has none either, so those are skipped by name).
export const unloadedFiles = (entries, skip = NO_STATEMENTS) => entries
  .filter(([f, v]) => v.statements.total === 0 && /\.(tsx?|jsx?)$/.test(f) && !/(^|\/)types?\.ts$/.test(f) && !skip.includes(f))
  .map(([f]) => f);

function countByArea(unloaded) {
  const counts = {};
  for (const f of unloaded) counts[capArea(f)] = (counts[capArea(f)] ?? 0) + 1;
  return counts;
}

// Areas with more unloaded files than their cap: a new file has no test.
export function overCap(unloaded, caps = CAPS) {
  const counts = countByArea(unloaded);
  return Object.entries(caps).filter(([k, cap]) => (counts[k] ?? 0) > cap).map(([k, cap]) => ({ area: k, cap, count: counts[k] }));
}

// Areas with fewer unloaded files than their cap: tests now load files the cap still allows, and that slack would let new untested
// files in later. --check fails on it so the cap is lowered in the same PR ("a cap only goes down").
export function underCap(unloaded, caps = CAPS) {
  const counts = countByArea(unloaded);
  return Object.entries(caps).filter(([k, cap]) => (counts[k] ?? 0) < cap).map(([k, cap]) => ({ area: k, cap, count: counts[k] ?? 0 }));
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
    const under = underCap(unloaded);
    for (const o of over) console.error(`\n${o.area}: ${o.count} files no test loads, cap is ${o.cap}. Add a test that imports the new file (run with --list to see which), or list it in NO_STATEMENTS if it holds only types or re-exports.`);
    for (const u of under) console.error(`\n${u.area}: only ${u.count} files no test loads, cap is ${u.cap}. Lower the cap of '${u.area}' to ${u.count} in scripts/coverage-areas.mjs so the slack cannot be refilled.`);
    if (over.length || under.length) process.exit(1);
    console.log('\nUnloaded-file caps hold.');
  }
}

// realpath: node leaves argv[1] as typed while import.meta.url is the real path, so through a symlinked directory the two differ and main()
// would silently never run, passing --check without checking anything.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
