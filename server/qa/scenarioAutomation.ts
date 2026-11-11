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
  'S-01': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
  'S-02': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
  'S-03': { auto: 'e2e', specs: ['e2e/dietPace.spec.js'] },
  'S-04': { auto: 'e2e', specs: ['e2e/dietPace.spec.js'] },
  'S-05': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-06': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-07': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'] },
  'S-08': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
  'S-09': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
  'S-10': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
  'S-11': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js'] },
  'S-12': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-13': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
  'S-14': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-15': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-16': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-17': { auto: 'e2e', specs: ['e2e/dietFoodSearch.spec.js', 'e2e/dietFindFoodUsda.spec.js', 'e2e/foodSearchSort.spec.js'] },
  'S-18': { auto: 'manual' }, // its e2e-qa spec still drives the removed Diet card and the removed Nutrition button; retag when the spec is rewritten
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
  'S-32': { auto: 'e2e', specs: ['e2e-qa/accountMenu.spec.js', 'e2e/accountMenu.spec.js'] },
  'S-33': { auto: 'e2e', specs: ['e2e/accountMenu.spec.js'] },
  'S-34': { auto: 'e2e', specs: ['e2e-qa/qaModePicker.spec.js', 'e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'] },
  'S-35': { auto: 'manual' },
  'S-36': { auto: 'e2e', specs: ['e2e-qa/qaModePicker.spec.js', 'e2e/qaPicker.spec.js'] },
  'S-37': { auto: 'e2e', specs: ['e2e-qa/boardWide.spec.js', 'e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-38': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-39': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-40': { auto: 'e2e', specs: ['e2e/boardWide.spec.js', 'e2e/headerWide.spec.js', 'e2e/libraryWide.spec.js', 'e2e/nutritionWide.spec.js', 'e2e/programWide.spec.js', 'e2e/settingsWide.spec.js'] },
  'S-41': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-42': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-43': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-44': { auto: 'manual' },
  'S-45': { auto: 'e2e', specs: ['e2e/adminDeleteAccount.spec.js', 'src/lib/accountsView.test.ts'] },
  'S-47': { auto: 'e2e', specs: ['e2e/kgBeside.spec.js'] },
  'S-51': { auto: 'e2e', specs: ['e2e/wholePack.spec.js'] },
  'S-52': { auto: 'e2e', specs: ['e2e/wholePack.spec.js'] },
  'S-55': { auto: 'e2e', specs: ['e2e/usualAmount.spec.js'] },
  'S-56': { auto: 'e2e', specs: ['e2e/usualAmount.spec.js'] },
  'S-61': { auto: 'e2e', specs: ['e2e/finishedGroup.spec.js'] },
  'S-62': { auto: 'e2e', specs: ['e2e/finishedGroup.spec.js'] },
  'S-63': { auto: 'e2e', specs: ['e2e/finishedGroup.spec.js'] },
  'S-66': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-67': { auto: 'e2e', specs: ['e2e-qa/programCompare.spec.js', 'e2e/programCompare.spec.js'] },
  'S-69': { auto: 'manual' },
  'S-71': { auto: 'manual' },
  'S-72': { auto: 'e2e', specs: ['e2e-qa/programPhone.spec.js', 'e2e/programWide.spec.js'] },
  'S-76': { auto: 'e2e', specs: ['e2e-qa/plainPages.spec.js', 'e2e/notFound.spec.js'] },
  'S-77': { auto: 'manual' },
  'S-78': { auto: 'api', specs: ['server/static.test.ts', 'src/lib/route.test.ts', 'e2e-qa/plainPages.spec.js'] },
  'S-80': { auto: 'e2e', specs: ['e2e/receiptBoughtAt.spec.js'] },
  'S-81': { auto: 'e2e', specs: ['e2e/receiptBoughtAt.spec.js'] },
  'S-84': { auto: 'e2e', specs: ['e2e/receiptMerge.spec.js'] },
  'S-85': { auto: 'e2e', specs: ['e2e-qa/bulkShare.spec.js', 'e2e/groceryBulkShare.spec.js'] },
  'S-86': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-87': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-91': { auto: 'manual' },
  'S-92': { auto: 'manual' },
  'S-93': { auto: 'manual' },
  'S-94': { auto: 'e2e', specs: ['e2e/barcodeScan.spec.js', 'e2e/barcodeMissLadder.spec.js'] },
  'S-95': { auto: 'e2e', specs: ['e2e/grocerySharingDone.spec.js'] },
  'S-96': { auto: 'e2e', specs: ['e2e/grocerySharingDone.spec.js'] },
  'S-97': { auto: 'manual' },
  'S-98': { auto: 'api', specs: ['server/securityHeaders.test.ts', 'e2e-qa/plainPages.spec.js'], partial: 'the Help sheet is the one sheet opened, on each tab and on Settings, not a different sheet on each screen' },
  'S-99': { auto: 'manual' },
  'S-100': { auto: 'unit', specs: ['src/lib/shareFiles.test.ts', 'src/lib/plainPageTitles.test.ts', 'src/lib/envName.test.ts', 'e2e-qa/plainPages.spec.js', 'e2e-qa/qaModePicker.spec.js', 'server/static.test.ts'], partial: 'the served QA title and icons and the hostname rule are tested; once the app loads its tab reads "<screen> · Loadbearer - QA", not the "Loadbearer QA" the scenario text names' },
  'S-101': { auto: 'api', specs: ['server/static.test.ts'] },
  'S-102': { auto: 'manual' },
  'S-103': { auto: 'unit', specs: ['src/lib/movedFromLabel.test.ts'] },
  'S-104': { auto: 'unit', specs: ['src/lib/movedFromLabel.test.ts'] },
  'S-105': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-106': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-107': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'] },
  'S-108': { auto: 'e2e', specs: ['e2e-qa/ideasToTry.spec.js', 'src/store/useAppStore.test.js'] },
  'S-109': { auto: 'e2e', specs: ['e2e/help.spec.js'] },
  'S-110': { auto: 'manual' },
  'S-111': { auto: 'e2e', specs: ['e2e/receiptAddStore.spec.js'] },
  'S-112': { auto: 'e2e', specs: ['e2e/priceHistory.spec.js', 'src/lib/itemHistory.test.ts'] },
  'S-113': { auto: 'unit', specs: ['src/lib/itemHistory.test.ts', 'e2e/priceHistory.spec.js'], partial: 'the pack average and the no-price rows are unit tested only; the history sheet is not walked for a pack item or an unpriced purchase (the never-bought item having no line is in priceHistory.spec.js)' },
  'S-193': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-194': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-195': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the Fat figure and the Water meter after a drink are unit tested only' },
  'S-196': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the planned-then-logged step on today is not walked' },
  'S-197': { auto: 'unit', specs: ['src/lib/nutritionBoard.test.ts'], partial: 'no spec walks the no-target display in the browser' },
  'S-198': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-199': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the remembered pick is walked, the other clock times are unit tested' },
  'S-200': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'the Back to ways of adding button is not walked' },
  'S-201': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'Quick add and Undo are covered by e2e/nutritionQuickLog.spec.js, not this walk' },
  'S-207': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-208': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-210': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'adding the supplements through Manage is not walked' },
  'S-211': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'the 500 oz refusal is not walked' },
  'S-212': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'the training minutes limit is not walked' },
  'S-213': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-214': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-215': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'only the add and drink sheets are walked' },
  'S-218': { auto: 'e2e', specs: ['e2e/nutritionBoardManage.spec.js'] },
  'S-219': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js'] },
  'S-220': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js'], partial: 'the Totals figure after editing the rows on the Night entry is walked in part' },
  'S-221': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js'] },
  'S-222': { auto: 'e2e', specs: ['e2e/supplementNutrients.spec.js', 'e2e/foodTotals.spec.js', 'e2e/nutrientTargets.spec.js'], partial: 'the specs build their own data; the seeded account\'s figures and the full wording are not walked' },
  'S-223': { auto: 'e2e', specs: ['e2e/supplementNutrients.spec.js'], partial: 'the Everything scheduled toggle with a half-serving intake is not walked' },
  'S-224': { auto: 'e2e', specs: ['e2e/intakeChecks.spec.js'], partial: 'only a one-day average and one target line are walked' },
  'S-225': { auto: 'e2e', specs: ['e2e/intakeChecks.spec.js'], partial: 'the unticked day line and the empty Totals message are not walked' },
  'S-226': { auto: 'e2e', specs: ['e2e/dayNutrientMeter.spec.js'] },
  'S-227': { auto: 'e2e', specs: ['e2e/dayNutrientMeter.spec.js'], partial: 'earlier days are not walked' },
  'S-228': { auto: 'e2e', specs: ['e2e/foodTotals.spec.js'], partial: 'the lookup is stubbed; real USDA amounts are not walked' },
  'S-229': { auto: 'manual' },
  'S-230': { auto: 'e2e', specs: ['e2e/recipeMicro.spec.js'], partial: 'the lookup is stubbed and the log-from-Recipes step is not walked' },
  'S-231': { auto: 'e2e', specs: ['e2e/typeFoodAmounts.spec.js'] },
  'S-232': { auto: 'e2e', specs: ['e2e/typeFoodAmounts.spec.js'], partial: 'the refusal lines for 1 mg of B12 and a repeated nutrient are node tests, not walked in a browser' },
  'S-233': { auto: 'manual' },
  'S-234': { auto: 'e2e', specs: ['e2e/recommendationsByAgeSex.spec.js'] },
  'S-235': { auto: 'e2e', specs: ['e2e/recommendationsByAgeSex.spec.js'], partial: 'Prefer not to say is a node test, not walked in a browser' },
  'S-236': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js'], partial: 'the seeded account is not used; the spec makes its own supplements' },
  'S-237': { auto: 'e2e', specs: ['e2e/typeFoodAmounts.spec.js', 'e2e/recommendationsByAgeSex.spec.js', 'e2e/supplementNutrients.spec.js'], partial: 'the Ready-made form is not walked as a non-admin' },
  'S-216': { auto: 'e2e', specs: ['e2e/nutritionBoardManage.spec.js'], partial: 'the pace chips and the typed calories are not walked' },
  'S-238': { auto: 'unit', specs: ['src/lib/mealRollup.test.ts', 'src/lib/dietPlan.test.ts'], partial: 'the roll-up and the planned log are node tests; no browser spec builds a recipe from a food and logs it' },
  'S-239': { auto: 'e2e', specs: ['e2e/supplementMergedList.spec.js'] },
  'S-240': { auto: 'e2e', specs: ['e2e/supplementMergedList.spec.js', 'e2e/supplementAdd.spec.js'] },
  'S-241': { auto: 'e2e', specs: ['e2e/supplementSplitTimes.spec.js'] },
  'S-242': { auto: 'e2e', specs: ['e2e/supplementAdd.spec.js'] },
  'S-243': { auto: 'e2e', specs: ['e2e/supplementIngredients.spec.js'] },
  'S-244': { auto: 'e2e', specs: ['e2e/supplementIngredients.spec.js'] },
  'S-246': { auto: 'e2e', specs: ['e2e/ingredientDayBars.spec.js', 'src/lib/dayIngredientMeter.test.ts'], partial: 'the five-bar cap needs six limited ingredients, so only the node test covers it' },
  'S-247': { auto: 'e2e', specs: ['e2e/ingredientDayBars.spec.js'] },
  'S-251': { auto: 'e2e', specs: ['e2e/groceryPurchases.spec.js'] },
  'S-252': { auto: 'e2e', specs: ['e2e/groceryPurchases.spec.js'] },
  'S-253': { auto: 'e2e', specs: ['e2e/receiptSave.spec.js', 'server/receipts.test.ts'], partial: 'the e2e stubs the receipts API, so another account never seeing the rows is covered by the server test only' },
  'S-254': { auto: 'e2e', specs: ['e2e/ideasFilter.spec.js'], partial: 'the seven filter ideas are seeded; only the eighth is added through + Add idea' },
  'S-255': { auto: 'e2e', specs: ['e2e/ideaAddSheet.spec.js', 'src/lib/ideaDays.test.ts'], partial: 'the day buttons are checked in order on an unswapped week; the order after a swap is a node test' },
  'S-256': { auto: 'e2e', specs: ['e2e/exerciseNotes.spec.js'], partial: 'the 200-character cap is tried on the Program sheet; the Ideas and Add-to-day sheets share the same maxLength' },
  'S-249': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js', 'e2e/diet.spec.js'] },
  'S-250': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'e2e/nutritionWide.spec.js'] },
  'S-248': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-263': { auto: 'e2e', specs: ['e2e/nutrientTargets.spec.js', 'e2e/moreNutrients.spec.js'] },
  'S-136': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-137': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-138': { auto: 'e2e', specs: ['e2e/groceryBoughtSpending.spec.js'] },
  'S-139': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-140': { auto: 'e2e', specs: ['e2e/groceryQuickAdd.spec.js'] },
  'S-141': { auto: 'e2e', specs: ['e2e/groceryQuickAdd.spec.js'] },
  'S-142': { auto: 'e2e', specs: ['e2e/groceryMoneyLine.spec.js', 'e2e/groceryBoughtList.spec.js'] },
  'S-143': { auto: 'e2e', specs: ['e2e/groceryBoughtList.spec.js', 'e2e/groceryStoreChips.spec.js'] },
  'S-144': { auto: 'e2e', specs: ['e2e/groceryBoughtList.spec.js'] },
  'S-145': { auto: 'e2e', specs: ['e2e/groceryEditList.spec.js'], partial: 'a folded store is opened by a search or an added item; pressing its name a second time to unfold is not walked' },
  'S-146': { auto: 'e2e', specs: ['e2e/groceryEditList.spec.js'], partial: 'only Done is asserted at the bottom; Add and More are not' },
  'S-147': { auto: 'e2e', specs: ['e2e/groceryEditList.spec.js'] },
  'S-148': { auto: 'e2e', specs: ['e2e/foodTypeReview.spec.js'] },
  'S-149': { auto: 'e2e', specs: ['e2e/foodTypeReview.spec.js'] },
  'S-150': { auto: 'e2e', specs: ['e2e/foodTypeReview.spec.js'], partial: 'only no banner with no ready-made foods is walked; editing a food from Ready to eat to Ingredient and reopening it is not' },
  'S-151': { auto: 'e2e', specs: ['e2e/recipesTypeTabs.spec.js'] },
  'S-152': { auto: 'e2e', specs: ['e2e/recipesTypeTabs.spec.js'] },
  'S-153': { auto: 'e2e', specs: ['e2e/recipesTypeTabs.spec.js'] },
  'S-154': { auto: 'e2e', specs: ['e2e/nutritionQuickLog.spec.js'] },
  'S-155': { auto: 'e2e', specs: ['e2e/nutritionQuickLog.spec.js'], partial: 'the barcode reader and camera are stubbed; the real camera on a phone is not run' },
  'S-156': { auto: 'e2e', specs: ['e2e/nutritionQuickLog.spec.js', 'src/lib/dietLog.test.ts'], partial: 'the future-day refusal is walked in the browser; the 400-day limit and the 20-a-day stop are unit tested only' },
  'S-157': { auto: 'e2e', specs: ['e2e/mealRollup.spec.js'], partial: 'the Log sheet opening at the rolled-up numbers is not asserted' },
  'S-158': { auto: 'unit', specs: ['src/lib/mealRollup.test.ts'], partial: 'no spec edits a food in the app and opens the meal again or its Log sheet; a day already logged keeping its numbers is not tested here' },
  'S-159': { auto: 'e2e', specs: ['e2e/mealRollup.spec.js', 'src/lib/mealRollup.test.ts'], partial: 'the loop refusal is walked in the browser; the two-level roll-up numbers and the 3-level cap message are unit tested only' },
  'S-160': { auto: 'e2e', specs: ['e2e/mealRollup.spec.js', 'src/lib/mealRollup.test.ts'], partial: 'unticking Use my own numbers and the numbers coming from the foods again is unit tested only' },
  'S-161': { auto: 'e2e', specs: ['e2e/mealRollup.spec.js', 'src/lib/mealRollup.test.ts'], partial: 'the needs-numbers line is walked in the browser; renaming and deleting a linked food are unit tested only' },
  'S-162': { auto: 'e2e', specs: ['e2e/groceryBudget.spec.js', 'src/lib/groceryBudget.test.ts'], partial: 'the spec reads the card on Shopping with a $60 budget; the same card on Bought and tax inside the spent figure are not asserted' },
  'S-163': { auto: 'e2e', specs: ['e2e/groceryBudget.spec.js', 'src/lib/groceryBudget.test.ts'], partial: 'the over-budget text is walked in the browser; the amber state from 80% is unit tested only, never checked as a colour' },
  'S-164': { auto: 'e2e', specs: ['e2e/groceryBudget.spec.js'], partial: 'edit, Remove and reload are walked with other amounts than 600; the budget showing on a second signed-in device is not' },
  'S-165': { auto: 'e2e', specs: ['e2e/groceryBudget.spec.js', 'src/lib/groceryBudget.test.ts'], partial: 'the browser spec types only abc; an empty box, 0 and 425.50 are covered by the parseDollars unit test' },
  'S-166': { auto: 'e2e', specs: ['e2e/groceryBudget.spec.js'] },
  'S-167': { auto: 'e2e', specs: ['e2e/groceryBudget.spec.js'], partial: 'the spec checks Shopping and Bought only; Inventory is not asserted' },
  'S-168': { auto: 'e2e', specs: ['e2e/groceryOneTime.spec.js', 'e2e/groceryQuickAdd.spec.js'] },
  'S-169': { auto: 'e2e', specs: ['e2e/groceryOneTime.spec.js'], partial: 'the box is asserted ticked right after the tap; reopening the row to see it still ticked is not' },
  'S-170': { auto: 'unit', specs: ['src/store/groceryQuickAddStore.test.ts', 'src/lib/groceryOneTime.test.ts'], partial: 'no browser spec unticks a bought one-time item on Bought and checks Shopping, Inventory and the still-ticked box' },
  'S-171': { auto: 'e2e', specs: ['e2e/groceryOneTime.spec.js', 'src/store/groceryQuickAddStore.test.ts'], partial: 'the browser spec adds the second Milk but does not assert it shows on Shopping; the unit test asserts the add succeeds' },
  'S-172': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-173': { auto: 'e2e', specs: ['e2e/recipesTypeTabs.spec.js'], partial: 'a Library recipe page without a Star button is not walked (the Library needs a signed-in catalog)' },
  'S-174': { auto: 'e2e', specs: ['e2e/recipesUsedAs.spec.js', 'e2e/recipesTypeTabs.spec.js'] },
  'S-175': { auto: 'e2e', specs: ['e2e/recipesUsedAs.spec.js'] },
  'S-176': { auto: 'e2e', specs: ['e2e/recipesUsedAs.spec.js', 'src/lib/recipeUses.test.ts'] },
  'S-177': { auto: 'unit', specs: ['src/lib/libraryRows.test.ts', 'src/store/recipesSlice.test.ts'], partial: 'no browser spec walks the Library list (it needs a signed-in catalog): the + Add press, the notice with Open, Undo and Dismiss, and the In Mine check are not driven' },
  'S-178': { auto: 'unit', specs: ['src/lib/libraryRows.test.ts'], partial: 'the tab list, the n of m at home count and the empty-tab line are unit tested; no browser spec drives the Library tabs' },
  'S-179': { auto: 'e2e', specs: ['e2e/recipesGoesWith.spec.js'] },
  'S-180': { auto: 'e2e', specs: ['e2e/recipesGoesWith.spec.js', 'src/lib/recipePairs.test.ts'], partial: 'Make a meal and its numbers are walked; deleting Rice clearing the pairing is unit tested only, and Undo of that delete restoring the pairing is unconfirmed' },
  'S-46': { auto: 'e2e', specs: ['e2e/adminDeleteAccount.spec.js'], partial: 'scripted /api/accounts rows; Suspend then Restore is never pressed, so Delete forever appearing after Suspend and going after Restore is not driven' },
  'S-48': { auto: 'e2e', specs: ['e2e/kgBeside.spec.js'], partial: 'only the Log sheet is checked with the switch off; Recent and Maxes, and switching back on, are not' },
  'S-49': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-50': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-53': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-54': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-57': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-58': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-59': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-60': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-64': { auto: 'e2e', specs: ['e2e/progressionStep.spec.js'], partial: 'never reads the Board badge: \'suggested, from N lb\' with +10 and its return to the usual step are not asserted' },
  'S-65': { auto: 'e2e', specs: ['e2e/progressionStep.spec.js', 'src/lib/weightStep.test.ts'], partial: 'the e2e types 60 only and never saves 7.5 and reopens; 0, 2.3 and abc are unit-only' },
  'S-68': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-70': { auto: 'unit', specs: ['src/lib/importFile.test.ts'], partial: 'the wording is unit tested; showing it in Settings after a real undownloaded cloud file is not' },
  'S-73': { auto: 'api', specs: ['server/expectedUser.test.ts'], partial: 'the server 409 and client transport are tested; the Delete my data note, the other-account card and the reload are not driven in a browser' },
  'S-74': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-75': { auto: 'e2e', specs: ['e2e/barcodeScan.spec.js', 'e2e/barcodeMissLadder.spec.js'], partial: 'the miss is stubbed; the camera-blocked message with Photo instead is not asserted on this path' },
  'S-79': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-82': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-83': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-88': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-89': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
  'S-90': { auto: 'manual' }, // needs a real phone (device scenario); the specs only stub the camera
};

/** The tag of one scenario, or undefined when it is untagged. */
export const automationOf = (id: string): ScenarioAutomation | undefined => AUTOMATION[id];

/** How many of the given scenario ids fall in each class, for the coverage line of the scenarios page. */
export function coverageCounts(ids: readonly string[]): Record<Automation | 'untagged', number> {
  const out = { e2e: 0, api: 0, unit: 0, manual: 0, untagged: 0 };
  for (const id of ids) out[automationOf(id)?.auto ?? 'untagged']++;
  return out;
}
