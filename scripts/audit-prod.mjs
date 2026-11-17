// `npm audit --omit=dev --audit-level=high`, minus the advisories listed in EXCEPTIONS (each with why and when to drop it).
// Fails (exit 1) on any other high or critical advisory. Run in CI by .github/workflows/dependency-scan.yml.
import { spawnSync } from 'node:child_process';

const EXCEPTIONS = {
  // picomatch <= 4.0.7, no patched release as of 2026-11-17. It reaches the lockfile only as vite/vitest tooling, through better-auth's optional
  // vitest peer, so `--omit=dev` still scans it; the runtime image copies only dist and dist-server. Remove this entry once picomatch publishes a fix.
  'GHSA-fc5q-39xc-vjpf': 'picomatch ReDoS in build and test tooling, not in the runtime image',
};

const run = spawnSync('npm', ['audit', '--omit=dev', '--audit-level=high', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try { report = JSON.parse(run.stdout); } catch { console.error(`npm audit gave no readable report (exit ${run.status}): ${run.stderr.slice(0, 500)}`); process.exit(1); }
if (report.error) { console.error(`npm audit failed: ${report.error.summary ?? 'unknown error'}`); process.exit(1); }

const bad = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = String(via.url ?? '').split('/').pop() ?? '';
    if (id in EXCEPTIONS) { console.log(`allowed: ${id} (${name}): ${EXCEPTIONS[id]}`); continue; }
    bad.push(`${name}: ${via.severity} ${via.title} ${via.url}`);
  }
}
if (bad.length) { console.error(`High or critical advisories in production dependencies:\n${[...new Set(bad)].join('\n')}`); process.exit(1); }
console.log('No high or critical advisory in production dependencies beyond the allowed ones.');
