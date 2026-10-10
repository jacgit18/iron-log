// When a waiting app update may be applied without asking (ADR 018). Reloading stops the rest timer and drops anything
// being typed, so every sign of "in use" blocks it; the banner stays as the fallback and applies the update on a tap.

/** No tap or key for this long before an automatic reload, so a write from the last tap has finished. */
export const QUIET_MS = 15_000;
/** An automatic reload that leaves the update still waiting is not repeated within this time (no reload loop). */
export const LOOP_GUARD_MS = 60_000;

export interface IdleInputs {
  timing: boolean; // a rest or hold timer is running
  modalOpen: boolean; // a sheet is open
  importing: boolean; // an import is being reviewed
  unsavedCount: number; // writes the device refused and still holds in memory
  typing: boolean; // a text field has focus
  sinceInputMs: number; // time since the last tap or key
  sinceAutoReloadMs: number; // time since this app last reloaded itself for an update
}

export function canAutoReload(i: IdleInputs): boolean {
  return !i.timing && !i.modalOpen && !i.importing && i.unsavedCount === 0 && !i.typing
    && i.sinceInputMs >= QUIET_MS && i.sinceAutoReloadMs >= LOOP_GUARD_MS;
}

/** What isTyping reads from the focused element (a DOM Element has all of these). */
export interface Focused { tagName: string; type?: string; isContentEditable?: boolean }

/** True while the focused element takes typed text: a textarea, a select, an input other than a button-like one, or an editable region. */
export function isTyping(el: Focused | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['button', 'checkbox', 'radio', 'submit', 'reset', 'range'].includes(el.type ?? 'text');
  return !!el.isContentEditable;
}

const KEY = 'ironlog.autoReloadAt';
type TabStore = Pick<Storage, 'getItem' | 'setItem'>;
const tabStore = (): TabStore | null => { try { return sessionStorage; } catch { return null; } };
export function lastAutoReload(store: TabStore | null = tabStore()): number {
  try { return Number(store?.getItem(KEY)) || 0; } catch { return 0; }
}
export function markAutoReload(now = Date.now(), store: TabStore | null = tabStore()): void {
  try { store?.setItem(KEY, String(now)); } catch { /* storage blocked: the guard is then per page load only */ }
}
