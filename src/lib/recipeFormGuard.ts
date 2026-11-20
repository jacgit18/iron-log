import type { LeaveGuard } from './backNav.js';

// The open recipe form's answer to anything that would leave it (brief recipe-safer-editing; leave-guard gaps fix): Recipes asks it on Back,
// the Daily section buttons ask it before switching. One form is open at a time, so one slot; a later form's guard is left alone when an earlier one goes.
let guard: LeaveGuard | null = null;

/** Registers the open form's guard; the returned function removes it (only if it is still the registered one). */
export function setFormGuard(g: LeaveGuard): () => void {
  guard = g;
  return () => { if (guard === g) guard = null; };
}
export const activeFormGuard = (): LeaveGuard | null => guard;
