import type { LeaveGuard } from './backNav.js';

/** What the open recipe form can do for something that would leave it: `holds` and `ask` answer Back (the picker closes, then the question shows);
 *  `tap(go)` answers a Daily section tap: the picker closes, then `go` runs at once on a form with no edits, or after Discard on one with edits. */
export interface FormGuard extends LeaveGuard { tap(go: () => void): void }

// The open recipe form's answer to anything that would leave it (brief recipe-safer-editing): Recipes asks it on Back, the Daily section buttons on a tap.
// One form is open at a time, so one slot; a later form's guard is left alone when an earlier one goes.
let guard: FormGuard | null = null;

/** Registers the open form's guard; the returned function removes it (only if it is still the registered one). */
export function setFormGuard(g: FormGuard): () => void {
  guard = g;
  return () => { if (guard === g) guard = null; };
}
export const activeFormGuard = (): FormGuard | null => guard;
