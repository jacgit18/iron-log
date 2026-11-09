import type { TargetKey } from '../shared/nutrientKeys.js';

/* ---------- Recommended intakes for nutrients with no upper limit, one row per nutrient (brief nutrients-without-upper-limit) ----------
   Health information: every figure is copied from the page named in `source`, read 2026-11-09, never typed from memory; a row without a source or with a non-positive figure fails
   `nutrientTargets.test.ts`. These are not limits: potassium, vitamin K and vitamin B12 have no Tolerable Upper Intake Level (the committees found too little evidence of harm, or a low potential
   for toxicity), fiber has none either, and sodium's figure is a Chronic Disease Risk Reduction level, a level to stay under, not an upper limit. Nothing built on this table may warn.
   `recommended`: the lowest and highest adult figure (men and women 19 and over, not pregnant or lactating), shown as a range because it depends on age and sex. `basis`: 'AI' (an
   Adequate Intake: set where evidence is thinner than for a requirement) or 'RDA' (a Recommended Dietary Allowance). `stayUnder` is set only for sodium. `cap` is a plausibility cap for
   one entry, set at 20 times the larger of the adult recommended amount and the stay-under level, because there is no limit to derive one from; an amount over it is dropped as a misread. */

export interface NutrientTarget {
  key: TargetKey;
  label: string;
  unit: 'mg' | 'mcg' | 'g';
  recommended: { min: number; max: number };
  basis: 'AI' | 'RDA';
  /** What the recommended figures are and any extra a reader needs. */
  recommendedNote: string;
  /** Sodium only: the level to stay under (a reduction level, not an upper limit). */
  stayUnder?: number;
  /** What the figure counts and what it is not. */
  scopeNote: string;
  cap: number;
  source: string;
}

const ODS = 'NIH Office of Dietary Supplements, https://ods.od.nih.gov/factsheets/';
const NASEM_SODIUM = 'National Academies of Sciences, Engineering, and Medicine news release on the 2019 sodium and potassium Dietary Reference Intakes, https://nationalacademies.org/news/2019/03/sodium-and-potassium-dietary-reference-intake-values-updated-in-new-report';

export const NUTRIENT_TARGETS: NutrientTarget[] = [
  { key: 'potassium', label: 'Potassium', unit: 'mg', recommended: { min: 2600, max: 3400 }, basis: 'AI', recommendedNote: 'Adequate Intake for adults 19 and over: 3,400 mg for men, 2,600 mg for women',
    scopeNote: 'There is no upper limit: the National Academies found too little evidence to set one. Counts food and supplements.', cap: 68000, source: `${ODS}Potassium-HealthProfessional/ (Table 1)` },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', recommended: { min: 2.4, max: 2.4 }, basis: 'RDA', recommendedNote: 'Recommended Dietary Allowance for adults 19 and over',
    scopeNote: 'There is no upper limit: it has a low potential for toxicity. Counts food and supplements.', cap: 48, source: `${ODS}VitaminB12-HealthProfessional/ (Table 1)` },
  { key: 'vitaminK', label: 'Vitamin K', unit: 'mcg', recommended: { min: 90, max: 120 }, basis: 'AI', recommendedNote: 'Adequate Intake for adults 19 and over: 120 mcg for men, 90 mcg for women',
    scopeNote: 'There is no upper limit: it has a low potential for toxicity. Counts food and supplements.', cap: 2400, source: `${ODS}VitaminK-HealthProfessional/ (Table 1)` },
  { key: 'fiber', label: 'Fiber', unit: 'g', recommended: { min: 21, max: 38 }, basis: 'AI', recommendedNote: 'Adequate Intake for total fiber: 38 g for men and 25 g for women 50 and younger, 30 g and 21 g over 50',
    scopeNote: 'There is no upper limit set. Counts food and supplements.', cap: 760, source: 'National Academies of Sciences, Engineering, and Medicine news release on the Dietary Reference Intakes for macronutrients, https://www.nationalacademies.org/news/report-offers-new-eating-and-physical-activity-targets-to-reduce-chronic-disease-risk' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', recommended: { min: 1500, max: 1500 }, basis: 'AI', recommendedNote: 'Adequate Intake for ages 14 and older', stayUnder: 2300,
    scopeNote: '2,300 mg is a Chronic Disease Risk Reduction level: reduce intake if it is above, for people 14 and older. It is a level to stay under, not an upper limit. Counts food and supplements.', cap: 46000, source: NASEM_SODIUM },
];

const BY_KEY = new Map(NUTRIENT_TARGETS.map(r => [r.key, r]));
export const targetOf = (key: string): NutrientTarget | undefined => BY_KEY.get(key as TargetKey);
