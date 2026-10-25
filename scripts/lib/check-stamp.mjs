// The record `npm run check` leaves when every chosen check passed, and the rule that turns it into ticked PR boxes (scripts/pr-body.mjs).
// A box is ticked only when a stamp says the check ran and passed for the exact commit being opened as a PR, on a clean tree. No stamp, a stamp
// for another commit, a dirty tree or a check that did not run all leave the box open for the author. Tested in scripts/checkStamp.test.js.

export const STAMP_FILE = 'check-stamp.json'; // resolved with `git rev-parse --git-path`, so it sits in the git directory: never committed, one per worktree

/** `ran` is the plan that passed (typecheck, lint, test, e2e, ...). A test step that ran only the tests related to the change is recorded as
 *  `test:related`, so it never counts as the full unit suite. */
export function makeStamp({ head, dirty, ran, relatedTests = false, at = new Date().toISOString() }) {
  return { head, dirty: Boolean(dirty), ran: ran.map(c => (c === 'test' && relatedTests ? 'test:related' : c)), at };
}

/** Which of the project's rules (`autoTickFromCheck` in .github/pr-kit.json: { line, needs }) the stamp backs for `head`.
 *  `line` is a regex source matching the PR box; `needs` lists the checks that must have run, and "a|b" means either one.
 *  Returns { lines: regex sources to tick, note: why nothing, or what, was ticked }. */
export function ticksFrom(stamp, head, rules = []) {
  if (!rules.length) return { lines: [], note: '' };
  if (!stamp) return { lines: [], note: 'No check stamp: run `npm run check` on the committed branch, then build the body again, to have the Checks boxes ticked.' };
  if (stamp.head !== head) return { lines: [], note: `The check stamp is for ${String(stamp.head).slice(0, 7)} but HEAD is ${head.slice(0, 7)}: run \`npm run check\` again.` };
  if (stamp.dirty) return { lines: [], note: 'The check stamp was made with uncommitted changes: commit, then run `npm run check` again.' };
  const ran = new Set(stamp.ran);
  const backed = rules.filter(r => r.needs.every(n => n.split('|').some(c => ran.has(c))));
  const left = rules.length - backed.length;
  return { lines: backed.map(r => r.line), note: `Ticked ${backed.length} Checks box(es) from the check stamp for ${head.slice(0, 7)} (ran: ${stamp.ran.join(', ')}).${left ? ` ${left} stay open: a check they need did not run.` : ''}` };
}
