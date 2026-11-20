// Rules for the recipe form's safer editing (brief recipe-safer-editing): which ingredient rows are finished and fold, which row opens next, what the
// folded line says, what Back does, and how a removed row comes back. Pure; IngredientRows and RecipeForm only wire it.

/** The parts of an ingredient row these rules read. */
export interface EditRow { n: string; amt?: string; sub?: string; rid?: string; q?: number; skip?: boolean }

/** A row is finished when it has a name and its amount is set: a typed amount (a linked sauce's amount is free text too), or a linked food or meal, whose amount is a stepper. */
export function rowDone(r: EditRow): boolean {
  if (!r.n.trim()) return false;
  if (r.rid && r.q !== undefined) return true;
  return !!r.amt?.trim();
}

/** The first unfinished row after `after` (or from the top), else null. */
export function nextUnfinished(rows: readonly EditRow[], after = -1): number | null {
  for (let i = after + 1; i < rows.length; i++) if (!rowDone(rows[i]!)) return i;
  return null;
}

/** Where to go once an amount is set on row `i`: the next unfinished row, or Save when none is left. */
export function afterAmount(rows: readonly EditRow[], i: number): { kind: 'row'; i: number } | { kind: 'save' } {
  const next = nextUnfinished(rows, i) ?? nextUnfinished(rows.slice(0, i));
  return next === null ? { kind: 'save' } : { kind: 'row', i: next };
}

/** A row folds when it is finished and is not the row being edited. */
export const isFolded = (r: EditRow, i: number, editing: number | null): boolean => rowDone(r) && i !== editing;

/** The folded line: "Chicken breast · 200 g", with "(or X)" for an Alternative and "skipped" for a skipped row. `amount` is the amount as shown. */
export function foldedSummary(r: EditRow, amount: string): string {
  const parts = [r.n.trim()];
  if (amount.trim()) parts.push(amount.trim());
  let s = parts.join(' · ');
  if (r.sub?.trim()) s += ` (or ${r.sub.trim()})`;
  if (r.skip) s += ' · skipped';
  return s;
}

/** The form has edits when its fields now differ from the snapshot taken when it opened (both are the same JSON of the same fields). */
export const isEdited = (base: string, now: string): boolean => base !== now;

export type BackAction = 'close-picker' | 'ask' | 'leave';
/** What Back (or Cancel) does: close an open amount picker first, then ask when there are edits (or the question is already showing), else leave. */
export function backAction(s: { edited: boolean; pickerOpen: boolean; asking: boolean }): BackAction {
  if (s.pickerOpen) return 'close-picker';
  return s.edited || s.asking ? 'ask' : 'leave';
}

/** A removed row, kept for Undo. */
export interface Removed { row: EditRow; at: number }
export const UNDO_MS = 5000;

/** Removing a blank row loses nothing, so it offers no Undo. */
export const offersUndo = (r: EditRow): boolean => !!(r.n.trim() || r.amt?.trim() || r.sub?.trim());

/** The rows without row `i` (a lone row is replaced by an empty one), and what Undo needs; `removed` is null for a blank row. */
export function removeRow<T extends EditRow>(rows: readonly T[], i: number, blank: () => T): { rows: T[]; removed: (Removed & { row: T }) | null } {
  const row = rows[i];
  if (!row) return { rows: [...rows], removed: null };
  const next = rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank()];
  return { rows: next, removed: offersUndo(row) ? { row, at: i } : null };
}

/** Puts a removed row back where it was. A lone empty row is replaced; a full list refuses (null). */
export function restoreRow<T extends EditRow>(rows: readonly T[], removed: Removed & { row: T }, max: number): T[] | null {
  if (rows.length === 1 && !offersUndo(rows[0]!)) return [removed.row];
  if (rows.length >= max) return null;
  const at = Math.min(removed.at, rows.length);
  return [...rows.slice(0, at), removed.row, ...rows.slice(at)];
}

/** The row a new linked food or sauce lands on: the empty last row the form starts with is filled, otherwise it is added at the end. */
export function landsAt(rows: readonly EditRow[]): number {
  const last = rows[rows.length - 1];
  return last && !last.n.trim() && !last.amt?.trim() && !last.sub ? rows.length - 1 : rows.length;
}
