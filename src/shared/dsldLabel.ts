import { NUTRIENT_KEYS, type NutrientKey, type NutrientUnit } from './nutrientKeys.js';
import { CURATED_INGREDIENTS, MAX_INGREDIENT_AMOUNT, ingredientKey, ingredientName } from './supplementIngredients.js';

/* ---------- One supplement's label, as the app reads it (brief supplement-label-amounts, ADR 029 amendment) ----------
   The contract between `/api/supplement-label/<catalog id>` and the app, plus the pure mapper from a label of the NIH Dietary Supplement Label Database (DSLD,
   `/dsld/v9/label/<id>`) to it. One serving: the serving in words (and, for capsules, tablets and gummies, how many), the vitamins and minerals the app tracks (28) in its own keys and
   units, and everything else on the label, read-only. Nothing here guesses: an amount the label does not state is listed as "amount not stated", a unit with no standard conversion is
   kept as the label gives it (vitamin A and E in IU; the Totals sheet says it does not add them), and a nutrient the app does not track is listed, not counted. */

export interface LabelRow { key: NutrientKey; amount: number; unit: NutrientUnit }
/** An active ingredient the label states (omega-3, EPA, DHA, creatine, caffeine; brief supplement-active-ingredients): a curated name, the amount in one serving, the unit as printed. */
export interface LabelIngredient { name: string; amount: number; unit: NutrientUnit }
/** A label line the app does not count. No `amount`: the label gives none (a blend listed without a total, or "NP"). */
export interface LabelOther { name: string; amount?: number; unit?: string }
export interface LabelServing {
  /** The serving in words, as the label gives it ("2 gummies", "1 drop (0.028 mL or 0.001 fl. oz.)"). */
  text: string;
  /** Set for something countable (capsule, tablet, gummy, softgel...): how many make one serving. A liquid or powder serving has none. */
  units?: number;
  form?: string;
}
export interface SupplementLabel {
  name: string;
  brand?: string;
  entryYear?: number;
  upc?: string;
  serving: LabelServing | null;
  rows: LabelRow[];
  /** Active ingredient rows (same names and units as `SupplementItem.ingredients`); empty when the label states none. */
  ingredients: LabelIngredient[];
  other: LabelOther[];
}

export const MAX_OTHER = 80;
const TRACKED_UNITS: readonly string[] = ['g', 'IU', 'mcg', 'mg'];
/** Vitamin D, A and E can be listed in IU; no other nutrient is kept in IU (there is no row unit for it that Totals can read). */
const IU_KEYS: readonly NutrientKey[] = ['vitaminA', 'vitaminD', 'vitaminE'];

/* DSLD's `ingredientGroup` (lower case, trimmed) to the app's key. The group is steadier than the row's name ("Thiamine" is group "Thiamin"; "Folic Acid" is group "Folate"). */
const GROUPS: Record<string, NutrientKey> = {
  calcium: 'calcium', copper: 'copper', folate: 'folate', iodine: 'iodine', iron: 'iron', magnesium: 'magnesium', niacin: 'niacin', phosphorus: 'phosphorus', selenium: 'selenium',
  'vitamin a': 'vitaminA', 'vitamin b6': 'vitaminB6', 'vitamin c': 'vitaminC', 'vitamin d': 'vitaminD', 'vitamin e': 'vitaminE', zinc: 'zinc',
  potassium: 'potassium', 'vitamin b12': 'vitaminB12', 'vitamin k': 'vitaminK', fiber: 'fiber', 'dietary fiber': 'fiber', sodium: 'sodium',
  // brief supplement-more-nutrients. Group names read from live labels 2026-11-10: "Thiamin", "Vitamin B1 (Thiamine)", "Riboflavin", "Vitamin B2 (riboflavin 5-phosphate)", "Vitamin B7 (biotin)",
  // "Pantothenic Acid (Vitamin B5)", "Vitamin B5 (Pantothenic Acid)". "Vitamin B5 (pantethine)" is a different form, so bare "vitamin b5" is left out and only the pantothenic acid spelling is mapped.
  thiamin: 'thiamin', 'vitamin b1': 'thiamin', riboflavin: 'riboflavin', 'vitamin b2': 'riboflavin', biotin: 'biotin', 'vitamin b7': 'biotin',
  'pantothenic acid': 'pantothenicAcid', 'vitamin b5 (pantothenic acid)': 'pantothenicAcid', choline: 'choline', chromium: 'chromium', molybdenum: 'molybdenum', manganese: 'manganese',
};
const keyOfGroup = (group: string): NutrientKey | undefined => {
  const g = group.trim().toLowerCase();
  const direct = GROUPS[g];
  if (direct) return direct;
  const paren = g.replace(/\s*\(.*\)$/, ''); // "Vitamin B6 (Pyridoxine)"
  return paren !== g ? GROUPS[paren] : undefined;
};

/** Keys whose DSLD row can carry the weight of a salt, chelate or phosphate ("Choline Bitartrate", "Chromium Picolinate", "Riboflavin-5-Phosphate") rather than the nutrient: such a row is listed, not counted, unless its name is the nutrient itself. */
const COMPOUND_KEYS: readonly NutrientKey[] = ['choline', 'chromium', 'manganese', 'molybdenum', 'riboflavin'];
const plainName = (name: string, group: string): boolean => {
  const n = name.trim().toLowerCase(), g = group.trim().toLowerCase();
  return !g || n === g.replace(/\s*\(.*\)$/, '') || n === (g.match(/\(([^)]*)\)$/)?.[1] ?? '').trim() || n === g;
};

/* DSLD's `ingredientGroup` of an active ingredient to its curated name. Group names read from live labels 2026-11-10 (/dsld/v9/label/<id>): "Omega-3" (the row is "Omega-3 Fatty Acids" or
   "Total Omega-3 Fatty Acids"), "EPA (Eicosapentaenoic Acid)", "DHA (Docosahexaenoic Acid)", "Creatine" (row "Creatine Monohydrate"), "Caffeine" (row "PurCaf"). EPA and DHA sit inside the
   Omega-3 row, which sits inside the "Fish Oil" blend row; each is its own ingredient and nothing is subtracted. A row named "Other Omega-3 Fatty Acids" is what is left over after EPA and DHA,
   so it is not the omega-3 total and stays under "Also on the label". */
const INGREDIENT_GROUPS: Record<string, (typeof CURATED_INGREDIENTS)[number]> = {
  'omega-3': 'Omega-3', 'epa (eicosapentaenoic acid)': 'EPA', 'dha (docosahexaenoic acid)': 'DHA', creatine: 'Creatine', caffeine: 'Caffeine',
};
const ingredientOfRow = (name: string | undefined, group: string): (typeof CURATED_INGREDIENTS)[number] | undefined =>
  /^other\b/i.test(name ?? '') ? undefined : INGREDIENT_GROUPS[group.trim().toLowerCase()];

/** Curated order: Omega-3, EPA, DHA, Creatine, Caffeine. */
/** Most one serving can plausibly hold, in mg, so a misread unit (200 g of caffeine) is refused; a generous ceiling, not a recommended limit. IU is not a mass and is only range-checked by MAX_INGREDIENT_AMOUNT. */
const PLAUSIBLE_MG: Record<string, number> = { omega3: 100_000, epa: 100_000, dha: 100_000, creatine: 100_000, caffeine: 5_000 };
const MG_PER: Record<string, number> = { g: 1000, mg: 1, mcg: 0.001 };
export const plausibleIngredient = (name: string, amount: number, unit: string): boolean => unit === 'IU' || amount * (MG_PER[unit] ?? 0) <= (PLAUSIBLE_MG[name.toLowerCase().replace('-', '')] ?? 0);
const byCurated = (a: LabelIngredient, b: LabelIngredient) => CURATED_INGREDIENTS.indexOf(a.name as never) - CURATED_INGREDIENTS.indexOf(b.name as never);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The label's unit as one of the app's, or undefined. "mcg DFE", "mcg RAE", "mg NE" and "mg ATE" are the same weight with a note on what it is equivalent to; "Gram(s)" is grams. */
function unitOf(raw: unknown): NutrientUnit | undefined {
  const u = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/\s+(dfe|rae|ne|ate)$/, '') : '';
  const unit = u === 'gram(s)' || u === 'gram' || u === 'grams' ? 'g' : u === 'iu' ? 'IU' : u === 'µg' || u === 'ug' ? 'mcg' : u;
  return TRACKED_UNITS.includes(unit) ? (unit as NutrientUnit) : undefined;
}

interface Amount { amount: number; rawUnit: string }
/** The first stated amount of a row, or undefined (no quantity, 0, or "NP", which the label uses for "not present" as a unit). */
function amountOf(row: Record<string, unknown>): Amount | undefined {
  const q = Array.isArray(row.quantity) ? row.quantity[0] : undefined;
  if (!isObj(q)) return undefined;
  const amount = num(q.quantity), rawUnit = typeof q.unit === 'string' ? q.unit.trim() : '';
  if (amount === undefined || amount <= 0 || !rawUnit || rawUnit.toUpperCase() === 'NP') return undefined;
  return { amount, rawUnit };
}

/** A countable serving unit, with the form the supplement sheet shows. Order matters: "softgel" and "soft chew" before "chew". */
const FORMS: [RegExp, string][] = [[/softgel|soft gel|gelcap/i, 'Softgel'], [/capsule|vegcap|vcap/i, 'Capsule'], [/caplet/i, 'Caplet'], [/tablet/i, 'Tablet'], [/gumm(y|ies)/i, 'Gummy'], [/lozenge/i, 'Lozenge'], [/chew/i, 'Chewable']];
const plain = (unit: string, qty: number) => (qty === 1 ? unit.replace(/y\(ies\)/i, 'y').replace(/\(s\)/gi, '') : unit.replace(/y\(ies\)/i, 'ies').replace(/\(s\)/gi, 's'));

function servingOf(label: Record<string, unknown>): LabelServing | null {
  const s = Array.isArray(label.servingSizes) ? label.servingSizes[0] : undefined;
  if (!isObj(s)) return null;
  const qty = num(s.minQuantity), unit = text(s.unit, 60), notes = text(s.notes, 120);
  if (qty === undefined || qty <= 0 || !unit) return notes ? { text: notes } : null;
  const form = FORMS.find(([re]) => re.test(unit))?.[1];
  const words = notes || `${round3(qty)} ${plain(unit, qty)}`.slice(0, 120);
  return form && qty <= 100 ? { text: words, units: round3(qty), form } : { text: words };
}

/** What the app keeps from a DSLD label (the JSON of `/dsld/v9/label/<id>`), or null when it has no ingredient rows at all. Never throws. */
export function mapDsldLabel(raw: unknown): SupplementLabel | null {
  if (!isObj(raw) || !Array.isArray(raw.ingredientRows) || !raw.ingredientRows.length) return null;
  const rows: LabelRow[] = [], other: LabelOther[] = [], ingredients: LabelIngredient[] = [];
  const addOther = (name: string | undefined, a?: Amount) => { if (name && other.length < MAX_OTHER) other.push({ name: name.slice(0, 120), ...(a ? { amount: round3(a.amount), unit: a.rawUnit.slice(0, 20) } : {}) }); };
  /** The row as an active ingredient (the first row of each name wins), or false when it is not one or has no usable amount. */
  const taken = new WeakSet<object>();
  const addIngredient = (r: Record<string, unknown>): boolean => {
    const name = ingredientOfRow(text(r.name, 120), text(r.ingredientGroup, 120) ?? '');
    if (!name) return false;
    const a = amountOf(r), unit = a ? unitOf(a.rawUnit) : undefined;
    if (!a || !unit || a.amount > MAX_INGREDIENT_AMOUNT || ingredients.some(x => ingredientKey(x.name) === ingredientKey(name))) return false;
    ingredients.push({ name, amount: round3(a.amount), unit });
    taken.add(r);
    return true;
  };
  /** Active ingredients at any depth under `r` (EPA and DHA are two levels under the Fish Oil row). */
  const seekNested = (r: Record<string, unknown>, depth = 0): void => {
    if (depth > 4 || !Array.isArray(r.nestedRows)) return;
    for (const n of r.nestedRows) if (isObj(n)) { addIngredient(n); seekNested(n, depth + 1); }
  };
  for (const r of raw.ingredientRows) {
    if (!isObj(r)) continue;
    const name = text(r.name, 120) ?? text(r.ingredientGroup, 120);
    const group = text(r.ingredientGroup, 120) ?? '';
    const category = typeof r.category === 'string' ? r.category.toLowerCase() : '';
    const a = amountOf(r);
    const nested = Array.isArray(r.nestedRows) ? r.nestedRows.filter(isObj) : [];
    if (addIngredient(r)) { seekNested(r); continue; }
    const key = category === 'blend' ? undefined : keyOfGroup(group || name || '') ?? (name && name !== group ? keyOfGroup(name) : undefined); // a bare group such as "Vitamin B5" falls back to the row's name
    const unit = a ? unitOf(a.rawUnit) : undefined;
    // Folate: the label may state the DFE total with the folic acid inside it. The folic acid amount is what the upper limit counts, so it wins; DFE only when nothing else is given.
    const folic = key === 'folate' ? nested.map(n => ({ n, a: amountOf(n) })).find(x => x.a && keyOfGroup(text(x.n.ingredientGroup, 80) ?? '') === 'folate' && unitOf(x.a.rawUnit) === 'mcg') : undefined;
    const use: { amount: number; unit: NutrientUnit | undefined } | undefined = folic?.a ? { amount: folic.a.amount, unit: 'mcg' } : a ? { amount: a.amount, unit } : undefined;
    const fits = key && use?.unit && (!COMPOUND_KEYS.includes(key) || plainName(name ?? '', group)) && (use.unit !== 'IU' || IU_KEYS.includes(key)) && !rows.some(x => x.key === key);
    if (fits && key && use?.unit) rows.push({ key, amount: round3(use.amount), unit: use.unit });
    else addOther(name, a);
    seekNested(r);
    if (category === 'blend') for (const n of nested) { const na = amountOf(n); if (na && !taken.has(n)) addOther(text(n.name, 120), na); }
  }
  const name = text(raw.fullName, 300) ?? '';
  const brand = text(raw.brandName, 300), upc = text(raw.upcSku, 40), year = Number(String(raw.entryDate ?? '').slice(0, 4));
  rows.sort((a, b) => NUTRIENT_KEYS.indexOf(a.key) - NUTRIENT_KEYS.indexOf(b.key));
  ingredients.sort(byCurated);
  return { name, ...(brand ? { brand } : {}), ...(year >= 1990 && year <= 2100 ? { entryYear: year } : {}), ...(upc ? { upc } : {}), serving: servingOf(raw), rows, ingredients, other };
}

/** A label from the server's JSON (untrusted: the app checks it again before showing or saving it), or null when it is not one. */
export function cleanSupplementLabel(raw: unknown): SupplementLabel | null {
  if (!isObj(raw) || !Array.isArray(raw.rows) || !Array.isArray(raw.other)) return null;
  const rows: LabelRow[] = [], seen = new Set<string>();
  for (const r of raw.rows) {
    if (!isObj(r) || !(NUTRIENT_KEYS as readonly unknown[]).includes(r.key) || !TRACKED_UNITS.includes(r.unit as string)) continue;
    const amount = num(r.amount);
    if (amount === undefined || amount <= 0 || amount > 1e7 || seen.has(r.key as string)) continue;
    seen.add(r.key as string); rows.push({ key: r.key as NutrientKey, amount: round3(amount), unit: r.unit as NutrientUnit });
  }
  const ingredients = cleanLabelIngredients(raw.ingredients);
  const other: LabelOther[] = [];
  for (const o of raw.other.slice(0, MAX_OTHER)) {
    const name = isObj(o) ? text(o.name, 120) : undefined;
    if (!isObj(o) || !name) continue;
    const amount = num(o.amount), unit = text(o.unit, 20);
    other.push({ name, ...(amount !== undefined && amount > 0 && unit ? { amount, unit } : {}) });
  }
  const s = isObj(raw.serving) ? raw.serving : null;
  const words = s ? text(s.text, 120) : undefined, units = s ? num(s.units) : undefined, form = s ? text(s.form, 40) : undefined;
  const serving: LabelServing | null = words ? { text: words, ...(units !== undefined && units > 0 && units <= 100 ? { units: round3(units), ...(form ? { form } : {}) } : {}) } : null;
  const brand = text(raw.brand, 300), upc = text(raw.upc, 40), year = num(raw.entryYear);
  return { name: text(raw.name, 300) ?? '', ...(brand ? { brand } : {}), ...(year !== undefined && year >= 1990 && year <= 2100 ? { entryYear: year } : {}), ...(upc ? { upc } : {}), serving, rows, ingredients, other };
}

/** Ingredient rows from untrusted JSON (a server answer, the model's reply, a cached label from before this field existed): a curated name, a positive amount, a known unit; one row per name. */
export function cleanLabelIngredients(raw: unknown): LabelIngredient[] {
  const out: LabelIngredient[] = [];
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (!isObj(r) || typeof r.name !== 'string') continue;
    const name = ingredientName(r.name) as (typeof CURATED_INGREDIENTS)[number];
    const amount = num(r.amount), unit = r.unit as NutrientUnit;
    if (!(CURATED_INGREDIENTS as readonly string[]).includes(name) || amount === undefined || amount <= 0 || amount > MAX_INGREDIENT_AMOUNT || !TRACKED_UNITS.includes(unit as string) || !plausibleIngredient(name, amount, unit) || out.some(x => x.name === name)) continue;
    out.push({ name, amount: round3(amount), unit });
  }
  return out.sort(byCurated);
}
