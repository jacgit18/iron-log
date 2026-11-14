/* ---------- QA user scenarios (brief: qa-scenarios) ----------
   Numbered "try this" scripts for a tester on QA, each run as one test account from server/qa/personas.ts. One list read by three things: the
   picker (a persona's "Used in S-xx" tags, through the list answer), the scenarios document (scripts/qa-scenarios-doc.mjs) and the accounts
   document's "Used in" column. Nothing here records a result: the owner fills the document's Result column by hand.
   Ids are never reused or renumbered; a scenario that no longer applies stays in the list with `retired: true`.
   Each one is written from its shipped brief's Done when lines and the feature map. Seed facts the steps lean on are in server/qa/seedPlan.ts:
   the Diet accounts hold targets of 2,400 kcal and 160 g protein, meals "Usual breakfast", "Chicken bowl", "Post-workout" and "Quick dinner",
   five recipes (Egg and spinach scramble, Overnight oats, Chicken and rice bowl, Baked salmon, and Black bean rice with no fat figure) for the planner, and 30 generated recipes for the collector. */

import { scenarioModules } from './scenarioFiles.ts';

export type ScenarioFeature =
  | 'Diet targets and log'
  | 'Goal calories and pace'
  | 'Saved meals'
  | 'Meal planner'
  | 'Suggest and copy'
  | 'Auto macros'
  | 'Ingredient macros'
  | 'Food lookup'
  | 'Recipe-first log'
  | 'Recipe nutrition'
  | 'Recipe servings'
  | 'Recipe video link'
  | 'Recipe auto-match'
  | 'Share target'
  | 'Account menu'
  | 'QA picker'
  | 'Wide layouts'
  | 'Admin accounts'
  | 'kg beside lb'
  | 'Label scan'
  | 'Whole pack'
  | 'Receipt photos'
  | 'Receipt scan'
  | 'Receipt reconcile'
  | 'Sharing done'
  | 'Usual amount'
  | 'Finished group'
  | 'Weight step'
  | 'Ideas to try'
  | 'Program compare'
  | 'Polish pass'
  | 'Program on phones'
  | 'Program tab clarity'
  | 'Stale page guard'
  | 'Barcode scan'
  | 'Custom 404'
  | 'Receipt store'
  | 'Receipt merge'
  | 'Bulk share'
  | 'Link previews'
  | 'Moved-card tag'
  | 'Search hiding'
  | 'Security headers'
  | 'Price history'
  | 'Program desktop layout'
  | 'Groceries views'
  | 'Food type'
  | 'Recipes find'
  | 'Nutrition quick log'
  | 'Meals from foods'
  | 'Grocery budget'
  | 'Recipe star'
  | 'Used as'
  | 'Library rows'
  | 'Goes with'
  | 'Saved meals move'
  | 'Counts as'
  | 'Week board'
  | 'Nutrition board'
  | 'Supplement portions'
  | 'Joined week and day tabs'
  | 'Vitamin and mineral totals'
  | 'Vitamin and mineral day line'
  | 'Food vitamins and minerals'
  | 'Typed amounts'
  | 'Age and sex amounts'
  | 'Supplement times'
  | 'Active ingredients'
  | 'Ingredient day line'
  | 'Nutrition week'
  | 'Grocery purchase log'
  | 'Receipts for everyone'
  | 'Ideas filters'
  | 'Exercise notes'
  | 'Skipped entry'
  | 'Board day stamp'
  | 'Supplement add sheet'
  | 'Supplement label lookup'
  | 'Supplement UPC'
  | 'Backup coverage'
  | 'Watch link'
  | 'Plan labels'
  | 'Grocery list cap'
  | 'Erased account'
  | 'Large history'
  | 'Issues filter'
  | 'Scan keeps its day'
  | 'Launcher shortcuts'
  | 'Week to Shopping'
  | 'Add food any day'
  | 'Move and copy eaten'
  | 'Usual portion'
  | 'Saved meals removal'
  | 'Daily snacks'
  | 'Desktop week card'
  | 'Meal vitamin bars';

/** Every feature a scenario may cover, in the order the document lists them. The test fails on one with no scenario. */
export const SCENARIO_FEATURES: readonly ScenarioFeature[] = [
  'Diet targets and log', 'Goal calories and pace', 'Saved meals', 'Meal planner', 'Suggest and copy', 'Auto macros', 'Ingredient macros', 'Food lookup',
  'Recipe-first log', 'Recipe nutrition', 'Recipe servings', 'Recipe video link', 'Recipe auto-match', 'Share target', 'Account menu', 'QA picker', 'Wide layouts', 'Admin accounts',
  'kg beside lb', 'Label scan', 'Whole pack', 'Receipt scan', 'Usual amount', 'Finished group', 'Receipt photos', 'Weight step', 'Program compare', 'Polish pass', 'Program on phones', 'Program tab clarity', 'Stale page guard', 'Barcode scan', 'Custom 404', 'Receipt store', 'Receipt merge', 'Bulk share', 'Receipt reconcile', 'Sharing done', 'Security headers', 'Link previews', 'Search hiding', 'Price history', 'Moved-card tag', 'Ideas to try', 'Program desktop layout', 'Groceries views', 'Food type', 'Recipes find', 'Nutrition quick log', 'Meals from foods', 'Grocery budget', 'Recipe star', 'Used as', 'Library rows', 'Goes with', 'Saved meals move', 'Counts as', 'Week board', 'Nutrition board', 'Supplement portions', 'Joined week and day tabs',
  'Vitamin and mineral totals', 'Vitamin and mineral day line', 'Food vitamins and minerals', 'Typed amounts', 'Age and sex amounts',
  'Supplement times', 'Active ingredients', 'Ingredient day line',
  'Nutrition week', 'Grocery purchase log', 'Receipts for everyone', 'Ideas filters', 'Exercise notes', 'Skipped entry', 'Board day stamp',
  'Supplement add sheet', 'Supplement label lookup', 'Supplement UPC', 'Backup coverage', 'Watch link',
  'Plan labels', 'Grocery list cap', 'Erased account', 'Large history', 'Issues filter', 'Scan keeps its day', 'Launcher shortcuts', 'Week to Shopping',
  'Add food any day', 'Move and copy eaten', 'Usual portion', 'Saved meals removal', 'Daily snacks',
  'Desktop week card',
  'Meal vitamin bars',
];

export interface Scenario {
  /** `S-01` upward. */
  id: string;
  feature: ScenarioFeature;
  title: string;
  /** The test account id (server/qa/personas.ts) the scenario runs as. */
  persona: string;
  /** The shipped brief it comes from (a file in the project docs' briefs folder, without `.md`), or `feature-map` where there is none. */
  brief: string;
  steps: readonly string[];
  expected: readonly string[];
  /** Needs a real phone (share target, back-swipe). */
  device?: boolean;
  /** The scenario is an edge case, not the happy path. */
  edge?: boolean;
  /** No longer applies; kept so the id is not reused. */
  retired?: boolean;
}

const idNumber = (id: string): number => Number(id.slice(2));

/** Every scenario, in id order. Each one is its own file in `server/qa/scenarios/` (`S-nn.ts`, the scenario as its default export), read by `scenarioFiles.ts`. */
export const SCENARIOS: readonly Scenario[] = scenarioModules.map(m => m.default as Scenario).sort((a, b) => idNumber(a.id) - idNumber(b.id));

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find(s => s.id === id);
/** The scenarios a persona runs (retired ones left out), in id order. */
export const scenariosForPersona = (personaId: string): Scenario[] => SCENARIOS.filter(s => s.persona === personaId && !s.retired);
