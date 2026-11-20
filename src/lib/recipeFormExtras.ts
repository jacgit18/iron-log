// Rules for the recipe form extras (brief recipe-form-extras): the progress line, the desktop keys, the one-save gate, scrolling a focused field into view.
// Pure; RecipeForm and IngredientRows only wire them.
import { rowDone } from './recipeSaferEditing.js';
import type { EditRow } from './recipeSaferEditing.js';

/** "2 of 3 ingredients done": rows with a name are counted, and finished ones (`rowDone`) are done. Empty when no row has a name. */
export function progressLine(rows: readonly EditRow[]): string {
  const named = rows.filter(r => r.n.trim());
  if (!named.length) return '';
  const n = named.filter(rowDone).length;
  return `${n} of ${named.length} ingredient${named.length === 1 ? '' : 's'} done`;
}

/** What a key does in the form: Esc is Back (desktop only), Ctrl or Cmd+Enter saves (desktop only, never while `busy`), anything else nothing. */
export function formKey(k: { key: string; ctrlKey: boolean; metaKey: boolean }, desktop: boolean, busy = false): 'back' | 'save' | null {
  if (!desktop) return null;
  if (k.key === 'Escape') return 'back';
  if (k.key === 'Enter' && (k.ctrlKey || k.metaKey) && !busy) return 'save'; // busy: the amount picker is open or "Discard changes?" is showing, so an unconfirmed amount would be lost
  return null;
}

/** Save may start unless one is already running or the form has already saved or been discarded. */
export const canSave = (s: { saving: boolean; gone: boolean }): boolean => !s.saving && !s.gone;

/** How far to scroll the page (positive: down) so a field at [top, bottom] sits inside the visible band [viewTop, viewBottom - barHeight], keeping `pad` clear. Zero when it fits. */
export function scrollDelta(f: { top: number; bottom: number }, view: { top: number; bottom: number }, barHeight: number, pad = 12): number {
  const low = view.bottom - barHeight - pad, high = view.top + pad;
  if (f.bottom > low) return Math.min(f.bottom - low, Math.max(0, f.top - high)); // never push the field's top out of view
  if (f.top < high) return f.top - high;
  return 0;
}

/** A menu's open row after a row `i` was removed or another menu opened: the menu closes for the removed row, shifts for later ones. */
export const menuAfterRemove = (open: number | null, removed: number): number | null => (open === null || open === removed ? null : open > removed ? open - 1 : open);

/** Where focus goes after row `removed` is taken out and `rows` rows are left (a lone row is replaced by a blank one, so rows is at least 1): the row that took its place, else the one before, else Add ingredient. */
export const focusAfterRemove = (removed: number, rows: number): { kind: 'row'; i: number } | { kind: 'add' } =>
  removed < rows ? { kind: 'row', i: removed } : removed - 1 >= 0 && rows > 0 ? { kind: 'row', i: removed - 1 } : { kind: 'add' };
