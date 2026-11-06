// How each QA scenario is covered by automation (brief: qa-scenario-automation). A plain list keyed by scenario id, one line each, kept apart from
// scenarios.ts so a PR that adds a scenario and a PR that tags one never edit the same file. A scenario with no line here is "untagged": nobody has
// decided yet. `e2e` and `api` name the spec files that exercise it (checked to exist by scenarioAutomation.test.ts); `manual` has no automated cover
// (a real phone, or a person's judgement). The tags were mapped by feature, so a spec can cover the feature without walking this exact scenario.

export type Automation = 'e2e' | 'api' | 'manual';

export interface ScenarioAutomation {
  auto: Automation;
  /** Paths from the repository root; required for `e2e` and `api`, absent for `manual`. */
  specs?: readonly string[];
}

export const AUTOMATION: Readonly<Record<string, ScenarioAutomation>> = {
  'S-01': { auto: 'e2e', specs: ['e2e/diet.spec.js'] },
  'S-02': { auto: 'e2e', specs: ['e2e/diet.spec.js'] },
  'S-03': { auto: 'e2e', specs: ['e2e/dietPace.spec.js'] },
  'S-04': { auto: 'e2e', specs: ['e2e/dietPace.spec.js'] },
  'S-05': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-06': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-07': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'] },
  'S-08': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'] },
  'S-09': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'] },
  'S-10': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js'] },
  'S-11': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js'] },
  'S-12': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-13': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-14': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-15': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-16': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-17': { auto: 'e2e', specs: ['e2e/dietFoodSearch.spec.js', 'e2e/dietFindFoodUsda.spec.js', 'e2e/foodSearchSort.spec.js'] },
  'S-18': { auto: 'e2e', specs: ['e2e/dietFoodSearch.spec.js', 'e2e/dietFindFoodUsda.spec.js', 'e2e/foodSearchSort.spec.js'] },
  'S-21': { auto: 'e2e', specs: ['e2e/recipeNutrition.spec.js'] },
  'S-22': { auto: 'e2e', specs: ['e2e/recipeNutrition.spec.js'] },
  'S-23': { auto: 'e2e', specs: ['e2e/recipeServings.spec.js'] },
  'S-24': { auto: 'e2e', specs: ['e2e/recipeServings.spec.js'] },
  'S-25': { auto: 'e2e', specs: ['e2e/recipeServings.spec.js'] },
  'S-26': { auto: 'e2e', specs: ['e2e/recipeVideoLink.spec.js'] },
  'S-27': { auto: 'e2e', specs: ['e2e/recipeVideoLink.spec.js'] },
  'S-28': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'] },
  'S-29': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'] },
  'S-30': { auto: 'manual' },
  'S-31': { auto: 'manual' },
  'S-32': { auto: 'e2e', specs: ['e2e/accountMenu.spec.js'] },
  'S-33': { auto: 'e2e', specs: ['e2e/accountMenu.spec.js'] },
  'S-34': { auto: 'e2e', specs: ['e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'] },
  'S-35': { auto: 'e2e', specs: ['e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'] },
  'S-36': { auto: 'e2e', specs: ['e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'] },
  'S-37': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-38': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-39': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-40': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-41': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-42': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-43': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-44': { auto: 'manual' },
  'S-45': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-46': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-47': { auto: 'e2e', specs: ['e2e/kgBeside.spec.js'] },
  'S-48': { auto: 'e2e', specs: ['e2e/kgBeside.spec.js'] },
  'S-49': { auto: 'manual' },
  'S-50': { auto: 'manual' },
  'S-51': { auto: 'e2e', specs: ['e2e/wholePack.spec.js'] },
  'S-52': { auto: 'e2e', specs: ['e2e/wholePack.spec.js'] },
  'S-53': { auto: 'manual' },
  'S-54': { auto: 'manual' },
  'S-55': { auto: 'e2e', specs: ['e2e/usualAmount.spec.js'] },
  'S-56': { auto: 'e2e', specs: ['e2e/usualAmount.spec.js'] },
  'S-57': { auto: 'manual' },
  'S-58': { auto: 'manual' },
  'S-59': { auto: 'manual' },
  'S-60': { auto: 'manual' },
  'S-61': { auto: 'e2e', specs: ['e2e/finishedGroup.spec.js'] },
  'S-62': { auto: 'e2e', specs: ['e2e/finishedGroup.spec.js'] },
  'S-63': { auto: 'e2e', specs: ['e2e/finishedGroup.spec.js'] },
  'S-66': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-67': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-68': { auto: 'manual' },
  'S-71': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'] },
  'S-73': { auto: 'api', specs: ['server/expectedUser.test.ts'] },
  'S-74': { auto: 'manual' },
  'S-75': { auto: 'e2e', specs: ['e2e/barcodeScan.spec.js', 'e2e/barcodeMissLadder.spec.js'] },
  'S-76': { auto: 'e2e', specs: ['e2e/notFound.spec.js'] },
  'S-77': { auto: 'manual' },
  'S-78': { auto: 'e2e', specs: ['e2e/notFound.spec.js'] },
  'S-79': { auto: 'manual' },
  'S-82': { auto: 'manual' },
  'S-83': { auto: 'manual' },
  'S-84': { auto: 'e2e', specs: ['e2e/receiptMerge.spec.js'] },
  'S-85': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-86': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-87': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-88': { auto: 'manual' },
  'S-89': { auto: 'manual' },
  'S-90': { auto: 'manual' },
  'S-91': { auto: 'manual' },
  'S-92': { auto: 'manual' },
  'S-93': { auto: 'manual' },
  'S-94': { auto: 'e2e', specs: ['e2e/barcodeScan.spec.js', 'e2e/barcodeMissLadder.spec.js'] },
  'S-95': { auto: 'e2e', specs: ['e2e/grocerySharingDone.spec.js'] },
  'S-96': { auto: 'e2e', specs: ['e2e/grocerySharingDone.spec.js'] },
  'S-97': { auto: 'manual' },
  'S-98': { auto: 'api', specs: ['server/securityHeaders.test.ts'] },
  'S-99': { auto: 'manual' },
  'S-105': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-106': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-107': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
};

/** The tag of one scenario, or undefined when it is untagged. */
export const automationOf = (id: string): ScenarioAutomation | undefined => AUTOMATION[id];

/** How many of the given scenario ids fall in each class, for the coverage line of the scenarios page. */
export function coverageCounts(ids: readonly string[]): Record<Automation | 'untagged', number> {
  const out = { e2e: 0, api: 0, manual: 0, untagged: 0 };
  for (const id of ids) out[automationOf(id)?.auto ?? 'untagged']++;
  return out;
}
