/* ---------- Make a sharing group from the receipt sheet (brief receipt-share): the sheet closes, Inventory opens with its Sharing panel showing, and after Done the same receipt comes back.
   One short-lived hand-over between the sheet and Inventory; nothing is stored. Inventory reads it once when it opens and then clears it, so a Sharing panel opened any other way never
   reopens a receipt. Reading does not clear (a screen may render twice); `clearSharingIntent` does. ---------- */

let want = false;
let stash: Record<string, unknown> | null = null;

/** The sheet asks for Sharing and leaves its own modal (receipt, month, callbacks) to be reopened. */
export function askSharing(modal: Record<string, unknown>): void { want = true; stash = modal; }
/** True when Inventory should open its Sharing panel. */
export const wantsSharing = (): boolean => want;
/** The receipt to reopen after Done; null when Sharing was not opened from a receipt. */
export const resumeModal = (): Record<string, unknown> | null => stash;
export function clearSharingIntent(): void { want = false; stash = null; }
