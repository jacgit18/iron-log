import type { Receipt } from '../shared/receipt.js';

// A scanned receipt left open (brief receipt-back-guard): the draft that lets a receipt closed by a stray Back be resumed, and the two pure decisions about
// the leave prompt. The draft is device state in sessionStorage (not synced, not in the backup): one receipt, kept 2 hours, erased by Apply, Discard,
// expiry, sign-out and a wipe. Storage is passed in so a test can fake it; every read treats the stored text as untrusted JSON.

export const DRAFT_KEY = 'ironlog.receiptDraft';
/** How long a closed receipt can be resumed. */
export const DRAFT_MAX_MS = 2 * 60 * 60 * 1000;
const SKEW_MS = 60 * 1000; // a clock a minute ahead is not "from the future"
const MAX_LINES = 150; // the scan's own cap (shared/receipt.ts)

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Draft { savedAt: number; mk: string; receipt: Receipt; restore: Record<string, unknown> | null }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const strs = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === 'string');

/** Whether the sheet's saved edits have the shape the sheet reads (a draft from another build, or edited by hand, must not crash it). */
function restoreOk(r: Record<string, unknown>): boolean {
  const { choices, renames, touched, noRemember, separate, pickedStore, staged, seq, unticked, shareChoices, usual, typedName, addOn } = r;
  return (choices === undefined || (Array.isArray(choices) && choices.every(c => isObj(c) && (c.itemId === null || typeof c.itemId === 'string') && typeof c.include === 'boolean')))
    && (renames === undefined || (isObj(renames) && Object.values(renames).every(x => typeof x === 'string')))
    && [touched, noRemember, separate, unticked].every(x => x === undefined || strs(x))
    && (pickedStore === undefined || typeof pickedStore === 'string')
    && (staged === undefined || (Array.isArray(staged) && staged.every(s => isObj(s) && typeof s.id === 'string' && typeof s.n === 'string' && typeof s.store === 'string' && Number.isFinite(s.qty) && (s.cents === null || Number.isFinite(s.cents)))))
    && (seq === undefined || Number.isFinite(seq))
    && (shareChoices === undefined || (isObj(shareChoices) && isObj(shareChoices.rows)))
    && (usual === undefined || usual === null || typeof usual === 'boolean')
    && (typedName === undefined || typedName === null || typeof typedName === 'string')
    && (addOn === undefined || typeof addOn === 'boolean');
}

function lineOk(l: unknown): boolean {
  return isObj(l) && typeof l.text === 'string' && Number.isFinite(l.qty) && Number.isFinite(l.grossCents) && Number.isFinite(l.discountCents) && (l.matchId === null || typeof l.matchId === 'string');
}

/** The draft a stored text holds, or null when it is missing, not ours, malformed or older than 2 hours. */
export function parseDraft(raw: string | null | undefined, now: number): Draft | null {
  if (!raw) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!isObj(v)) return null;
  const { savedAt, mk, receipt, restore } = v;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt > now + SKEW_MS || now - savedAt >= DRAFT_MAX_MS) return null;
  if (typeof mk !== 'string' || !/^\d{4}-\d{2}$/.test(mk)) return null;
  if (!isObj(receipt) || !Array.isArray(receipt.lines) || receipt.lines.length === 0 || receipt.lines.length > MAX_LINES || !receipt.lines.every(lineOk)) return null;
  if ((receipt.store !== undefined && typeof receipt.store !== 'string') || (receipt.date !== undefined && typeof receipt.date !== 'string')) return null;
  if ((receipt.taxCents !== undefined && !Number.isFinite(receipt.taxCents)) || (receipt.totalCents !== undefined && !Number.isFinite(receipt.totalCents))) return null;
  if (restore !== undefined && restore !== null && !isObj(restore)) return null;
  return { savedAt, mk, receipt: receipt as unknown as Receipt, restore: isObj(restore) && restoreOk(restore) ? restore : null }; // edits in a shape the sheet does not read are dropped, the receipt itself still resumes
}

/** Keeps the draft. A storage that refuses (private window, full) is ignored: the sheet then closes as it always did. */
export function saveDraft(storage: Store, d: Draft): void {
  try { storage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* nothing to keep it in */ }
}

/** The draft now, or null. An expired or unreadable one is removed. */
export function loadDraft(storage: Store, now: number): Draft | null {
  let raw: string | null = null;
  try { raw = storage.getItem(DRAFT_KEY); } catch { return null; }
  if (raw === null) return null;
  const d = parseDraft(raw, now);
  if (!d) clearDraft(storage);
  return d;
}

export function clearDraft(storage: Store): void {
  try { storage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}

// The three calls the app makes, on this tab's sessionStorage. Reaching for sessionStorage can itself throw (blocked site data), so a missing one is no storage.
const device = (): Store | null => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };
export const keepDraft = (d: Draft): void => { const s = device(); if (s) saveDraft(s, d); };
export const readDraft = (now: number): Draft | null => { const s = device(); return s ? loadDraft(s, now) : null; };
export const dropDraft = (): void => { const s = device(); if (s) clearDraft(s); };

/** "just now", "12 min ago", "1 hour ago": how long ago the receipt was closed, for the Resume row. */
export function draftAge(savedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - savedAt) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
}

export interface ChoiceLike { itemId: string | null; include: boolean }
/** What the person has changed on the sheet. The counts are the sizes of the sheet's own sets and lists. */
export interface EditState {
  choices: readonly ChoiceLike[]; initial: readonly ChoiceLike[];
  renames: number; touched: number; noRemember: number; separate: number; staged: number; unticked: number;
  keep: boolean; formOpen: boolean; storePicked: boolean; shared: boolean;
}

/** Whether anything on the sheet differs from how the scan opened it: only then does Back ask first. */
export function isEdited(s: EditState): boolean {
  const moved = s.choices.length !== s.initial.length || s.choices.some((c, i) => c.itemId !== s.initial[i]!.itemId || c.include !== s.initial[i]!.include);
  return moved || s.renames > 0 || s.touched > 0 || s.noRemember > 0 || s.separate > 0 || s.staged > 0 || s.unticked > 0 || s.keep || s.formOpen || s.storePicked || s.shared;
}

/** Whether a Back (or a tap outside, or Escape) keeps the sheet open: when it has edits, and while the prompt is already showing. */
export const shouldAskOnBack = (edited: boolean, asking: boolean): boolean => edited || asking;
