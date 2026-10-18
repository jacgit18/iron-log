// Runs the unit tests that a change can affect, instead of all of them: vitest follows imports from the changed files to the tests that load them.
// Usage: node scripts/unit-tests.mjs --base=<ref> [-- <extra vitest args>]   changed files = diff against the merge-base with <ref>
//        node scripts/unit-tests.mjs --files=a,b                              pretend only those files changed
//        add --list to print the vitest command without running it
// Runs the whole suite (npm test) when a tooling or dependency file changed, a file tests read without importing (a .sh script, the PR template) changed, or a module was deleted.
// The board reorder and log write path tests (CLAUDE.md) are always included, so no change can skip them.
// Main and manual CI runs call npm test directly; this is for pull requests and the pre-push check (scripts/check.mjs).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export const PROTECTED = ['src/lib/planOrder.test.js', 'src/lib/logic.test.js', 'src/store/useAppStore.test.js'];
const tooling = f => /^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.js|\.oxlintrc.*|src\/test\/.*)$/.test(f);

// Files a test reads by path rather than imports (a shell script it runs, the PR template it fills), so vitest's import graph cannot link them to their tests.
const readByTests = f => (/^(scripts|tools)\//.test(f) && !/\.(js|jsx|ts|tsx|mjs)$/.test(f)) || f === '.github/pull_request_template.md';
const code = f => /^(src|server|scripts|tools)\//.test(f) && /\.(js|jsx|ts|tsx|mjs)$/.test(f);

export function plan(files) {
  if (files.some(tooling)) return { full: true, why: `${files.find(tooling)} is tooling or a dependency file` };
  const odd = files.find(readByTests);
  if (odd) return { full: true, why: `${odd} is read by tests without importing it` };
  // A deleted module may still be imported by a test, which then fails to load: only a full run shows that.
  const gone = files.find(f => code(f) && !existsSync(f));
  if (gone) return { full: true, why: `${gone} was deleted or renamed` };
  const related = files.filter(code);
  return { full: false, related: [...new Set([...related, ...PROTECTED])] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dash = args.indexOf('--');
  const extra = dash < 0 ? [] : args.slice(dash + 1);
  const opts = dash < 0 ? args : args.slice(0, dash);
  const given = opts.find(a => a.startsWith('--files='));
  const base = opts.find(a => a.startsWith('--base='))?.slice(7);
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).split('\n').filter(Boolean);
  let files;
  if (given) files = given.slice(8).split(',');
  else if (base) files = [...new Set([...git('diff', '--name-only', git('merge-base', 'HEAD', base)[0]), ...git('ls-files', '--others', '--exclude-standard')])];
  else { console.error('Pass --base=<ref> or --files=a,b'); process.exit(2); }

  const p = plan(files);
  const cmd = p.full ? ['vitest', 'run', ...extra] : ['vitest', 'related', '--run', '--passWithNoTests', ...p.related, ...extra];
  console.log(p.full ? `${p.why}: running every unit test.` : `Unit tests related to ${p.related.length - PROTECTED.length} changed source file(s), plus the ${PROTECTED.length} protected board and log tests.`);
  if (opts.includes('--list')) { console.log(`npx ${cmd.join(' ')}`); process.exit(0); }
  process.exit(spawnSync('npx', cmd, { stdio: 'inherit' }).status ?? 1);
}
