import { MAX_AMOUNT, MAX_INGREDIENTS, MAX_RECIPE_NAME } from '../shared/recipes.js';

/* ---------- Typing a whole ingredient list (brief recipe-form-mobile-desktop): pure, one line per ingredient ----------
   "1 cup milk or oat milk" is the amount "1 cup", the ingredient "milk" and the alternative "oat milk". A line with no leading amount is all
   name. The text written back from rows parses to the same rows for ordinary amounts ("1 (14 oz) can" is not one: the form keeps the rows
   when the list text was not edited). */

export interface ListRow { n: string; amt: string; sub?: string }

const QTY = '(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?\\s*[⅛¼⅓½⅔¾]?|[⅛¼⅓½⅔¾])(?:\\s*[-–]\\s*\\d+(?:\\.\\d+)?)?';
const UNIT = '(?:cups?|tbsp|tsp|g|kg|oz|lbs?|ml|l|pieces?|cloves?|slices?|cans?)';
const WITH_QTY = new RegExp(`^(${QTY})(?:\\s*(${UNIT})\\b)?\\s+(.+)$`, 'i');
const PINCH = /^(pinch|dash)(?:\s+of)?\s+(.+)$/i;

function parseLine(line: string): ListRow | null {
  let amt = '', rest = line;
  const q = WITH_QTY.exec(line), p = PINCH.exec(line);
  if (q) { amt = `${q[1]!.replace(/\s+/g, ' ').trim()}${q[2] ? ` ${q[2]}` : ''}`; rest = q[3]!; }
  else if (p) { amt = p[1]!.toLowerCase(); rest = p[2]!; }
  if (amt.length > MAX_AMOUNT) { amt = ''; rest = line; }
  const [first = '', ...others] = rest.split(/\s+or\s+/i);
  const n = first.trim().slice(0, MAX_RECIPE_NAME);
  if (!n) return null;
  const sub = others.join(' or ').trim().slice(0, MAX_RECIPE_NAME);
  return { n, amt, ...(sub && sub.toLowerCase() !== n.toLowerCase() ? { sub } : {}) };
}

/** The ingredients typed in a list, at most the recipe limit; `cut` says some lines were left off. */
export function parseIngredientList(text: string): { rows: ListRow[]; cut: boolean } {
  const rows = text.split('\n').map(l => l.replace(/^\s*(?:[-*•]\s+)?/, '').trim()).filter(Boolean).map(parseLine).filter((r): r is ListRow => !!r);
  return { rows: rows.slice(0, MAX_INGREDIENTS), cut: rows.length > MAX_INGREDIENTS };
}

/** A line of the list: an earlier row left as it was (`old`), or the row its text reads as. */
export type ListLine<T> = { old: T } | { row: ListRow };

/** The list read against the rows it was written from: a line that is still exactly what an earlier row writes as keeps that row (its pin, Skip and
 *  amount text), so only the lines the person changed are read again. Text such as "1 (14 oz) can tomatoes" or a name with "or" in it would not
 *  read back as the same row. */
export function readList<T extends { n: string; amt?: string; sub?: string }>(text: string, old: T[]): { lines: ListLine<T>[]; cut: boolean } {
  const pool = [...old];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).flatMap((l): ListLine<T>[] => {
    const at = pool.findIndex(r => ingredientsToText([r]) === l);
    if (at >= 0) return [{ old: pool.splice(at, 1)[0]! }];
    const row = parseLine(l.replace(/^(?:[-*•]\s+)/, ''));
    return row ? [{ row }] : [];
  });
  return { lines: lines.slice(0, MAX_INGREDIENTS), cut: lines.length > MAX_INGREDIENTS };
}

/** The list text for some rows: amount, name, and "or" the alternative. Rows with no name are left out. */
export const ingredientsToText = (rows: { n: string; amt?: string; sub?: string }[]): string =>
  rows.filter(r => r.n.trim()).map(r => [r.amt?.trim(), r.n.trim() + (r.sub?.trim() ? ` or ${r.sub.trim()}` : '')].filter(Boolean).join(' ')).join('\n');
