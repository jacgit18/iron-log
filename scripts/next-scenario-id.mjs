#!/usr/bin/env node
// Prints the next free QA scenario id, so nobody counts by hand: `node scripts/next-scenario-id.mjs` prints `S-301` when S-300 is the highest.
// It looks at server/qa/scenarios/ in this checkout and at origin/main's copy of the folder (when git can read it), and takes the higher.
// A branch that is not merged yet is not seen: two branches can pick the same id, and server/qa/scenarios.test.ts fails on the second one
// to merge, which is a one-line rename (ids are never renumbered once merged).
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The id after the highest `S-<number>` among file names (`S-12.ts`) or ids (`S-12`), at least two digits wide. */
export const nextScenarioId = names => {
  const numbers = names.map(name => /^S-(\d+)(?:\.ts)?$/.exec(name)?.[1]).filter(Boolean).map(Number);
  return `S-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, '0')}`;
};

const folder = 'server/qa/scenarios';

function namesOnMain() {
  try {
    return execFileSync('git', ['ls-tree', '--name-only', 'origin/main', `${folder}/`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .map(path => path.slice(path.lastIndexOf('/') + 1));
  } catch {
    return [];
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const local = readdirSync(fileURLToPath(new URL(`../${folder}/`, import.meta.url)));
  console.log(nextScenarioId([...local, ...namesOnMain()]));
}
