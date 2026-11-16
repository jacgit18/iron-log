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

/** After Done, Inventory hands the receipt to Shopping's scan code, which reopens it with its own callbacks (so Apply there shows the Applied notice and Undo). It expires after a few
 *  seconds, so a receipt that was never reopened cannot come back later by surprise. */
let ready: { modal: Record<string, unknown>; at: number } | null = null;
export const READY_MS = 8000;
export function readyResume(modal: Record<string, unknown>, now = Date.now()): void { ready = { modal, at: now }; }
export function takeReadyResume(now = Date.now()): Record<string, unknown> | null { const r = ready; ready = null; return r && now - r.at < READY_MS ? r.modal : null; }
