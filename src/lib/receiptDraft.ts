import type { Receipt } from '../shared/receipt.js';

// Receipt drafts (briefs receipt-back-guard and receipt-drafts-list): a scanned receipt left open, kept so it can be finished later, and the two pure decisions about the leave prompt.
// Drafts are device state in localStorage (not synced, not in the backup): up to 5, each kept 7 days, newest first, erased by Apply, Discard (that one), expiry, sign-out and a wipe (all).
// Storage is passed in so a test can fake it; every read treats the stored text as untrusted JSON and drops a bad draft without touching the others.

export const DRAFTS_KEY = 'ironlog.receiptDrafts';
/** The key of the one 2-hour draft an older build kept in sessionStorage: read once into the list, then removed. */
export const LEGACY_KEY = 'ironlog.receiptDraft';
/** How long a left receipt can be resumed. */
export const DRAFT_MAX_MS = 7 * 24 * 60 * 60 * 1000;
/** How many drafts are kept; a sixth drops the oldest. */
export const MAX_DRAFTS = 5;
const SKEW_MS = 60 * 1000; // a clock a minute ahead is not "from the future"
const MAX_LINES = 150; // the scan's own cap (shared/receipt.ts)

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Draft { id: string; savedAt: number; mk: string; receipt: Receipt; restore: Record<string, unknown> | null }

/** A fresh draft id (one per scanned receipt). */
export const newDraftId = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

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

/** The draft one stored value holds, or null when it is not ours, malformed or older than 7 days. */
export function parseOne(v: unknown, now: number): Draft | null {
  if (!isObj(v)) return null;
  const { id, savedAt, mk, receipt, restore } = v;
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return null;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt > now + SKEW_MS || now - savedAt >= DRAFT_MAX_MS) return null;
  if (typeof mk !== 'string' || !/^\d{4}-\d{2}$/.test(mk)) return null;
  if (!isObj(receipt) || !Array.isArray(receipt.lines) || receipt.lines.length === 0 || receipt.lines.length > MAX_LINES || !receipt.lines.every(lineOk)) return null;
  if ((receipt.store !== undefined && typeof receipt.store !== 'string') || (receipt.date !== undefined && typeof receipt.date !== 'string')) return null;
  if ((receipt.taxCents !== undefined && !Number.isFinite(receipt.taxCents)) || (receipt.totalCents !== undefined && !Number.isFinite(receipt.totalCents))) return null;
  if (restore !== undefined && restore !== null && !isObj(restore)) return null;
  return { id, savedAt, mk, receipt: receipt as unknown as Receipt, restore: isObj(restore) && restoreOk(restore) ? restore : null }; // edits in a shape the sheet does not read are dropped, the receipt itself still resumes
}

/** Newest first, no repeated id, at most MAX_DRAFTS: the oldest ones drop. */
export function bound(list: readonly Draft[]): Draft[] {
  const seen = new Set<string>();
  return [...list].sort((a, b) => b.savedAt - a.savedAt).filter(d => (seen.has(d.id) ? false : (seen.add(d.id), true))).slice(0, MAX_DRAFTS);
}

/** The drafts a stored text holds (a JSON list): each bad or expired one is dropped on its own, never the whole list. */
export function parseDrafts(raw: string | null | undefined, now: number): Draft[] {
  if (!raw) return [];
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(v)) return [];
  return bound(v.map(x => parseOne(x, now)).filter((d): d is Draft => d !== null));
}

/** The list with this draft added (or replaced, by id), the oldest dropped at the sixth. */
export const upsertDraft = (list: readonly Draft[], d: Draft): Draft[] => bound([...list.filter(x => x.id !== d.id), d]);
export const removeDraft = (list: readonly Draft[], id: string): Draft[] => list.filter(x => x.id !== id);

function readRaw(storage: Store): string | null | undefined {
  try { return storage.getItem(DRAFTS_KEY); } catch { return undefined; } // undefined: could not read (do not overwrite what is there)
}
function writeList(storage: Store, list: readonly Draft[]): boolean {
  try { if (list.length === 0) storage.removeItem(DRAFTS_KEY); else storage.setItem(DRAFTS_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** The drafts now. Expired or unreadable ones are removed from storage. */
export function loadDrafts(storage: Store, now: number): Draft[] {
  const raw = readRaw(storage);
  if (raw === undefined || raw === null) return [];
  const list = parseDrafts(raw, now);
  if (JSON.stringify(list) !== raw) writeList(storage, list);
  return list;
}

/** Keeps the draft (replacing the one with its id). False when the storage refuses (private window, full): the caller says so. */
export function saveDraft(storage: Store, d: Draft, now: number = Date.now()): boolean {
  const raw = readRaw(storage);
  if (raw === undefined) return false;
  return writeList(storage, upsertDraft(parseDrafts(raw, now), d));
}

/** Removes one draft by id. */
export function clearDraft(storage: Store, id: string, now: number = Date.now()): void {
  const raw = readRaw(storage);
  if (raw === undefined || raw === null) return;
  writeList(storage, removeDraft(parseDrafts(raw, now), id));
}

/** Removes every draft. */
export function clearAllDrafts(storage: Store): void {
  try { storage.removeItem(DRAFTS_KEY); } catch { /* nothing to clear */ }
}

/** Moves the old build's one draft (sessionStorage, 2 hours) into the list and removes the old key; an unreadable one is just removed. */
export function migrateLegacy(session: Store, local: Store, now: number): void {
  let raw: string | null = null;
  try { raw = session.getItem(LEGACY_KEY); } catch { return; }
  if (raw === null) return;
  let v: unknown; try { v = JSON.parse(raw); } catch { v = null; }
  const d = isObj(v) ? parseOne({ ...v, id: newDraftId() }, now) : null;
  if (d && !saveDraft(local, d, now)) return; // could not keep it: leave the old one where it is
  try { session.removeItem(LEGACY_KEY); } catch { /* nothing to remove */ }
}

// The calls the app makes, on this device's localStorage. Reaching for storage can itself throw (blocked site data), so a missing one is no storage.
const area = (kind: 'local' | 'session'): Store | null => { try { const s = kind === 'local' ? localStorage : sessionStorage; return typeof s === 'undefined' ? null : s; } catch { return null; } };
export const keepDraft = (d: Draft): boolean => { const s = area('local'); return s ? saveDraft(s, d) : false; };
export const readDrafts = (now: number): Draft[] => {
  const l = area('local'), s = area('session');
  if (!l) return [];
  if (s) migrateLegacy(s, l, now);
  return loadDrafts(l, now);
};
export const dropDraft = (id: string): void => { const s = area('local'); if (s) clearDraft(s, id); };
export const dropAllDrafts = (): void => { const s = area('local'); if (s) clearAllDrafts(s); try { sessionStorage.removeItem(LEGACY_KEY); } catch { /* none */ } };

/** What a draft needs when the list changed since it was saved: a choice of an item that is gone becomes "no match" (and a line the scan matched to it too). `n` is how many lines changed. */
export function relinkDraft(d: Draft, itemIds: ReadonlySet<string>): { receipt: Receipt; restore: Record<string, unknown> | null; n: number } {
  const gone = (id: unknown): boolean => typeof id === 'string' && !id.startsWith('new:') && !itemIds.has(id);
  let scan = 0;
  const lines = d.receipt.lines.map(l => { if (!gone(l.matchId)) return l; scan++; return { ...l, matchId: null }; });
  const receipt = scan ? { ...d.receipt, lines } : d.receipt;
  const cs = d.restore?.choices;
  if (!d.restore || !Array.isArray(cs) || cs.length !== d.receipt.lines.length) return { receipt, restore: d.restore, n: scan }; // the sheet reads the receipt's own matches when there are no usable edits
  let n = 0;
  const choices = (cs as { itemId: string | null; include: boolean }[]).map(c => { if (!gone(c.itemId)) return c; n++; return { itemId: null, include: false }; });
  return { receipt, restore: { ...d.restore, choices }, n };
}

/** "just now", "12 min ago", "3 hours ago", "2 days ago": how long ago the receipt was left, for the Drafts row. */
export function draftAge(savedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - savedAt) / 60000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
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
