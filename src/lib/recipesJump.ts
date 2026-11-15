/* ---------- A one-shot request to open Recipes on a form (brief nutrition-items-row-sheet-and-more) ----------
   Nutrition's dead-end texts become buttons: "New recipe" opens the blank form, "Edit in Recipes" opens one recipe's form. The request is held in memory only, read once by Recipes when it opens, and cleared by reading it. */

export type RecipesJump = { kind: 'new' } | { kind: 'edit'; id: string };
let jump: { j: RecipesJump; at: number } | null = null;
/** A request nobody read within this long is stale (the navigation never reached Recipes) and is dropped. */
export const JUMP_TTL_MS = 10_000;

export const requestRecipesJump = (j: RecipesJump | null, now = Date.now()): void => { jump = j ? { j, at: now } : null; };
export function takeRecipesJump(now = Date.now()): RecipesJump | null { const r = jump; jump = null; return r && now - r.at <= JUMP_TTL_MS ? r.j : null; }
