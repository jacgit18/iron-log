// Checks the CI definitions locally, so a broken workflow is found before the push instead of in a red run.
// Usage: node scripts/check-workflows.mjs
// Runs actionlint when it is installed (the full check). Otherwise it parses every .github/workflows and .github/actions YAML file and
// .github/pr-kit.json, which catches a syntax error but not a bad expression or unknown key. The YAML parser is `yaml`, which is in the tree
// through another package (not a direct dependency); if it cannot be loaded the YAML step is reported as not run and this exits 1.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const yamlFiles = dir => !existsSync(dir) ? [] : readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? yamlFiles(p) : /\.ya?ml$/.test(n) ? [p] : [];
});
const files = [...yamlFiles('.github/workflows'), ...yamlFiles('.github/actions')];
let bad = 0;

if (spawnSync('actionlint', ['-version'], { stdio: 'ignore' }).status === 0) {
  console.log('actionlint');
  if (spawnSync('actionlint', { stdio: 'inherit' }).status !== 0) bad++;
} else {
  let parse;
  try { parse = (await import('yaml')).parse; } catch { /* reported below */ }
  if (!parse) {
    console.error('Not run: neither actionlint nor the yaml package is available, so the workflow files were not checked.');
    process.exit(1);
  }
  for (const f of files) {
    try { parse(readFileSync(f, 'utf8')); console.log(`ok ${f}`); } catch (e) { console.error(`${f}: ${e.message}`); bad++; }
  }
}
if (existsSync('.github/pr-kit.json')) {
  try { JSON.parse(readFileSync('.github/pr-kit.json', 'utf8')); console.log('ok .github/pr-kit.json'); } catch (e) { console.error(`.github/pr-kit.json: ${e.message}`); bad++; }
}
// Every job needs a timeout (ci-budget.md); the same script runs in .github/workflows/ci-timeouts.yml.
if (spawnSync('node', ['scripts/ci-timeouts.mjs'], { stdio: 'inherit' }).status !== 0) bad++;
process.exit(bad ? 1 : 0);
