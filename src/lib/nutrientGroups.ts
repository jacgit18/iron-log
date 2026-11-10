import type { NutrientKey } from '../shared/nutrientKeys.js';
import { profileAge } from '../shared/profile.js';
import type { Profile } from '../shared/profile.js';

/* ---------- Recommended amounts and upper limits by age and sex, one row per nutrient (brief recommendations-by-age-sex) ----------
   Health information: every figure is copied from the NIH Office of Dietary Supplements (ODS) health professional fact sheet named in `source` (the National Academies' Dietary
   Reference Intake tables), read 2026-11-09 (choline, manganese, molybdenum, biotin, chromium, pantothenic acid, riboflavin and thiamin: 2026-11-10), never typed from memory. A band is one run of adult ages where nothing changes for a nutrient: the bands of the Recommended table and
   of the Tolerable Upper Intake Level (UL) table, merged. `female` and `male` are the RDA, or the Adequate Intake (AI) for potassium, vitamin K and fiber; `ul` is the same for both
   sexes in every adult row read, and is left out where there is none (potassium, vitamin B12, vitamin K, fiber, sodium). Ages 19 and over only, not pregnant or lactating (those
   groups are out of scope). `nutrientGroups.test.ts` fails on a missing source, a gap or overlap between bands, or a figure that disagrees with the adult range in
   `nutrientLimits.ts` and `nutrientTargets.ts`, which stay the fallback when there is no profile. Units are the nutrient's own (`MICRO_UNIT`). */

export interface GroupBand {
  /** First age in the band, and the last (left out: no upper age). */
  from: number;
  to?: number;
  female: number;
  male: number;
  /** The upper limit for this band, both sexes. */
  ul?: number;
}

export interface NutrientGroups {
  key: NutrientKey;
  /** 'RDA' for most; 'AI' where only an Adequate Intake is set (potassium, vitamin K, fiber, sodium). */
  basis: 'AI' | 'RDA';
  bands: GroupBand[];
  source: string;
}

const ODS = 'NIH Office of Dietary Supplements, https://ods.od.nih.gov/factsheets/';
const ods = (page: string, tables: string) => `${ODS}${page}-HealthProfessional/ (${tables})`;
const NASEM_FIBER = 'National Academies of Sciences, Engineering, and Medicine news release on the Dietary Reference Intakes for macronutrients, https://www.nationalacademies.org/news/report-offers-new-eating-and-physical-activity-targets-to-reduce-chronic-disease-risk';
const NASEM_SODIUM = 'National Academies of Sciences, Engineering, and Medicine news release on the 2019 sodium and potassium Dietary Reference Intakes, https://nationalacademies.org/news/2019/03/sodium-and-potassium-dietary-reference-intake-values-updated-in-new-report';

export const NUTRIENT_GROUPS: NutrientGroups[] = [
  { key: 'calcium', basis: 'RDA', source: ods('Calcium', 'Tables 1 and 3'), bands: [
    { from: 19, to: 50, female: 1000, male: 1000, ul: 2500 },
    { from: 51, to: 70, female: 1200, male: 1000, ul: 2000 },
    { from: 71, female: 1200, male: 1200, ul: 2000 },
  ] },
  { key: 'choline', basis: 'AI', source: ods('Choline', 'Tables 1 and 3'), bands: [{ from: 19, female: 425, male: 550, ul: 3500 }] },
  { key: 'copper', basis: 'RDA', source: ods('Copper', 'Tables 1 and 3'), bands: [{ from: 19, female: 900, male: 900, ul: 10000 }] },
  { key: 'folate', basis: 'RDA', source: ods('Folate', 'Tables 1 and 3'), bands: [{ from: 19, female: 400, male: 400, ul: 1000 }] },
  { key: 'iodine', basis: 'RDA', source: ods('Iodine', 'Tables 1 and 3'), bands: [{ from: 19, female: 150, male: 150, ul: 1100 }] },
  { key: 'iron', basis: 'RDA', source: ods('Iron', 'Tables 1 and 3'), bands: [
    { from: 19, to: 50, female: 18, male: 8, ul: 45 },
    { from: 51, female: 8, male: 8, ul: 45 },
  ] },
  { key: 'magnesium', basis: 'RDA', source: ods('Magnesium', 'Tables 1 and 3'), bands: [
    { from: 19, to: 30, female: 310, male: 400, ul: 350 },
    { from: 31, female: 320, male: 420, ul: 350 },
  ] },
  { key: 'manganese', basis: 'AI', source: ods('Manganese', 'Tables 1 and 3'), bands: [{ from: 19, female: 1.8, male: 2.3, ul: 11 }] },
  { key: 'molybdenum', basis: 'RDA', source: ods('Molybdenum', 'Tables 1 and 3'), bands: [{ from: 19, female: 45, male: 45, ul: 2000 }] },
  { key: 'niacin', basis: 'RDA', source: ods('Niacin', 'Tables 1 and 3'), bands: [{ from: 19, female: 14, male: 16, ul: 35 }] },
  { key: 'phosphorus', basis: 'RDA', source: ods('Phosphorus', 'Tables 1 and 3'), bands: [
    { from: 19, to: 70, female: 700, male: 700, ul: 4000 },
    { from: 71, female: 700, male: 700, ul: 3000 },
  ] },
  { key: 'selenium', basis: 'RDA', source: ods('Selenium', 'Tables 1 and 3'), bands: [{ from: 19, female: 55, male: 55, ul: 400 }] },
  { key: 'vitaminA', basis: 'RDA', source: ods('VitaminA', 'Tables 1 and 3'), bands: [{ from: 19, female: 700, male: 900, ul: 3000 }] },
  { key: 'vitaminB6', basis: 'RDA', source: ods('VitaminB6', 'Tables 1 and 3'), bands: [
    { from: 19, to: 50, female: 1.3, male: 1.3, ul: 100 },
    { from: 51, female: 1.5, male: 1.7, ul: 100 },
  ] },
  { key: 'vitaminC', basis: 'RDA', source: ods('VitaminC', 'Tables 1 and 3'), bands: [{ from: 19, female: 75, male: 90, ul: 2000 }] },
  { key: 'vitaminD', basis: 'RDA', source: ods('VitaminD', 'Tables 2 and 4'), bands: [
    { from: 19, to: 70, female: 15, male: 15, ul: 100 },
    { from: 71, female: 20, male: 20, ul: 100 },
  ] },
  { key: 'vitaminE', basis: 'RDA', source: ods('VitaminE', 'Tables 1 and 3'), bands: [{ from: 19, female: 15, male: 15, ul: 1000 }] },
  { key: 'zinc', basis: 'RDA', source: ods('Zinc', 'Tables 1 and 3'), bands: [{ from: 19, female: 8, male: 11, ul: 40 }] },
  { key: 'potassium', basis: 'AI', source: ods('Potassium', 'Table 1'), bands: [{ from: 19, female: 2600, male: 3400 }] },
  { key: 'vitaminB12', basis: 'RDA', source: ods('VitaminB12', 'Table 1'), bands: [{ from: 19, female: 2.4, male: 2.4 }] },
  { key: 'vitaminK', basis: 'AI', source: ods('VitaminK', 'Table 1'), bands: [{ from: 19, female: 90, male: 120 }] },
  { key: 'fiber', basis: 'AI', source: NASEM_FIBER, bands: [
    { from: 19, to: 50, female: 25, male: 38 },
    { from: 51, female: 21, male: 30 },
  ] },
  { key: 'sodium', basis: 'AI', source: NASEM_SODIUM, bands: [{ from: 19, female: 1500, male: 1500 }] },
  { key: 'biotin', basis: 'AI', source: ods('Biotin', 'Table 1'), bands: [{ from: 19, female: 30, male: 30 }] },
  { key: 'chromium', basis: 'AI', source: ods('Chromium', 'Table 1'), bands: [
    { from: 19, to: 50, female: 25, male: 35 },
    { from: 51, female: 20, male: 30 },
  ] },
  { key: 'pantothenicAcid', basis: 'AI', source: ods('PantothenicAcid', 'Table 1'), bands: [{ from: 19, female: 5, male: 5 }] },
  { key: 'riboflavin', basis: 'RDA', source: ods('Riboflavin', 'Table 1'), bands: [{ from: 19, female: 1.1, male: 1.3 }] },
  { key: 'thiamin', basis: 'RDA', source: ods('Thiamin', 'Table 1'), bands: [{ from: 19, female: 1.1, male: 1.2 }] },
];

const BY_KEY = new Map(NUTRIENT_GROUPS.map(r => [r.key, r]));

/** Which adult ages a band covers, in words: "ages 51 and over", "ages 31 to 50". */
export const bandText = (b: GroupBand): string => (b.to === undefined ? `ages ${b.from} and over` : `ages ${b.from} to ${b.to}`);

export interface GroupFigures {
  recommended: number;
  /** Left out where the nutrient has no upper limit. */
  upper?: number;
  /** The group the figures are for, in words: "women ages 31 to 50". */
  group: string;
  /** Just the ages, for a limit that does not change with sex: "ages 51 to 70". */
  ages: string;
  basis: 'AI' | 'RDA';
}

/** The figures for this person, or `undefined` when there is no usable profile (both a valid birth year and a sex are needed, age 19 to 120) or no band covers the age; the caller then shows the adult range. */
export function groupFor(key: NutrientKey, profile: Profile | undefined, today: string): GroupFigures | undefined {
  const age = profileAge(profile, today);
  if (age === undefined || !profile?.sex) return undefined;
  const row = BY_KEY.get(key);
  const band = row?.bands.find(b => age >= b.from && (b.to === undefined || age <= b.to));
  if (!row || !band) return undefined;
  return {
    recommended: band[profile.sex],
    ...(band.ul !== undefined ? { upper: band.ul } : {}),
    group: `${profile.sex === 'female' ? 'women' : 'men'} ${bandText(band)}`,
    ages: bandText(band),
    basis: row.basis,
  };
}

export const recommendedFor = (key: NutrientKey, profile: Profile | undefined, today: string): number | undefined => groupFor(key, profile, today)?.recommended;
export const upperFor = (key: NutrientKey, profile: Profile | undefined, today: string): number | undefined => groupFor(key, profile, today)?.upper;
