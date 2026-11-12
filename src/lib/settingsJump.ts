/* ---------- A one-shot request to open Settings at a spot (brief nutrition-items-row-sheet-and-more) ----------
   Nutrition's "Water reminder" button opens Settings at the Alerts panel. Memory only, read once when Settings draws, cleared by reading it; Settings has no address of its own. */

export type SettingsJump = 'alerts';
let jump: SettingsJump | null = null;

export const requestSettingsJump = (j: SettingsJump | null): void => { jump = j; };
export function takeSettingsJump(): SettingsJump | null { const j = jump; jump = null; return j; }
