/* ---------- A one-shot request to open Progress at a spot ----------
   Manage's "Edit in Progress" lands on the Body weight chart (the goal is edited under it). Memory only, read once when the chart draws, cleared by reading it. It also lapses after ten seconds, so a request whose
   screen never opened (a failed load) cannot scroll a later, ordinary visit. */

export type ProgressJump = 'body';
export const JUMP_TTL_MS = 10_000;
let jump: { to: ProgressJump; at: number } | null = null;

export const requestProgressJump = (to: ProgressJump | null, now: number = Date.now()): void => { jump = to ? { to, at: now } : null; };
export function takeProgressJump(now: number = Date.now()): ProgressJump | null { const j = jump; jump = null; return j && now - j.at <= JUMP_TTL_MS ? j.to : null; }
