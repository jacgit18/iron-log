/* ---------- A one-shot request to open Recipes on a form (brief nutrition-items-row-sheet-and-more) ----------
   Nutrition's dead-end texts become buttons: "New recipe" opens the blank form, "Edit in Recipes" opens one recipe's form. The request is held in memory only, read once by Recipes when it opens, and cleared by reading it. */

export type RecipesJump = { kind: 'new' } | { kind: 'edit'; id: string };
let jump: RecipesJump | null = null;

export const requestRecipesJump = (j: RecipesJump | null): void => { jump = j; };
export function takeRecipesJump(): RecipesJump | null { const j = jump; jump = null; return j; }
