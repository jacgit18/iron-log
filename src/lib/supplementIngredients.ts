import type { IngredientLimit, SupplementItem, Taken } from '../types.ts';
import type { NutrientUnit } from '../shared/nutrientKeys.js';
import { CURATED_INGREDIENTS, ingredientKey, ingredientName, labelOfKey } from '../shared/supplementIngredients.js';
import { CLOSE_FRACTION } from './intakeChecks.js';
import { countedItems } from './supplementNutrients.js';
import type { TotalsBasis } from './supplementNutrients.js';
import { fmtAmount } from './amountFormat.js';
import { byName } from './sort.js';
import { portionOf } from './supplementPortion.js';

/* ---------- A day's active-ingredient totals and where they stand against your own limit (brief supplement-active-ingredients, ADR 118) ----------
   Each row on a supplement is the amount in ONE serving, times the portion taken each time (like the nutrient rows). 'taken' sums the ticked scheduled items, 'scheduled' sums all of them.
   g, mg and mcg convert to one another; IU only matches IU and is never converted (what an IU is depends on the ingredient). The limit is the person's own number, a target (aim for at least)
   or a cap (stay under); there is no built-in limit. Pure: the Totals sheet, the limit sheet and the day's warning line only draw these. */

export type IngredientStatus = 'none' | 'under' | 'met' | 'close' | 'over';

export interface IngredientProduct { itemId: string; name: string; amount: number }
export interface IngredientNotAdded extends IngredientProduct { unit: NutrientUnit; reason: string }
export interface IngredientTotal {
  /** Lowercase name: the key of `Cfg.ingredientLimits`. */
  key: string;
  label: string;
  /** The unit `total` is in: your limit's unit, else the unit of the first row counted. */
  unit: NutrientUnit;
  total: number;
  /** The products that add to the total, biggest first. */
  products: IngredientProduct[];
  /** Rows in another unit family (an IU row against a mg limit), listed with the reason, never guessed. */
  notAdded: IngredientNotAdded[];
}
export interface IngredientRow extends IngredientTotal {
  limit?: IngredientLimit;
  status: IngredientStatus;
  /** Bar width 0 to 100; 0 with no limit (no bar is drawn). */
  percent: number;
  figure: string;
  /** "65% of your target", "Target met", "45% of your cap", "Close to your cap (85%)", "Over your cap by 30 mg"; empty with no limit. */
  statusText: string;
  /** "Your target: 1,000 mg a day"; empty with no limit. */
  limitText: string;
  /** "Omega-3 475 mg" per product that adds to it. */
  productLines: string[];
  notAddedLines: string[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const MG: Partial<Record<NutrientUnit, number>> = { g: 1000, mg: 1, mcg: 0.001 };

/** `amount` in `from` expressed in `to`, or undefined when they cannot be converted (IU against a mass, or the reverse). IU to IU is itself. */
export function convertAmount(amount: number, from: NutrientUnit, to: NutrientUnit): number | undefined {
  if (from === to) return amount;
  const a = MG[from], b = MG[to];
  return a === undefined || b === undefined ? undefined : round3((amount * a) / b);
}

const fmt = fmtAmount;

const familyOf = (u: NutrientUnit) => (u === 'IU' ? 'iu' : 'mass');

/** One entry per ingredient a counted supplement lists, plus any ingredient you set a limit for (0 when nothing lists it today). Curated names first, then the typed ones A to Z. */
export function ingredientTotals(items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis = 'taken', limits: Record<string, IngredientLimit> = {}): IngredientTotal[] {
  type Raw = { label: string; rows: { itemId: string; name: string; amount: number; unit: NutrientUnit }[] };
  const by = new Map<string, Raw>();
  for (const item of countedItems(items, taken, date, basis)) {
    for (const r of item.ingredients || []) {
      const key = ingredientKey(r.name); if (!key) continue;
      const e = by.get(key) ?? { label: r.name, rows: [] }; by.set(key, e);
      e.rows.push({ itemId: item.id, name: item.n, amount: round3(r.amount * portionOf(item)), unit: r.unit });
    }
  }
  for (const key of Object.keys(limits)) if (!by.has(key)) by.set(key, { label: labelOfKey(key, limits[key].name), rows: [] });
  const out: IngredientTotal[] = [];
  for (const [key, e] of by) {
    const lim = limits[key];
    const unit: NutrientUnit = lim ? lim.unit : e.rows[0]?.unit ?? 'mg';
    const fam = familyOf(unit);
    const products: IngredientProduct[] = []; const notAdded: IngredientNotAdded[] = [];
    let total = 0;
    for (const r of e.rows) {
      const v = familyOf(r.unit) === fam ? convertAmount(r.amount, r.unit, unit) : undefined;
      if (v === undefined) notAdded.push({ ...r, reason: lim ? `different units: your ${lim.kind} is in ${lim.unit}` : 'different units' });
      else { total = round3(total + v); products.push({ itemId: r.itemId, name: r.name, amount: v }); }
    }
    out.push({ key, label: e.label, unit, total, products: products.sort((a, b) => b.amount - a.amount), notAdded });
  }
  const order = (k: string) => { const i = CURATED_INGREDIENTS.findIndex(c => c.toLowerCase() === k); return i < 0 ? CURATED_INGREDIENTS.length : i; };
  return out.sort((a, b) => order(a.key) - order(b.key) || byName(a.label, b.label));
}

/** Where a total stands against your own limit. A target is met at or above the amount; a cap is over only above it (exactly the cap is not over) and close from 80%. */
export function limitPosition(total: number, limit: IngredientLimit | undefined): { status: IngredientStatus; percent: number; over: number } {
  if (!limit) return { status: 'none', percent: 0, over: 0 };
  const percent = Math.round((total / limit.amount) * 100);
  if (limit.kind === 'target') return { status: total >= limit.amount ? 'met' : 'under', percent, over: 0 };
  const over = total > limit.amount ? round3(total - limit.amount) : 0;
  return { status: over > 0 ? 'over' : total >= limit.amount * CLOSE_FRACTION ? 'close' : 'under', percent, over };
}

/** The Totals sheet's Active ingredients rows. Status is always in words as well as colour. */
export function ingredientRows(items: SupplementItem[], taken: Taken, date: string, basis: TotalsBasis, limits: Record<string, IngredientLimit> = {}): IngredientRow[] {
  return ingredientTotals(items, taken, date, basis, limits).map((t): IngredientRow => {
    const limit = limits[t.key];
    const p = limitPosition(t.total, limit);
    const noun = limit?.kind === 'cap' ? 'cap' : 'target';
    const statusText = !limit ? '' : p.status === 'met' ? 'Target met' : p.status === 'over' ? `Over your cap by ${fmt(p.over)} ${t.unit}` : p.status === 'close' ? `Close to your cap (${p.percent}%)` : `${p.percent}% of your ${noun}`;
    return {
      ...t, ...(limit ? { limit } : {}), status: p.status, percent: limit ? Math.max(0, Math.min(100, p.percent)) : 0,
      figure: `${fmt(t.total)} ${t.unit}`, statusText,
      limitText: limit ? `Your ${noun}: ${fmt(limit.amount)} ${limit.unit} a day` : '',
      productLines: t.products.map(x => `${x.name} ${fmt(x.amount)} ${t.unit}`),
      notAddedLines: t.notAdded.map(n => `${n.name}: ${fmt(n.amount)} ${n.unit} not added, ${n.reason}.`),
    };
  });
}

/** Labels of the ingredients whose day total (what was taken) is over the cap you set; targets never warn. */
export const ingredientsOverCap = (items: SupplementItem[], taken: Taken, date: string, limits: Record<string, IngredientLimit> = {}): string[] =>
  ingredientTotals(items, taken, date, 'taken', limits).filter(t => limits[t.key]?.kind === 'cap' && limitPosition(t.total, limits[t.key]).status === 'over').map(t => t.label);

/** The line under a day's supplements for a cap you set that was passed; empty when none was. */
export function capWarning(items: SupplementItem[], taken: Taken, date: string, limits: Record<string, IngredientLimit> = {}): string {
  const over = ingredientsOverCap(items, taken, date, limits);
  return over.length ? `Over your own cap today: ${over.join(', ')}. Totals shows the amounts. A limit you set is your own number, not medical advice.` : '';
}

/** Said on the Totals sheet, the limit sheet and the editor (brief supplement-active-ingredients; wording is for the owner's legal read before wide release). */
export const INGREDIENT_NOTE = 'Limits you set are your own numbers, not a recommendation or medical advice. Ask a doctor or pharmacist about doses, medicines and health conditions.';
/** The editor's short note on reading a label. */
export const PANEL_NOTE = 'Copy the Amount Per Serving column, not the % Daily Value. Enter what is inside (for example EPA 175 mg), not the weight of a blend such as "Fish oil 2,500 mg".';

/** An ingredient row on the supplement sheet while it is being typed: the amount stays text, `other` shows the name field (a typed name rather than a curated one). */
export interface IngredientDraft { name: string; amount: string; unit: NutrientUnit; other: boolean }

/** Saved rows as the sheet's drafts; a name outside the curated list opens as "Other ingredient". */
export const draftsOf = (rows: readonly { name: string; amount: number; unit: NutrientUnit }[] = []): IngredientDraft[] =>
  rows.map(r => ({ name: r.name, amount: String(r.amount), unit: r.unit, other: !CURATED_INGREDIENTS.some(c => c === r.name) }));

/** The drafts as rows to save: a name and an amount above zero; the store cleans the rest. */
export const rowsOf = (drafts: readonly IngredientDraft[]): { name: string; amount: number; unit: NutrientUnit }[] =>
  drafts.flatMap(r => (ingredientName(r.name) && Number(r.amount) > 0 ? [{ name: ingredientName(r.name), amount: Number(r.amount), unit: r.unit }] : []));

/** One line per ingredient and unit listed more than once with an amount: "EPA in mg is listed twice; only the first is kept." */
export function duplicateIngredientNotes(drafts: readonly IngredientDraft[]): string[] {
  const seen = new Set<string>(); const said = new Set<string>(); const out: string[] = [];
  for (const r of drafts) {
    const name = ingredientName(r.name);
    if (!name || !(Number(r.amount) > 0)) continue;
    const id = `${ingredientKey(name)}/${r.unit}`;
    if (seen.has(id) && !said.has(id)) { said.add(id); out.push(`${name} in ${r.unit} is listed twice; only the first is kept.`); }
    seen.add(id);
  }
  return out;
}

/** Some scheduled supplement lists an ingredient, or you set a limit: the Totals sheet then has something to show even when no vitamin or mineral is listed. */
export const hasIngredientData = (items: SupplementItem[], limits: Record<string, IngredientLimit> = {}): boolean =>
  Object.keys(limits).length > 0 || items.some(i => i.slot && (i.ingredients || []).length > 0);

/** Element ids for the Totals rows: the name as a slug, and a number after it when two names make the same slug ("l-theanine" and "l theanine"). */
export function rowIds(keys: readonly string[]): string[] {
  const used = new Map<string, number>();
  return keys.map(k => { const s = k.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; const n = (used.get(s) ?? 0) + 1; used.set(s, n); return n === 1 ? s : `${s}-${n}`; });
}
