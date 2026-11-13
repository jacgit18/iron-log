/* ---------- A one-shot request to open Progress at a spot ----------
   Manage's "Edit in Progress" lands on the Body weight chart (the goal is edited under it). Memory only, read once when the chart draws, cleared by reading it. */

export type ProgressJump = 'body';
let jump: ProgressJump | null = null;

export const requestProgressJump = (j: ProgressJump | null): void => { jump = j; };
export function takeProgressJump(): ProgressJump | null { const j = jump; jump = null; return j; }
