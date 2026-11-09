import { NUTRIENT_KEYS } from './nutrientKeys.js';
import type { NutrientKey } from './nutrientKeys.js';

/* ---------- Vitamins and minerals in a food (brief food-vitamins-minerals) ----------
   `Micro` is the amount of each of the 20 nutrients in `NUTRIENT_KEYS` (the 15 in the limits table and the 5 in the targets table), in that nutrient's own unit (`MICRO_UNIT`: mg, mcg or g, never IU), either per 100 g (a lookup result) or as eaten
   (a diet entry). Keys are written in NUTRIENT_KEYS order so a cleaned value compares equal to itself (`validDietEntry`). A missing key means "the source does not say", not zero.
   `MICRO_MAX` is ten times the adult upper limit in `src/lib/nutrientLimits.ts`, or for the nutrients with no limit the cap in `src/lib/nutrientTargets.ts` (a unit test keeps both in step): a bigger number is a misread, so it is dropped, never stored.
   The two vendor maps below turn USDA FoodData Central and Open Food Facts answers into a Micro per 100 g; nothing here is stored or sent on its own. */

export type Micro = Partial<Record<NutrientKey, number>>;

export const MICRO_UNIT: Record<NutrientKey, 'mg' | 'mcg' | 'g'> = {
  calcium: 'mg', copper: 'mcg', folate: 'mcg', iodine: 'mcg', iron: 'mg', magnesium: 'mg', niacin: 'mg', phosphorus: 'mg', selenium: 'mcg',
  vitaminA: 'mcg', vitaminB6: 'mg', vitaminC: 'mg', vitaminD: 'mcg', vitaminE: 'mg', zinc: 'mg',
  potassium: 'mg', vitaminB12: 'mcg', vitaminK: 'mcg', fiber: 'g', sodium: 'mg',
};
export const MICRO_MAX: Record<NutrientKey, number> = {
  calcium: 20000, copper: 100000, folate: 10000, iodine: 11000, iron: 450, magnesium: 3500, niacin: 350, phosphorus: 30000, selenium: 4000,
  vitaminA: 30000, vitaminB6: 1000, vitaminC: 20000, vitaminD: 1000, vitaminE: 10000, zinc: 400,
  potassium: 68000, vitaminB12: 48, vitaminK: 2400, fiber: 760, sodium: 46000, // no limit to derive these from: 20 times the larger recommended amount (sodium: the 2,300 mg level), see `nutrientTargets.ts`
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The clean Micro in `v`: known keys with a finite amount above 0 and within MICRO_MAX, three decimals, in NUTRIENT_KEYS order. Null when nothing usable is left. */
export function cleanMicro(v: unknown): Micro | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Micro = {};
  for (const k of NUTRIENT_KEYS) {
    const a = o[k];
    if (typeof a !== 'number' || !Number.isFinite(a)) continue;
    const r = round3(a);
    if (r > 0 && r <= MICRO_MAX[k]) out[k] = r;
  }
  return Object.keys(out).length ? out : null;
}

/** `m` times `factor` (grams eaten over 100, or portions), cleaned again so a result over the cap is dropped; undefined when nothing is left. */
export function scaleMicro(m: Micro | undefined, factor: number): Micro | undefined {
  if (!m || !(factor > 0)) return undefined;
  const out: Record<string, number> = {};
  for (const k of NUTRIENT_KEYS) { const a = m[k]; if (a !== undefined) out[k] = a * factor; }
  return cleanMicro(out) ?? undefined;
}

/** `{ micro }` when there is one, else nothing: for spreading into an object literal. */
export const withMicro = (m: Micro | undefined): { micro?: Micro } => (m ? { micro: m } : {});

/* ---- USDA FoodData Central: nutrient numbers and the factor to our unit ----
   Numbers and units as FoodData Central names them (read-only: from the vendor's nutrient list, to be checked against one live answer). Copper is reported in mg and we hold mcg. Folate prefers DFE (435) over total (417).
   Vitamin D prefers mcg (328); an IU-only food (324) is converted at 40 IU per mcg, the same factor the supplement totals use. Vitamin A takes RAE (320) only, never IU. */
const USDA: { key: NutrientKey; numbers: string[]; factor: number }[] = [
  { key: 'calcium', numbers: ['301'], factor: 1 }, { key: 'copper', numbers: ['312'], factor: 1000 }, { key: 'folate', numbers: ['435', '417'], factor: 1 },
  { key: 'iodine', numbers: ['314'], factor: 1 }, { key: 'iron', numbers: ['303'], factor: 1 }, { key: 'magnesium', numbers: ['304'], factor: 1 },
  { key: 'niacin', numbers: ['406'], factor: 1 }, { key: 'phosphorus', numbers: ['305'], factor: 1 }, { key: 'selenium', numbers: ['317'], factor: 1 },
  { key: 'vitaminA', numbers: ['320'], factor: 1 }, { key: 'vitaminB6', numbers: ['415'], factor: 1 }, { key: 'vitaminC', numbers: ['401'], factor: 1 },
  { key: 'vitaminD', numbers: ['328'], factor: 1 }, { key: 'vitaminE', numbers: ['323'], factor: 1 }, { key: 'zinc', numbers: ['309'], factor: 1 },
  // No upper limit (brief nutrients-without-upper-limit): potassium, sodium in mg; vitamin K and B12 in mcg; total dietary fiber in g.
  { key: 'potassium', numbers: ['306'], factor: 1 }, { key: 'vitaminB12', numbers: ['418'], factor: 1 }, { key: 'vitaminK', numbers: ['430'], factor: 1 },
  { key: 'fiber', numbers: ['291'], factor: 1 }, { key: 'sodium', numbers: ['307'], factor: 1 },
];

/** Per 100 g from USDA's amounts by nutrient number (the map `parseFoods` builds), or undefined when it lists none of ours. */
export function usdaMicro(amounts: ReadonlyMap<string, number>): Micro | undefined {
  const out: Record<string, number> = {};
  for (const { key, numbers, factor } of USDA) {
    const n = numbers.find(x => amounts.has(x));
    if (n !== undefined) out[key] = amounts.get(n)! * factor;
  }
  const iu = amounts.get('324');
  if (out.vitaminD === undefined && iu !== undefined) out.vitaminD = iu / 40;
  return cleanMicro(out) ?? undefined;
}

/* ---- Open Food Facts: `nutriments` fields, grams per 100 g ---- */
const OFF: [NutrientKey, string][] = [
  ['calcium', 'calcium'], ['copper', 'copper'], ['folate', 'vitamin-b9'], ['iodine', 'iodine'], ['iron', 'iron'], ['magnesium', 'magnesium'], ['niacin', 'vitamin-pp'],
  ['phosphorus', 'phosphorus'], ['selenium', 'selenium'], ['vitaminA', 'vitamin-a'], ['vitaminB6', 'vitamin-b6'], ['vitaminC', 'vitamin-c'], ['vitaminD', 'vitamin-d'],
  ['vitaminE', 'vitamin-e'], ['zinc', 'zinc'],
  ['potassium', 'potassium'], ['vitaminB12', 'vitamin-b12'], ['vitaminK', 'vitamin-k'], ['fiber', 'fiber'], ['sodium', 'sodium'],
];

/** Per 100 g from an Open Food Facts `nutriments` object (every amount in grams, text or number), or undefined when it lists none of ours. */
export function offMicro(nutriments: Record<string, unknown> | null): Micro | undefined {
  if (!nutriments) return undefined;
  const out: Record<string, number> = {};
  for (const [key, field] of OFF) {
    const raw = nutriments[`${field}_100g`];
    const g = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (Number.isFinite(g) && g > 0) out[key] = g * (MICRO_UNIT[key] === 'mg' ? 1e3 : MICRO_UNIT[key] === 'mcg' ? 1e6 : 1);
  }
  return cleanMicro(out) ?? undefined;
}
