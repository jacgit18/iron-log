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
  'S-06': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'] },
  'S-12': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'] },
  'S-15': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'] },
  'S-17': { auto: 'e2e', specs: ['e2e/dietFoodSearch.spec.js', 'e2e/dietFindFoodUsda.spec.js', 'e2e/foodSearchSort.spec.js'] },
  'S-20': { auto: 'e2e', specs: ['e2e/readyMade.spec.js'] },
  'S-21': { auto: 'e2e', specs: ['e2e/recipeNutrition.spec.js'] },
  'S-22': { auto: 'e2e', specs: ['e2e/recipeNutrition.spec.js'] },
  'S-23': { auto: 'e2e', specs: ['e2e/recipeServings.spec.js'] },
  'S-24': { auto: 'e2e', specs: ['e2e/recipeServingSize.spec.js'] },
  'S-25': { auto: 'e2e', specs: ['e2e/recipeServingSize.spec.js'] },
  'S-26': { auto: 'e2e', specs: ['e2e/recipeVideoLink.spec.js'] },
  'S-29': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'] },
  'S-30': { auto: 'manual' }, // phone only; wiring in e2e/shareTarget.spec.js
  'S-31': { auto: 'manual' }, // phone only; wiring in e2e/shareTarget.spec.js
  'S-32': { auto: 'e2e', specs: ['e2e-qa/accountMenu.spec.js', 'e2e/accountMenu.spec.js'] },
  'S-33': { auto: 'e2e', specs: ['e2e/accountMenu.spec.js'] },
  'S-34': { auto: 'e2e', specs: ['e2e-qa/qaModePicker.spec.js', 'e2e/qaPicker.spec.js', 'e2e/qaSwitchWipe.spec.js'] },
  'S-35': { auto: 'manual' },
  'S-41': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-43': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'] },
  'S-44': { auto: 'manual' }, // phone swipe-back needs a device; address, Back and reload are in e2e/adminAccounts.spec.js
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
  'S-85': { auto: 'e2e', specs: ['e2e-qa/bulkShare.spec.js', 'e2e/groceryBulkShare.spec.js'] },
  'S-86': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-87': { auto: 'e2e', specs: ['e2e/groceryBulkShare.spec.js'] },
  'S-95': { auto: 'e2e', specs: ['e2e/grocerySharingDone.spec.js'] },
  'S-96': { auto: 'e2e', specs: ['e2e/grocerySharingDone.spec.js'] },
  'S-97': { auto: 'manual' },
  'S-99': { auto: 'manual' },
  'S-101': { auto: 'api', specs: ['server/static.test.ts'] },
  'S-108': { auto: 'e2e', specs: ['e2e-qa/ideasToTry.spec.js', 'src/store/useAppStore.test.js'] },
  'S-112': { auto: 'e2e', specs: ['e2e/priceHistory.spec.js', 'src/lib/itemHistory.test.ts'] },
  'S-113': { auto: 'unit', specs: ['src/lib/itemHistory.test.ts', 'e2e/priceHistory.spec.js'], partial: 'the pack average and the no-price rows are unit tested only; the history sheet is not walked for a pack item or an unpriced purchase (the never-bought item having no line is in priceHistory.spec.js)' },
  'S-194': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-195': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the Fat figure and the Water meter after a drink are unit tested only' },
  'S-197': { auto: 'unit', specs: ['src/lib/nutritionBoard.test.ts'], partial: 'no spec walks the no-target display in the browser' },
  'S-198': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-199': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the remembered pick is walked, the other clock times are unit tested' },
  'S-211': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'the 500 oz refusal is not walked' },
  'S-213': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-214': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'] },
  'S-219': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js'] },
  'S-222': { auto: 'e2e', specs: ['e2e/supplementNutrients.spec.js', 'e2e/foodTotals.spec.js', 'e2e/nutrientTargets.spec.js'], partial: 'the specs build their own data; the seeded account\'s figures and the full wording are not walked' },
  'S-223': { auto: 'e2e', specs: ['e2e/supplementNutrients.spec.js'], partial: 'the Everything scheduled toggle with a half-serving intake is not walked' },
  'S-224': { auto: 'e2e', specs: ['e2e/intakeChecks.spec.js'], partial: 'only a one-day average and one target line are walked' },
  'S-225': { auto: 'e2e', specs: ['e2e/intakeChecks.spec.js'], partial: 'the unticked day line and the empty Totals message are not walked' },
  'S-227': { auto: 'e2e', specs: ['e2e/dayNutrientMeter.spec.js'], partial: 'earlier days are not walked' },
  'S-229': { auto: 'manual' },
  'S-230': { auto: 'e2e', specs: ['e2e/recipeMicro.spec.js'], partial: 'the lookup is stubbed and the log-from-Recipes step is not walked' },
  'S-231': { auto: 'e2e', specs: ['e2e/typeFoodAmounts.spec.js'] },
  'S-232': { auto: 'e2e', specs: ['e2e/typeFoodAmounts.spec.js'], partial: 'the refusal lines for 1 mg of B12 and a repeated nutrient are node tests, not walked in a browser' },
  'S-234': { auto: 'e2e', specs: ['e2e/recommendationsByAgeSex.spec.js'] },
  'S-235': { auto: 'e2e', specs: ['e2e/recommendationsByAgeSex.spec.js'], partial: 'Prefer not to say is a node test, not walked in a browser' },
  'S-237': { auto: 'e2e', specs: ['e2e/typeFoodAmounts.spec.js', 'e2e/recommendationsByAgeSex.spec.js', 'e2e/supplementNutrients.spec.js'], partial: 'the Ready-made form is not walked as a non-admin' },
  'S-216': { auto: 'e2e', specs: ['e2e/nutritionBoardManage.spec.js'], partial: 'the pace chips and the typed calories are not walked' },
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
  'S-136': { auto: 'manual' }, // needs a real phone; e2e/receiptRename.spec.js stubs it. Not covered: applying the move and opening the first item's edit row to see the text gone (the spec checks the saved-for note and the item picked on the next scan); the phone is not driven
  'S-137': { auto: 'manual' }, // needs a real phone; e2e/receiptRename.spec.js, src/store/groceryForgetAlias.test.ts stub it. Not covered: a scan after Forget without Undo no longer matching is not walked; the Forget button size on a phone is not measured
  'S-138': { auto: 'e2e', specs: ['e2e/groceryBoughtSpending.spec.js'] },
  'S-139': { auto: 'manual' }, // needs a real phone; e2e/groceryBoughtSpending.spec.js stubs it
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
  'S-172': { auto: 'manual' }, // needs a real phone; e2e/receiptReconcile.spec.js stubs it. Not covered: the receipt answer is stubbed and the page is not driven at phone size
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
  'S-49': { auto: 'manual' }, // needs a real phone; e2e/labelScan.spec.js stubs it. Not covered: the scan answer is stubbed; real photo accuracy and Save food then Ate this with 1.5 portions are not covered
  'S-50': { auto: 'manual' }, // needs a real phone; e2e/labelScan.spec.js stubs it. Not covered: unreadable and failed answers are stubbed; a real blurry photo and a per 100 g only label are not photographed
  'S-53': { auto: 'manual' }, // needs a real phone; e2e/receiptScan.spec.js, e2e/receiptApplyFooter.spec.js stub it. Not covered: scripted receipt answer; lb/oz conversion, a crossed-out old price, the store-tax picker and Undo held back while syncing are not asserted
  'S-54': { auto: 'manual' }, // needs a real phone; e2e/receiptScan.spec.js, e2e/receiptApplyFooter.spec.js stub it. Not covered: scripted answers; real non-receipt and cut-off photos, and the missing amount in Total check, are not asserted
  'S-57': { auto: 'manual' }, // needs a real phone; e2e/receiptAddItem.spec.js stubs it. Not covered: scripted receipt; the new item is not looked up on Shopping or Bought this month after Apply
  'S-58': { auto: 'manual' }, // needs a real phone; e2e/receiptAddItem.spec.js stubs it. Not covered: scripted receipt; the duplicate check uses one name under Anywhere, not a named store
  'S-59': { auto: 'manual' }, // needs a real phone; e2e/receiptSave.spec.js stubs it. Not covered: the photo is a stub: readability, scrolling inside it, a real .jpg download and newest-month-first ordering are not checked
  'S-60': { auto: 'manual' }, // needs a real phone; e2e/receiptSave.spec.js stubs it. Not covered: a scripted failed save stands in for airplane mode; the 200-receipt and 60 MB notice and closing before the photo loads are not covered
  'S-64': { auto: 'e2e', specs: ['e2e/progressionStep.spec.js'], partial: 'never reads the Board badge: \'suggested, from N lb\' with +10 and its return to the usual step are not asserted' },
  'S-65': { auto: 'e2e', specs: ['e2e/progressionStep.spec.js', 'src/lib/weightStep.test.ts'], partial: 'the e2e types 60 only and never saves 7.5 and reopens; 0, 2.3 and abc are unit-only' },
  'S-68': { auto: 'manual' }, // needs a real phone; e2e/firstPaintTheme.spec.js stubs it. Not covered: first-paint colour with the bundle blocked; the launch splash colour, a reinstalled app and a throttled real phone are not covered
  'S-70': { auto: 'unit', specs: ['src/lib/importFile.test.ts'], partial: 'the wording is unit tested; showing it in Settings after a real undownloaded cloud file is not' },
  'S-73': { auto: 'api', specs: ['server/expectedUser.test.ts'], partial: 'the server 409 and client transport are tested; the Delete my data note, the other-account card and the reload are not driven in a browser' },
  'S-74': { auto: 'manual' }, // needs a real phone; e2e/barcodeScan.spec.js, e2e/nutritionQuickLog.spec.js stub it. Not covered: scripted detector and product; a real camera, USDA numbers against the label and the camera light are not covered
  'S-75': { auto: 'e2e', specs: ['e2e/barcodeScan.spec.js', 'e2e/barcodeMissLadder.spec.js'], partial: 'the miss is stubbed; the camera-blocked message with Photo instead is not asserted on this path' },
  'S-79': { auto: 'manual' }, // needs a real phone; e2e/receiptBoughtAt.spec.js stubs it. Not covered: scripted receipt, no real photo; Undo unticking each item is unconfirmed
  'S-82': { auto: 'manual' }, // needs a real phone; e2e/receiptMerge.spec.js stubs it. Not covered: merge, one checkbox, count 2 and the each-price are asserted via Add to list; ticking, picking an existing item, Apply, Undo and the unchanged total check are not
  'S-83': { auto: 'manual' }, // needs a real phone; e2e/receiptMerge.spec.js stubs it. Not covered: scripted receipt; the month bill matching the receipt is not asserted
  'S-88': { auto: 'manual' }, // needs a real phone; e2e/barcodeScan.spec.js stubs it. Not covered: the Open Food Facts note and Use are asserted on a stubbed product; a real Aldi or Trader Joe's scan and comparing numbers with the label is manual
  'S-89': { auto: 'manual' }, // needs a real phone; e2e/barcodeScan.spec.js, e2e/barcodeMissLadder.spec.js stub it. Not covered: the miss list, Photo the label opening the label camera and the empty form are asserted; a real label photo filling the form is manual
  'S-90': { auto: 'manual' }, // needs a real phone; e2e/receiptReconcile.spec.js stubs it. Not covered: scripted receipt, no real photo; the label wording per case is unit tested in src/lib/receiptReconcile.test.ts
  'S-226': { auto: 'e2e', specs: ['e2e/dayNutrientMeter.spec.js'], partial: 'the spec makes its own supplements; the seeded Vitamin tracker figures and the All N in Totals link are not walked' },
  'S-228': { auto: 'e2e', specs: ['e2e/foodTotals.spec.js', 'e2e/foodNutrients.spec.js'], partial: 'the lookup is stubbed (the spec uses 150 g, not 100 g); real USDA amounts are not walked' },
  'S-233': { auto: 'manual' }, // needs a real phone; e2e/labelScanMicro.spec.js stubs it. Not covered: the scan route is stubbed; matching rows to a real label (the accuracy check) and a real camera stay manual
  'S-236': { auto: 'e2e', specs: ['e2e/supplementSplitTimes.spec.js', 'e2e/supplementPortions.spec.js'], partial: 'the specs make their own supplements; the seeded half-serving Night capsule is not walked' },
  'S-238': { auto: 'unit', specs: ['src/lib/recipeMicro.test.ts', 'src/lib/mealRollup.test.ts', 'e2e/mealRollup.spec.js'], partial: 'roll-up and planned log are node tests; the browser spec checks macros only; nothing builds Cereal duo, logs it and reads the Totals' },
  'S-245': { auto: 'unit', specs: ['src/lib/supplementIngredients.test.ts', 'e2e/supplementIngredients.spec.js'], partial: 'taken-versus-scheduled and IU rules are node tests; unticking Fish oil and the typed Vitamin A IU row are not walked in a browser' },
  'S-257': { auto: 'unit', specs: ['src/lib/logic.test.js', 'src/store/useAppStore.test.js', 'src/lib/skipMark.test.ts'], partial: 'Skipped-entry rules are node tests; skip, un-skip and tick on the real Board and reading the log are not walked in a browser' },
  'S-258': { auto: 'unit', specs: ['src/lib/logic.test.js', 'src/store/useAppStore.test.js'], partial: 'dayDate is a node test; moving a ticked card and reading both column stamps is not walked in a browser' },
  'S-259': { auto: 'e2e', specs: ['e2e/supplementAdd.spec.js'], partial: 'the catalog is stubbed; a live NIH fish oil search and the dose step are not walked' },
  'S-260': { auto: 'e2e', specs: ['e2e/supplementIngredientImport.spec.js', 'e2e/supplementAdd.spec.js'], partial: 'the NIH routes are stubbed; real labels are node tested (dsldLabel.test.ts)' },
  'S-261': { auto: 'e2e', specs: ['e2e/supplementBarcode.spec.js'], partial: 'the UPC table and route are stubbed; a real stored Thorne or Sports Research UPC is not walked' },
  'S-262': { auto: 'manual' }, // needs a real phone; e2e/supplementScan.spec.js stubs it. Not covered: the scan route is stubbed; a real bottle photo on a phone is the owner check
  'S-264': { auto: 'unit', specs: ['src/store/backupCoverage.test.ts'], partial: 'the data-file round trip is a node test; the import review rows and the Replace note are not walked in a browser' },
  'S-01': { auto: 'e2e', specs: ['e2e/diet.spec.js', 'e2e/nutritionBoard.spec.js'], partial: 'the specs use their own fixture, not the diet-on-target seed: 1,440 / 2,400 kcal, 58 / 160 g and yesterday\'s five foods are not asserted, and editing the calories to 250 then deleting is not walked (the edit spec changes only the name)' },
  'S-02': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js', 'src/store/dietSlice.test.ts'], partial: 'no spec asserts the seeded over-target numbers or the red bar (2,880 / 2,400 kcal, 106 / 160 g) nor the Quick add text; the 21st One-off refusal is store-unit-tested only; the meal spec reaches 20 via Saved meals' },
  'S-03': { auto: 'e2e', specs: ['e2e/dietPace.spec.js', 'e2e/diet.spec.js', 'e2e/nutritionBoardManage.spec.js'], partial: 'the board meters showing the new calorie target after the goal is set in Progress, and the diet-fresh seed (about 180 lb), are not asserted' },
  'S-04': { auto: 'e2e', specs: ['e2e/dietPace.spec.js', 'e2e/diet.spec.js'] },
  'S-05': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js', 'e2e/dietMeals.spec.js'], partial: 'the plan spec uses Breakfast and a freshly saved meal, not Lunch and the seeded Usual breakfast; renaming via Recipes, Meals, Edit and seeing it in Saved meals is not covered' },
  'S-07': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'], partial: 'Remove on the recipe card is not clicked; the seeded 2,400 / 160 targets are not asserted' },
  'S-08': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js'], partial: 'logs a recipe, not a planned meal; the meal-total entry and Quick add logging linked foods are not covered; the meal-planner seed is not used' },
  'S-09': { auto: 'e2e', specs: ['e2e/dietPlan.spec.js', 'src/store/recipesSlice.test.ts', 'src/lib/recipePantry.test.ts'], partial: 'the recipe page button is never pressed twice in a spec; the once-only rule and the message wording are unit tested, the button wiring is not' },
  'S-10': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js', 'src/lib/dietSuggest.test.ts'], partial: 'the e2e logs its own Oats, not the diet-on-target seed; nearest-hour order is unit tested only' },
  'S-11': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js'], partial: 'the 20-entries left-out message of Copy yesterday is not exercised' },
  'S-13': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'], partial: 'the spec types macros first then Calories; this scenario\'s order (Calories first) is not walked (same typedKcal flag)' },
  'S-14': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js'], partial: 'a recipe pick keeping its recipe link, the six-result cap and newest-first order are not asserted in e2e (unit tested)' },
  'S-16': { auto: 'e2e', specs: ['e2e/recipeMacros.spec.js'], partial: 'the Left out list of names is not asserted' },
  'S-18': { auto: 'unit', specs: ['src/lib/foodsClient.test.ts'], partial: 'only the offline reason and its wording; nothing drives the Find food box offline or the Add afterwards' },
  'S-19': { auto: 'e2e', specs: ['e2e/readyMade.spec.js', 'e2e/diet.spec.js', 'src/lib/dietLog.test.ts'], partial: 'the 400-days-back refusal is unit tested only; no spec walks Overnight oats from the meal-planner seed' },
  'S-27': { auto: 'e2e', specs: ['e2e/recipeVideoLink.spec.js'], partial: 'ftp://, http:// and https:// links and the browser block on a bare domain are not walked' },
  'S-28': { auto: 'e2e', specs: ['e2e/recipeAutoMatch.spec.js'], partial: 'the Add missing to Shopping button is never pressed; the spec reads its label' },
  'S-36': { auto: 'e2e', specs: ['e2e-qa/qaModePicker.spec.js', 'e2e/qaPicker.spec.js'], partial: 'the Recent list (last three, newest first) and the Seed it first hint are not asserted' },
  'S-37': { auto: 'e2e', specs: ['e2e-qa/boardWide.spec.js', 'e2e/boardWide.spec.js'] },
  'S-38': { auto: 'e2e', specs: ['e2e/settingsWide.spec.js'] },
  'S-39': { auto: 'e2e', specs: ['e2e/libraryWide.spec.js'] },
  'S-40': { auto: 'e2e', specs: ['e2e/nutritionWide.spec.js'] },
  'S-42': { auto: 'e2e', specs: ['e2e/adminAccounts.spec.js'], partial: 'Restore and a real suspended session (every screen shows This account is suspended, nothing syncs) are not walked; the notice uses a scripted /api/me' },
  'S-181': { auto: 'e2e', specs: ['e2e/nutritionPairSuggestion.spec.js', 'src/lib/pairSuggestions.test.ts'], partial: 'a recipe with no pairing offering nothing is unit tested only; the spec seeds its own recipes' },
  'S-182': { auto: 'e2e', specs: ['e2e/recipesGoesWith.spec.js', 'src/lib/recipePairs.test.ts'], partial: 'the sauce and seasoning exclusion is unit tested only' },
  'S-183': { auto: 'e2e', specs: ['e2e/savedMealsMove.spec.js', 'src/lib/quickMeals.test.ts'], partial: 'Usual breakfast linked to the scramble and the oats, and this account\'s four meals, are not walked' },
  'S-184': { auto: 'e2e', specs: ['e2e/savedMealsMove.spec.js', 'e2e/dietMeals.spec.js', 'src/lib/quickMeals.test.ts'], partial: 'the linked Usual breakfast logging two entries is unit tested only; the renamed meal showing in Saved meals is not walked' },
  'S-185': { auto: 'e2e', specs: ['e2e/dietMeals.spec.js'], partial: 'the new meal under Recipes, Meals is not opened in this spec' },
  'S-186': { auto: 'e2e', specs: ['e2e/recipesCountsAs.spec.js'], partial: 'the seeded hand-set Lentil soup (dashed chip) is not opened' },
  'S-188': { auto: 'e2e', specs: ['e2e/weekBoard.spec.js', 'src/lib/weekBoard.test.ts', 'src/lib/nutritionBoard.test.ts'], partial: 'More on a card, the over-target fill with the g over wording and the Not set group are unit tested only' },
  'S-189': { auto: 'e2e', specs: ['e2e/weekBoard.spec.js', 'src/lib/weekBoard.test.ts', 'src/lib/plate.test.ts'], partial: 'the Veg button is not walked; the spec plans on today by moving a card, not on a day ahead' },
  'S-190': { auto: 'e2e', specs: ['e2e/weekBoard.spec.js', 'src/lib/weekBoard.test.ts'], partial: 'dragging is not walked; the already-in-that-meal and A day can hold 8 things refusals are unit tested only' },
  'S-191': { auto: 'unit', specs: ['src/lib/weekBoard.test.ts', 'src/lib/plate.test.ts'], partial: 'no spec walks the hatched meter, the Fat n of m foods line or the Add fat to your foods prompt in the browser' },
  'S-192': { auto: 'unit', specs: ['src/lib/weekBoard.test.ts', 'src/lib/quickMeals.test.ts'], partial: 'no spec walks the Not set group or Move to out of it in the browser' },
  'S-193': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'the Manage button and the five meters per column are not asserted in this walk' },
  'S-196': { auto: 'e2e', specs: ['e2e/weekBoard.spec.js', 'e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the meter rising by the checked item\'s calories is unit tested only' },
  'S-200': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'e2e/dietMeals.spec.js', 'e2e/dietAutoMacros.spec.js'], partial: 'the list of seven ways with hints and the sheet title changing per way are not asserted' },
  'S-201': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'e2e/nutritionQuickLog.spec.js'], partial: 'tapping a Suggested now food is not walked' },
  'S-202': { auto: 'e2e', specs: ['e2e/dietAutoMacros.spec.js', 'e2e/savedMealsMove.spec.js', 'e2e/nutritionBoard.spec.js'], partial: 'logging Usual breakfast as two entries and Log it from the Recipes way are not walked' },
  'S-203': { auto: 'e2e', specs: ['e2e/dietSuggest.spec.js', 'e2e/dietMeals.spec.js', 'e2e/mealDoors.spec.js'], partial: 'deleting every seeded food and then reading the list of ways is not walked (an empty day is)' },
  'S-204': { auto: 'manual' }, // needs a real phone; e2e/barcodeMissLadder.spec.js stubs it. Not covered: the real phone camera and permission prompt are not walked; only the miss branch is asserted, not a found product coming back picked on Find food, then Use and Add
  'S-205': { auto: 'manual' }, // needs a real phone; e2e/nutritionQuickLog.spec.js stubs it. Not covered: the real camera is replaced by a photo file and a stubbed lookup
  'S-206': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the Supplements and Hydration lines and the Quick add empty note are not asserted in the browser' },
  'S-207': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'Snack, Overnight oats and the Snack section appearing are not walked (the spec plans Chili into Lunch)' },
  'S-208': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'Delete and the Carbs and fat count only what you enter line are not walked in the browser (the line is unit tested)' },
  'S-209': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js'], partial: 'last week\'s Eaten list and meters, and a drink on a last-week day, are not walked' },
  'S-210': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'e2e/supplementAdd.spec.js'], partial: 'the two supplements are never added through Manage and ticked in one walk' },
  'S-212': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'e2e/a11y.spec.js', 'src/lib/nutritionBoard.test.ts'], partial: 'the Training 60 min goal line and tag are unit tested only; the 700 minutes refusal is not walked' },
  'S-215': { auto: 'e2e', specs: ['e2e/nutritionBoard.spec.js', 'e2e/nutritionBoardManage.spec.js'], partial: 'Back from Manage is not walked; Manage only through the supplement library and Saved meals and foods' },
  'S-217': { auto: 'unit', specs: ['src/store/useAppStore.test.js', 'src/store/wellnessSlice.test.js'], partial: 'the refusal message and Use my weight are not walked in the browser' },
  'S-218': { auto: 'e2e', specs: ['e2e/nutritionBoardManage.spec.js', 'e2e/supplementAdd.spec.js'], partial: 'Back from Settings to Nutrition is not walked' },
  'S-220': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js'] },
  'S-221': { auto: 'e2e', specs: ['e2e/supplementPortions.spec.js', 'src/lib/supplementPortion.test.ts'], partial: 'the step up to 1¼ servings and the 10-serving ceiling are unit tested only' },
  'S-266': { auto: 'manual' },
  'S-267': { auto: 'manual' },
  'S-268': { auto: 'manual' },
  'S-269': { auto: 'manual' },
  'S-270': { auto: 'manual' },
  'S-271': { auto: 'manual' },
  'S-272': { auto: 'manual' },
  'S-273': { auto: 'e2e', specs: ['e2e/issuesFilter.spec.js', 'e2e/adminIssues.spec.js'], partial: 'the specs stub the issues API with their own four issues, and check each status option in turn only through Fixed and All' },
  'S-274': { auto: 'manual' }, // the day rule has an e2e in nutritionQuickLog.spec.js; the camera scan itself is phone-only
  'S-275': { auto: 'manual' }, // launcher shortcuts show only on an Android home screen (Play wrapper 6 or later, or the installed web app); the manifest entries are not asserted in a browser
  'S-276': { auto: 'manual' }, // the share-sheet entry shows only on an Android phone (Play app or the installed web app); not driven in a browser
  'S-277': { auto: 'e2e', specs: ['e2e/weekShopping.spec.js', 'src/lib/weekShopping.test.ts'] },
  'S-278': { auto: 'e2e', specs: ['e2e/weekShopping.spec.js'] },
  'S-279': { auto: 'e2e', specs: ['e2e/weekShopping.spec.js'] },
  'S-280': { auto: 'unit', specs: ['src/lib/weekShopping.test.ts'], partial: 'the eaten-item rule is unit tested only; no browser spec ticks a planned item and then reads the button' },
  'S-100': { auto: 'unit', specs: ['src/lib/shareFiles.test.ts', 'src/lib/plainPageTitles.test.ts', 'src/lib/envName.test.ts', 'e2e-qa/plainPages.spec.js', 'e2e-qa/qaModePicker.spec.js', 'server/static.test.ts'], partial: 'the served QA title and icons and the hostname rule are tested; plainPages.spec.js asserts the title on the local build, not the real QA host' },
  'S-102': { auto: 'api', specs: ['server/static.test.ts'], partial: 'the file the app serves is tested; the live production answer after a deploy is a curl the owner runs' },
  'S-103': { auto: 'unit', specs: ['src/lib/movedFromLabel.test.ts'], partial: 'only the tag wording is tested; the card menu Move to, the planned option and the tag on the Board are not walked by any spec' },
  'S-104': { auto: 'unit', specs: ['src/lib/movedFromLabel.test.ts'], partial: 'wording and rest-day column maths are unit tested; Copy day to Day 7, ticking Rest and the tag on the Board are not walked by any spec' },
  'S-105': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'], partial: 'the sideways swipe of the Day buttons is not asserted; All days with the filter is walked at 1440 px, not at phone width' },
  'S-106': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'], partial: 'walked at 1440 px, not on a phone; the N differ count, a day with no exercises having no heading, and Filter 1 on All days are not asserted' },
  'S-107': { auto: 'e2e', specs: ['e2e/programCompare.spec.js'], partial: 'two cards across at about 1360 px, one card below 1240 px of panel, and the panel filling the page width are not asserted' },
  'S-109': { auto: 'e2e', specs: ['e2e/help.spec.js'], partial: 'Help is checked for the Ideas to try term and + Add idea only; the Stretches to try heading, + Add stretch, the Add a stretch to try sheet and the first-run line are not asserted' },
  'S-110': { auto: 'manual' }, // needs a real phone; e2e/receiptAddStore.spec.js stubs it. Not covered: the scan is stubbed (no real photo or phone); matched items listed under the new store on Shopping, ticked and priced, are not asserted
  'S-111': { auto: 'e2e', specs: ['e2e/receiptAddStore.spec.js', 'e2e/receiptNewStoreItem.spec.js'] },
  'S-114': { auto: 'e2e', specs: ['e2e/programTabClarity.spec.js', 'src/lib/programGuide.test.ts', 'src/lib/programRowFacts.test.ts'], partial: 'tab descriptions are checked as accessible descriptions, not visible text; the N exercises across 7 days text is unit tested only' },
  'S-115': { auto: 'e2e', specs: ['e2e/programTabClarity.spec.js', 'src/lib/programRowFacts.test.ts'], partial: 'an either/or row, the Optional and Supersets notes and a self-named section are not asserted in the browser; Day at a glance only draws from 1280 px and the spec runs at 1920' },
  'S-116': { auto: 'e2e', specs: ['e2e/programTabClarity.spec.js', 'e2e/programTabLayout.spec.js'], partial: 'Archive, Delete and Compare programs after a put on Board are not walked in this flow (Archive has e2e/programArchive.spec.js)' },
  'S-117': { auto: 'e2e', specs: ['e2e/programTabClarity.spec.js'] },
  'S-118': { auto: 'e2e', specs: ['e2e/programTabClarity.spec.js', 'e2e/programLongName.spec.js'], partial: 'the long name is asserted as no sideways scroll and the heading inside the page; the A and B switch staying on screen is not asserted' },
  'S-119': { auto: 'e2e', specs: ['e2e/programTabLayout.spec.js', 'e2e/programCopyDay.spec.js'], partial: 'the Day label field under the heading and the picker staying open for that day are not asserted' },
  'S-120': { auto: 'e2e', specs: ['e2e/programTabLayout.spec.js', 'e2e/navigation.spec.js'], partial: 'Back from the Compare address is not asserted; the second saved copy and clearing the search box are not walked' },
  'S-121': { auto: 'e2e', specs: ['e2e/programTabLayout.spec.js', 'e2e/programTabClarity.spec.js'] },
  'S-122': { auto: 'e2e', specs: ['e2e/groceryBought.spec.js'], partial: 'the Bought notice with Undo is not asserted here (groceryStoreChips.spec.js covers the no-price notice)' },
  'S-123': { auto: 'e2e', specs: ['e2e/groceryBought.spec.js', 'e2e/groceryBulkShare.spec.js'], partial: 'the notice going away by itself after about 10 seconds is not asserted' },
  'S-124': { auto: 'e2e', specs: ['e2e/groceryBought.spec.js', 'src/lib/route.test.ts'] },
  'S-125': { auto: 'manual' }, // needs a real phone; e2e/groceryBought.spec.js, e2e/groceryViewSwitch.spec.js, e2e/groceryLargeText.spec.js stub it. Not covered: run at 320 px with 200% root text, not a real phone at largest system text; Sharing groups and Edit wrapping under each other is not asserted
  'S-126': { auto: 'manual' }, // needs a real phone; e2e/receiptApplyFooter.spec.js, src/lib/receiptApplyLabel.test.ts stub it. Not covered: thumb scrolling never applying and the Undo notice staying 10 seconds are not asserted
  'S-127': { auto: 'manual' }, // needs a real phone; e2e/receiptApplyFooter.spec.js, src/lib/receiptApplyLabel.test.ts stub it. Not covered: the Undo offer after the second tap is not asserted
  'S-128': { auto: 'manual' }, // needs a real phone; e2e/receiptApplyFooter.spec.js stubs it. Not covered: the bar staying above a real phone's bottom edge (safe area) is not run
  'S-129': { auto: 'e2e', specs: ['e2e/groceryStoreChips.spec.js'], partial: 'the spec runs three stores (chips) and six (dropdown), not the persona\'s four' },
  'S-130': { auto: 'e2e', specs: ['e2e/groceryStoreChips.spec.js'] },
  'S-131': { auto: 'manual' }, // needs a real phone; e2e/groceryStoreChips.spec.js stubs it. Not covered: resizes one browser, not a computer and a phone side by side
  'S-132': { auto: 'e2e', specs: ['e2e/groceryStoreChips.spec.js'], partial: 'the Undo and Dismiss buttons on the notice are not asserted' },
  'S-133': { auto: 'manual' }, // needs a real phone; e2e/receiptRename.spec.js, src/lib/groceryAliases.test.ts stub it. Not covered: the item holding the new name after Apply and Undo restoring the old name are not asserted for a renamed match
  'S-134': { auto: 'manual' }, // needs a real phone; e2e/receiptRename.spec.js stubs it
  'S-135': { auto: 'manual' }, // needs a real phone; e2e/receiptRename.spec.js stubs it. Not covered: the second scan of the same text matching the new item is not asserted
  'S-91': { auto: 'manual' }, // needs a real phone; e2e/receiptReconcile.spec.js, src/lib/receiptReconcile.test.ts stub it. Not covered: the none-of-your-items wording is unit tested only and no spec scans a receipt with none of the ticked items; a real phone photo is not run
  'S-92': { auto: 'manual' }, // needs a real phone; src/lib/receiptReconcile.test.ts, src/lib/groceryReceipt.test.ts stub it. Not covered: no browser spec scans a receipt whose count differs from the ticked count, so the note under the row and the count after Apply are not walked in the app
  'S-93': { auto: 'manual' }, // needs a real phone; e2e/barcodeMissLadder.spec.js, src/lib/barcodeScan.test.ts stub it. Not covered: camera, real code and real AI read are stubbed; no AI call after Type the name is not asserted
  'S-94': { auto: 'e2e', specs: ['e2e/barcodeMissLadder.spec.js', 'src/lib/labelAllowance.test.ts'], partial: 'the label route is stubbed (7 of 30, a cap answer), so the server-wide count and a real SCAN_DAILY_MAX are not run' },
  'S-98': { auto: 'e2e', specs: ['e2e-qa/plainPages.spec.js', 'server/securityHeaders.test.ts'], partial: 'the Help sheet is the one sheet opened on each tab and on Settings, not a different sheet on each screen' },
  'S-80': { auto: 'e2e', specs: ['e2e/receiptBoughtAt.spec.js'] },
  'S-81': { auto: 'e2e', specs: ['e2e/receiptBoughtAt.spec.js'] },
  'S-84': { auto: 'e2e', specs: ['e2e/receiptMerge.spec.js'] },
  'S-155': { auto: 'e2e', specs: ['e2e/nutritionQuickLog.spec.js'], partial: 'the barcode reader and camera are stubbed; the real camera on a phone is not run (the owner recorded a result for this scenario, so it is not marked device)' },
  // S-281 to S-289: tagged from the spec and test titles (read-only); the notes name what no test title covers.
  'S-281': { auto: 'e2e', specs: ['e2e/nutritionAnyDay.spec.js'], partial: 'the spec sets no phone width, so the day stepper path is not run' },
  'S-282': { auto: 'e2e', specs: ['e2e/nutritionMoveCopy.spec.js', 'src/lib/moveCopyEaten.test.ts'] },
  'S-283': { auto: 'e2e', specs: ['e2e/nutritionMoveCopy.spec.js', 'src/lib/moveCopyEaten.test.ts'] },
  'S-284': { auto: 'e2e', specs: ['e2e/usualPortion.spec.js', 'src/lib/usualPortion.test.ts'] },
  'S-285': { auto: 'unit', specs: ['src/lib/savedMealsRemoval.test.ts', 'e2e/savedMealsMove.spec.js'], partial: 'no browser spec plans a meal and then deletes its recipe, so the removed state is unit tested only' },
  'S-286': { auto: 'e2e', specs: ['e2e/savedMealsMove.spec.js'], partial: 'the spec builds its own 300 recipes, not the recipes-full account, and no test title covers one delete letting exactly one meal move' },
  'S-287': { auto: 'e2e', specs: ['e2e/dailySnacks.spec.js', 'src/lib/dailySnacks.test.ts'], partial: 'no test title covers the portion step in the sheet' },
  'S-288': { auto: 'unit', specs: ['src/lib/dietPlan.test.ts', 'src/store/dietSlice.test.ts'], partial: 'no browser spec ticks a snack on a full day or hits the refused ninth thing' },
  'S-289': { auto: 'unit', specs: ['src/lib/weekShopping.test.ts', 'src/store/dietSlice.test.ts'], partial: 'the button enabling for a snack alone is not walked in a browser' },
};

/** The tag of one scenario, or undefined when it is untagged. */
export const automationOf = (id: string): ScenarioAutomation | undefined => AUTOMATION[id];

/** How many of the given scenario ids fall in each class, for the coverage line of the scenarios page. */
export function coverageCounts(ids: readonly string[]): Record<Automation | 'untagged', number> {
  const out = { e2e: 0, api: 0, unit: 0, manual: 0, untagged: 0 };
  for (const id of ids) out[automationOf(id)?.auto ?? 'untagged']++;
  return out;
}
