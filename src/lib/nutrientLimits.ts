import type { NutrientKey } from '../shared/nutrientKeys.js';

/* ---------- Adult upper limits and recommended intakes, one row per nutrient ----------
   Health information: every figure is copied from the NIH Office of Dietary Supplements (ODS) health professional fact sheet named in
   `source` (the Dietary Reference Intake tables of the National Academies' Food and Nutrition Board), read 2026-11-08. Never type a number
   here from memory; a row without a source or with a non-positive limit fails `nutrientLimits.test.ts`.
   `upper`: the Tolerable Upper Intake Level (UL) for adults 19 and over, the strictest where the age groups differ (calcium 51+, phosphorus 71+),
   and the pregnancy and lactation ULs are the same or higher. `recommended`: the lowest and highest adult RDA (not pregnant or lactating),
   shown as a range because it depends on age and sex. `scope` says what the UL counts. Units are the limit's own unit; a total is converted to it. */

export interface NutrientLimit {
  key: NutrientKey;
  label: string;
  unit: 'mg' | 'mcg';
  upper: number;
  recommended: { min: number; max: number };
  /** What the recommended figures are measured in and any extra a reader needs. */
  recommendedNote: string;
  /** 'total': the UL counts food and supplements; 'supplements': it counts supplements only; 'form': it counts one form (see `scopeNote`). */
  scope: 'total' | 'supplements' | 'form';
  scopeNote: string;
  source: string;
  /** The day the figures were read from `source` (a fact sheet changes; the date says how old this is). */
  sourceDate: string;
}

const ODS = 'NIH Office of Dietary Supplements, https://ods.od.nih.gov/factsheets/';
const READ = '2026-11-08'; // the day the first 15 rows below were read
const READ2 = '2026-11-10'; // choline, manganese and molybdenum (brief supplement-more-nutrients)

export const NUTRIENT_LIMITS: NutrientLimit[] = [
  { key: 'calcium', label: 'Calcium', unit: 'mg', upper: 2000, recommended: { min: 1000, max: 1200 }, recommendedNote: 'adults 19 and over; 1,200 mg for women 51+ and everyone 71+',
    scope: 'total', scopeNote: '2,000 mg is the limit for ages 51+; 2,500 mg for 19 to 50. Counts food and supplements.', sourceDate: READ, source: `${ODS}Calcium-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'choline', label: 'Choline', unit: 'mg', upper: 3500, recommended: { min: 425, max: 550 }, recommendedNote: 'Adequate Intake for adults 19 and over: 550 mg for men, 425 mg for women',
    scope: 'total', scopeNote: 'Counts choline from food and supplements. The limit is based on low blood pressure and fishy body odor; it does not apply to people taking high doses under medical supervision.', sourceDate: READ2, source: `${ODS}Choline-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'copper', label: 'Copper', unit: 'mcg', upper: 10000, recommended: { min: 900, max: 900 }, recommendedNote: 'adults 19 and over',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}Copper-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'folate', label: 'Folate', unit: 'mcg', upper: 1000, recommended: { min: 400, max: 400 }, recommendedNote: 'mcg DFE (dietary folate equivalents) for adults 19 and over',
    scope: 'form', scopeNote: 'The limit is for synthetic folic acid from supplements and fortified food, not for folate in food. Enter the folic acid amount in mcg.', sourceDate: READ, source: `${ODS}Folate-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'iodine', label: 'Iodine', unit: 'mcg', upper: 1100, recommended: { min: 150, max: 150 }, recommendedNote: 'adults 19 and over',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}Iodine-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'iron', label: 'Iron', unit: 'mg', upper: 45, recommended: { min: 8, max: 18 }, recommendedNote: 'adults 19 and over: 8 mg for men and for women 51+, 18 mg for women 19 to 50',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}Iron-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', upper: 350, recommended: { min: 310, max: 420 }, recommendedNote: 'adults 19 and over, by age and sex',
    scope: 'supplements', scopeNote: 'The limit counts magnesium from supplements and medicines only, not magnesium in food and drink.', sourceDate: READ, source: `${ODS}Magnesium-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'manganese', label: 'Manganese', unit: 'mg', upper: 11, recommended: { min: 1.8, max: 2.3 }, recommendedNote: 'Adequate Intake for adults 19 and over: 2.3 mg for men, 1.8 mg for women',
    scope: 'total', scopeNote: 'The fact sheet gives the limit as one figure for healthy adults, with no split between food and supplements, so this counts both. It does not apply to people taking supplemental manganese under medical supervision. Tea, nuts and whole grains are high in manganese.', sourceDate: READ2, source: `${ODS}Manganese-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'molybdenum', label: 'Molybdenum', unit: 'mcg', upper: 2000, recommended: { min: 45, max: 45 }, recommendedNote: 'adults 19 and over',
    scope: 'total', scopeNote: 'The fact sheet gives the limit as one figure for healthy adults, with no split between food and supplements, so this counts both. It is based on animal studies of reproduction and fetal development, as there are no human studies.', sourceDate: READ2, source: `${ODS}Molybdenum-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'niacin', label: 'Niacin', unit: 'mg', upper: 35, recommended: { min: 14, max: 16 }, recommendedNote: 'mg NE (niacin equivalents) for adults 19 and over',
    scope: 'form', scopeNote: 'The limit is for niacin from supplements; it does not apply to niacin taken under medical supervision.', sourceDate: READ, source: `${ODS}Niacin-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg', upper: 3000, recommended: { min: 700, max: 700 }, recommendedNote: 'adults 19 and over',
    scope: 'total', scopeNote: '3,000 mg is the limit for ages 71+; 4,000 mg for 19 to 70. Counts food and supplements.', sourceDate: READ, source: `${ODS}Phosphorus-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'selenium', label: 'Selenium', unit: 'mcg', upper: 400, recommended: { min: 55, max: 55 }, recommendedNote: 'adults 19 and over',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}Selenium-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', upper: 3000, recommended: { min: 700, max: 900 }, recommendedNote: 'mcg RAE (retinol activity equivalents): 900 for men, 700 for women, adults 19 and over',
    scope: 'form', scopeNote: 'The limit is for preformed vitamin A (retinol and its esters such as retinyl palmitate), not for beta-carotene. Enter the retinol amount in mcg.', sourceDate: READ, source: `${ODS}VitaminA-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'vitaminB6', label: 'Vitamin B6', unit: 'mg', upper: 100, recommended: { min: 1.3, max: 1.7 }, recommendedNote: 'adults 19 and over, by age and sex',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}VitaminB6-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', upper: 2000, recommended: { min: 75, max: 90 }, recommendedNote: 'adults 19 and over: 90 mg for men, 75 mg for women; 35 mg more for people who smoke',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}VitaminC-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', upper: 100, recommended: { min: 15, max: 20 }, recommendedNote: 'adults 19 and over: 15 mcg (600 IU) up to age 70, 20 mcg (800 IU) from 71; 1 mcg = 40 IU',
    scope: 'total', scopeNote: 'Counts vitamin D from food and supplements.', sourceDate: READ, source: `${ODS}VitaminD-HealthProfessional/ (Tables 2 and 4)` },
  { key: 'vitaminE', label: 'Vitamin E', unit: 'mg', upper: 1000, recommended: { min: 15, max: 15 }, recommendedNote: 'mg alpha-tocopherol, adults 19 and over',
    scope: 'form', scopeNote: 'The limit is for any form of supplemental alpha-tocopherol, including synthetic vitamin E.', sourceDate: READ, source: `${ODS}VitaminE-HealthProfessional/ (Tables 1 and 3)` },
  { key: 'zinc', label: 'Zinc', unit: 'mg', upper: 40, recommended: { min: 8, max: 11 }, recommendedNote: 'adults 19 and over: 11 mg for men, 8 mg for women',
    scope: 'total', scopeNote: 'Counts food and supplements.', sourceDate: READ, source: `${ODS}Zinc-HealthProfessional/ (Tables 1 and 3)` },
];

const BY_KEY = new Map(NUTRIENT_LIMITS.map(r => [r.key, r]));
export const limitOf = (key: NutrientKey): NutrientLimit | undefined => BY_KEY.get(key);
