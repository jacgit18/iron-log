// How each QA scenario is covered by automation (brief: qa-scenario-automation). A plain list keyed by scenario id, one line each, kept apart from
// scenarios.ts so a PR that adds a scenario and a PR that tags one never edit the same file. A scenario with no line here is "untagged": nobody has
// decided yet. `e2e` (e2e/), `api` (server/) and `unit` (src/) name the spec files that exercise it (checked to exist by scenarioAutomation.test.ts); `manual` has no automated cover
// (a real phone, or a person's judgement). The tags were mapped by feature, so a spec can cover the feature without walking this exact scenario.

export type Automation = 'e2e' | 'api' | 'unit' | 'manual';

export interface ScenarioAutomation {
  auto: Automation;
  /** Paths from the repository root; required for `e2e`, `api` and `unit`, absent for `manual`. */
  specs?: readonly string[];
  /** What the specs do not cover, when they cover the scenario only in part (an audit on 2026-11-06 read every spec title against the scenario). */
  partial?: string;
}

export const AUTOMATION: Readonly<Record<string, ScenarioAutomation>> = {
  'S-01': { auto: 'e2e', specs: ['e2e/diet.spec.js'], partial: 'quick add and delete only; the seeded totals, yesterday list and the edit step are not checked' },
  'S-02': { auto: 'unit', specs: ['src/store/dietSlice.test.ts'], partial: 'the 20-a-day rule only; the over-target display and the message text are not tested' },
  'S-03': { auto: 'e2e', specs: ['e2e/dietPace.spec.js'] },
  'S-04': { auto: 'e2e', specs: ['e2e/dietPace.spec.js'] },
  'S-05': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-06': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-07': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'] },
  'S-08': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'], partial: 'logging a saved meal and no Log button on a future day; pressing Log on a planned recipe is not tested' },
  'S-09': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'], partial: 'the first press only; a second press adding nothing and a name shared by two recipes are not tested' },
  'S-10': { auto: 'unit', specs: ['src/lib/dietSuggest.test.ts', 'e2e/dietSuggest.spec.js'], partial: 'the hour ranking and the foods after it are unit tested, and one tap is walked in the e2e; the added notice text is not' },
  'S-11': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js'] },
  'S-12': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-13': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'], partial: 'macros first then a typed Calories; Calories first then macros is not tested' },
  'S-14': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-15': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-16': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-17': { auto: 'e2e', specs: ['e2e/dietFoodSearch.spec.js', 'e2e/dietFindFoodUsda.spec.js', 'e2e/foodSearchSort.spec.js'] },
  'S-18': { auto: 'e2e', specs: ['e2e/dietFoodSearch.spec.js', 'e2e/dietFindFoodUsda.spec.js', 'e2e/foodSearchSort.spec.js'], partial: 'no results, server and limit errors; the offline message is not tested' },
  'S-19': { auto: 'e2e', specs: ['e2e/readyMade.spec.js'] },
  'S-20': { auto: 'e2e', specs: ['e2e/readyMade.spec.js'] },
  'S-21': { auto: 'e2e', specs: ['e2e/recipeNutrition.spec.js'] },
  'S-22': { auto: 'e2e', specs: ['e2e/recipeNutrition.spec.js'] },
  'S-23': { auto: 'e2e', specs: ['e2e/recipeServings.spec.js'] },
  'S-24': { auto: 'e2e', specs: ['e2e/recipeServingSize.spec.js'] },
  'S-25': { auto: 'e2e', specs: ['e2e/recipeServingSize.spec.js'] },
  'S-26': { auto: 'e2e', specs: ['e2e/recipeVideoLink.spec.js'] },
  'S-27': { auto: 'e2e', specs: ['e2e/recipeVideoLink.spec.js'] },
  'S-28': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'] },
  'S-29': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'] },
  'S-30': { auto: 'manual' },
  'S-31': { auto: 'manual' },
  'S-32': { auto: 'e2e', specs: ['e2e/accountMenu.spec.js'] },
  'S-33': { auto: 'e2e', specs: ['e2e/accountMenu.spec.js'] },
  'S-34': { auto: 'e2e', specs: ['e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'], partial: 'switch and the wipe; switching to Diet and Return to admin is not tested' },
  'S-35': { auto: 'manual' },
  'S-36': { auto: 'e2e', specs: ['e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'], partial: 'a stubbed Seed button only; the Recent list, Seed it first and the idle session are not tested' },
  'S-37': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-38': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-39': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-40': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-41': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-42': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-43': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-44': { auto: 'manual' },
  'S-45': { auto: 'e2e', specs: ['e2e/adminDeleteAccount.spec.js'], partial: 'the Deleted an account log line is not checked' },
  'S-46': { auto: 'e2e', specs: ['e2e/adminDeleteAccount.spec.js'] },
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
  'S-64': { auto: 'e2e', specs: ['e2e/progressionStep.spec.js'] },
  'S-65': { auto: 'e2e', specs: ['e2e/progressionStep.spec.js'] },
  'S-66': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-67': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'], partial: 'a saved copy and the same program twice; the empty day, the one-sided day and the section closing again are not tested' },
  'S-68': { auto: 'manual' },
  'S-69': { auto: 'manual' },
  'S-70': { auto: 'unit', specs: ['src/lib/importFile.test.ts'] },
  'S-71': { auto: 'manual' },
  'S-72': { auto: 'e2e', specs: ['e2e/programWide.spec.js'], partial: 'the button starts at the left of the A and B tabs at 375 px; that the switch shows only A and B is not checked' },
  'S-73': { auto: 'api', specs: ['server/expectedUser.test.ts'] },
  'S-74': { auto: 'manual' },
  'S-75': { auto: 'e2e', specs: ['e2e/barcodeScan.spec.js', 'e2e/barcodeMissLadder.spec.js'] },
  'S-76': { auto: 'e2e', specs: ['e2e/notFound.spec.js'], partial: 'the page loads and passes axe; the Go to Loadbearer link signed in versus signed out is not tested' },
  'S-77': { auto: 'manual' },
  'S-78': { auto: 'api', specs: ['server/static.test.ts', 'src/lib/route.test.ts'], partial: 'the server answers and the address parses to Progress; the app opening Progress and /privacy under an active service worker are not tested' },
  'S-79': { auto: 'manual' },
  'S-80': { auto: 'e2e', specs: ['e2e/receiptBoughtAt.spec.js'] },
  'S-81': { auto: 'e2e', specs: ['e2e/receiptBoughtAt.spec.js'] },
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
  'S-98': { auto: 'api', specs: ['server/securityHeaders.test.ts'], partial: 'the headers; every page rendering styled with no console errors is not tested' },
  'S-99': { auto: 'manual' },
  'S-100': { auto: 'unit', specs: ['src/lib/shareFiles.test.ts', 'src/lib/plainPageTitles.test.ts'], partial: 'the files and the three page titles; the app tab title and logo on QA are only checked by static.test.ts for the environment marker' },
  'S-101': { auto: 'api', specs: ['server/static.test.ts'] },
  'S-102': { auto: 'manual' },
  'S-103': { auto: 'unit', specs: ['src/lib/movedFromLabel.test.ts'] },
  'S-104': { auto: 'unit', specs: ['src/lib/movedFromLabel.test.ts'] },
  'S-105': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-106': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-107': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-108': { auto: 'unit', specs: ['src/store/useAppStore.test.js'], partial: 'the refused duplicate message; the heading, button, sheet titles, notice and the To try tag are not tested' },
  'S-109': { auto: 'e2e', specs: ['e2e/help.spec.js'] },
  'S-110': { auto: 'manual' },
  'S-111': { auto: 'e2e', specs: ['e2e/receiptAddStore.spec.js'] },
};

/** The tag of one scenario, or undefined when it is untagged. */
export const automationOf = (id: string): ScenarioAutomation | undefined => AUTOMATION[id];

/** How many of the given scenario ids fall in each class, for the coverage line of the scenarios page. */
export function coverageCounts(ids: readonly string[]): Record<Automation | 'untagged', number> {
  const out = { e2e: 0, api: 0, unit: 0, manual: 0, untagged: 0 };
  for (const id of ids) out[automationOf(id)?.auto ?? 'untagged']++;
  return out;
}
