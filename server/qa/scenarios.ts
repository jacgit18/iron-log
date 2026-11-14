/* ---------- QA user scenarios (brief: qa-scenarios) ----------
   Numbered "try this" scripts for a tester on QA, each run as one test account from server/qa/personas.ts. One list read by three things: the
   picker (a persona's "Used in S-xx" tags, through the list answer), the scenarios document (scripts/qa-scenarios-doc.mjs) and the accounts
   document's "Used in" column. Nothing here records a result: the owner fills the document's Result column by hand.
   Each scenario is its own file, `server/qa/scenarios/S-nn.ts` (the scenario as the default export), so two PRs that each add one never edit the
   same lines. Take the next id with `node scripts/next-scenario-id.mjs`; `scenarioFiles.ts` reads the folder and this file puts them in id order.
   Ids are never reused or renumbered; a scenario that no longer applies stays as a file with `retired: true`.
   Each one is written from its shipped brief's Done when lines and the feature map. Seed facts the steps lean on are in server/qa/seedPlan.ts:
   the Diet accounts hold targets of 2,400 kcal and 160 g protein, meals "Usual breakfast", "Chicken bowl", "Post-workout" and "Quick dinner",
   five recipes (Egg and spinach scramble, Overnight oats, Chicken and rice bowl, Baked salmon, and Black bean rice with no fat figure) for the planner, and 30 generated recipes for the collector. */

import { scenarioModules } from './scenarioFiles.ts';

/** The area of the app a scenario covers. Plain text: a new feature needs no edit outside its own scenario files (`SCENARIO_FEATURES` is derived). */
export type ScenarioFeature = string;

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

/** Every feature a scenario covers, in the order of its first scenario (id order). Derived from the files; server/qa/scenarios.test.ts fails on a feature with no happy-path scenario and on two spellings of one name. */
export const SCENARIO_FEATURES: readonly ScenarioFeature[] = [...new Set(SCENARIOS.map(s => s.feature))];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find(s => s.id === id);
/** The scenarios a persona runs (retired ones left out), in id order. */
export const scenariosForPersona = (personaId: string): Scenario[] => SCENARIOS.filter(s => s.persona === personaId && !s.retired);
