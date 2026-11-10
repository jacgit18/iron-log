import { cleanSupplementLabel, MAX_OTHER, type LabelOther, type LabelRow, type LabelServing, type SupplementLabel } from './dsldLabel.js';
import { MICRO_MAX, MICRO_UNIT } from './foodMicro.js';
import { NUTRIENT_KEYS, type NutrientKey, type NutrientUnit } from './nutrientKeys.js';

/* ---------- A supplement bottle's Supplement Facts panel, read by the model (brief supplement-label-scan) ----------
   Pure and shared by the server (which asks the model) and the app (which re-checks the answer before showing it). The model's reply is data: only the fixed fields below are read,
   each checked against a range, so text printed on a bottle cannot add a field or change what a number means. The output is the same `SupplementLabel` the NIH catalog gives
   (`dsldLabel.ts`), so one preview, one fill plan and one add path serve both. Nothing is converted: an amount keeps the unit the panel printed (IU only for vitamins A, D and E). */

export type SupplementScanResult = { kind: 'ok'; label: SupplementLabel } | { kind: 'unreadable' };

const UNREADABLE: SupplementScanResult = { kind: 'unreadable' };
const UNITS: readonly string[] = ['g', 'IU', 'mcg', 'mg'];
const IU_KEYS: readonly NutrientKey[] = ['vitaminA', 'vitaminD', 'vitaminE'];
/** Most weight (in the app's unit for the nutrient) one IU can be, so an IU amount is range-checked generously: vitamin A 0.6 mcg, D 0.025 mcg, E 0.9 mg. */
const IU_MAX_WEIGHT: Partial<Record<NutrientKey, number>> = { vitaminA: 0.6, vitaminD: 0.025, vitaminE: 0.9 };
/** The countable forms the supplement sheet knows (`dsldLabel.ts` FORMS); a countable serving with another form is kept as words only. */
const FORMS: readonly string[] = ['Softgel', 'Capsule', 'Caplet', 'Tablet', 'Gummy', 'Lozenge', 'Chewable'];
const IS_KEY = (k: unknown): k is NutrientKey => (NUTRIENT_KEYS as readonly unknown[]).includes(k);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** `amount` in the app's own unit for `key`, for the range check only; undefined when the unit is not one of the four. */
function inAppUnit(key: NutrientKey, amount: number, unit: NutrientUnit): number | undefined {
  const to = MICRO_UNIT[key];
  if (unit === 'IU') return IU_KEYS.includes(key) ? amount * (IU_MAX_WEIGHT[key] ?? 0) : undefined;
  const mcg = unit === 'g' ? amount * 1e6 : unit === 'mg' ? amount * 1e3 : amount;
  return to === 'g' ? mcg / 1e6 : to === 'mg' ? mcg / 1e3 : mcg;
}

function rowsOf(raw: unknown): LabelRow[] {
  const rows: LabelRow[] = [], seen = new Set<string>();
  if (!Array.isArray(raw)) return rows;
  for (const r of raw) {
    if (!isObj(r) || !IS_KEY(r.key) || seen.has(r.key)) continue;
    const amount = num(r.amount), unit = r.unit as NutrientUnit;
    if (amount === undefined || amount <= 0 || !UNITS.includes(unit as string)) continue;
    const there = inAppUnit(r.key, amount, unit);
    if (there === undefined || there > MICRO_MAX[r.key]) continue; // a misread, or IU for a nutrient that has no IU
    seen.add(r.key); rows.push({ key: r.key, amount: round3(amount), unit });
  }
  return rows.sort((a, b) => NUTRIENT_KEYS.indexOf(a.key) - NUTRIENT_KEYS.indexOf(b.key));
}

function otherOf(raw: unknown): LabelOther[] {
  const other: LabelOther[] = [];
  if (!Array.isArray(raw)) return other;
  for (const o of raw) {
    if (other.length >= MAX_OTHER) break;
    const name = isObj(o) ? text(o.name, 120) : undefined;
    if (!isObj(o) || !name) continue;
    const amount = num(o.amount), unit = text(o.unit, 20);
    other.push({ name, ...(amount !== undefined && amount > 0 && unit ? { amount: round3(amount), unit } : {}) }); // no amount: a blend listed without a total ("amount not stated")
  }
  return other;
}

function servingOf(raw: unknown): LabelServing | null {
  if (!isObj(raw)) return null;
  const words = text(raw.text, 120);
  if (!words) return null;
  const units = num(raw.units), form = FORMS.find(f => f.toLowerCase() === String(raw.form ?? '').trim().toLowerCase());
  return units !== undefined && units > 0 && units <= 100 && form ? { text: words, units: round3(units), form } : { text: words };
}

/** One parsed model answer as a result. `{}`, a non-object, or an answer with no rows, no other lines and no serving is unreadable; an answer with only other lines is kept (herbs and blends), so the preview can say nothing tracked was found. */
export function cleanSupplementScan(raw: unknown): SupplementScanResult {
  if (!isObj(raw)) return UNREADABLE;
  const rows = rowsOf(raw.rows), other = otherOf(raw.other), serving = servingOf(raw.serving);
  if (!rows.length && !other.length) return UNREADABLE;
  const name = text(raw.name, 300) ?? '', brand = text(raw.brand, 300);
  return { kind: 'ok', label: { name, ...(brand ? { brand } : {}), serving, rows, other } };
}

/** The route's answer as the app reads it; anything that is not a known shape is "unreadable". The label is checked again with the same cleaner as a catalog label. */
export function cleanSupplementScanAnswer(body: unknown): SupplementScanResult {
  const result = isObj(body) && isObj(body.result) ? body.result : null;
  if (!result || result.kind !== 'ok') return UNREADABLE;
  const label = cleanSupplementLabel(result.label);
  return label && (label.rows.length || label.other.length) ? { kind: 'ok', label } : UNREADABLE;
}
