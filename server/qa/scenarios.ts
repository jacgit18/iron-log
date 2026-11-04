/* ---------- QA user scenarios (brief: qa-scenarios) ----------
   Numbered "try this" scripts for a tester on QA, each run as one test account from server/qa/personas.ts. One list read by three things: the
   picker (a persona's "Used in S-xx" tags, through the list answer), the scenarios document (scripts/qa-scenarios-doc.mjs) and the accounts
   document's "Used in" column. Nothing here records a result: the owner fills the document's Result column by hand.
   Ids are never reused or renumbered; a scenario that no longer applies stays in the list with `retired: true`.
   Each one is written from its shipped brief's Done when lines and the feature map. Seed facts the steps lean on are in server/qa/seedPlan.ts:
   the Diet accounts hold targets of 2,400 kcal and 160 g protein, meals "Usual breakfast", "Chicken bowl", "Post-workout" and "Quick dinner",
   four recipes (Egg and spinach scramble, Overnight oats, Chicken and rice bowl, Baked salmon) for the planner, and 30 generated recipes for the collector. */

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
  | 'Usual amount'
  | 'Finished group'
  | 'Weight step'
  | 'Program compare'
  | 'Polish pass'
  | 'Program on phones'
  | 'Stale page guard';

/** Every feature a scenario may cover, in the order the document lists them. The test fails on one with no scenario. */
export const SCENARIO_FEATURES: readonly ScenarioFeature[] = [
  'Diet targets and log', 'Goal calories and pace', 'Saved meals', 'Meal planner', 'Suggest and copy', 'Auto macros', 'Ingredient macros', 'Food lookup',
  'Recipe-first log', 'Recipe nutrition', 'Recipe servings', 'Recipe video link', 'Recipe auto-match', 'Share target', 'Account menu', 'QA picker', 'Wide layouts', 'Admin accounts',
  'kg beside lb', 'Label scan', 'Whole pack', 'Receipt scan', 'Usual amount', 'Finished group', 'Receipt photos', 'Weight step', 'Program compare', 'Polish pass', 'Program on phones', 'Stale page guard',
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

export const SCENARIOS: readonly Scenario[] = [
  // ---- Diet targets and log ----
  {
    id: 'S-01', feature: 'Diet targets and log', title: 'Read today and add a one-off food', persona: 'diet-on-target', brief: 'diet-targets-and-log',
    steps: [
      'Open Nutrition and look at the Diet card for today.',
      'Under One-off food tap Add one, enter "Rice", 200 kcal and 4 g protein, and press Add.',
      'Edit the Rice entry to 250 kcal, then delete it.',
      'Use the day stepper to go back one day.',
    ],
    expected: [
      'Before adding: three foods are logged and the bars read about "Calories 1,440 of 2,400" and "Protein 58 of 160".',
      'Adding Rice moves the totals by 200 kcal and 4 g; editing and deleting move them again; the total returns to where it began.',
      'Yesterday shows its own full day of five foods, not today\'s.',
    ],
  },
  {
    id: 'S-02', feature: 'Diet targets and log', title: 'Over target, and the 20 entries a day limit', persona: 'diet-over-target', brief: 'diet-targets-and-log', edge: true,
    steps: [
      'Open Nutrition and read the Diet card for today.',
      'Add small one-off foods (for example "Tea", 5 kcal, 0 g) until the day holds 20 entries.',
      'Look for a way to add a 21st.',
    ],
    expected: [
      'Today is about 120% of the calories (about 2,880 of 2,400) and shown as over target; protein reads short (about 106 of 160).',
      'At 20 entries the add form is replaced by "That\'s 20 things for the day. Delete one to add another.", so a 21st cannot be tried; deleting one brings the form back.',
    ],
  },

  // ---- Goal calories and pace ----
  {
    id: 'S-03', feature: 'Goal calories and pace', title: 'Missing goal weight, then a recommended target', persona: 'diet-fresh', brief: 'diet-pace',
    steps: [
      'Open Nutrition and read the Diet card: no targets are saved and no goal weight is set.',
      'Follow the "Set a goal weight" link to Progress and set a goal weight 15 lb below the latest body weight (about 180 lb is seeded).',
      'Return to Nutrition and read the card.',
      'Pick each pace chip in turn: Slow, Steady, Fast.',
    ],
    expected: [
      'Before the goal: the card names what is missing ("Set a goal weight") instead of showing numbers.',
      'After the goal: calories, protein, fat and carbs appear labelled as an estimate, with a sentence about calories to stay the same, the daily change and the weeks to the goal.',
      'Each pace changes the calories and the weeks; the pick survives a reload.',
    ],
  },
  {
    id: 'S-04', feature: 'Goal calories and pace', title: 'Fast pace is held at the limit; a typed number wins', persona: 'diet-fresh', brief: 'diet-macros-and-goal-calories', edge: true,
    steps: [
      'With a goal weight set below the latest weight (see S-03), pick Fast.',
      'Type 3,000 into Calories.',
      'Reload the page.',
      'Press Use recommended.',
    ],
    expected: [
      'A pace that would cut more than the advised amount is held at the limit and the card says so.',
      'Typing 3,000 replaces the calories only; protein, fat and carbs stay as recommended or follow the typed values; it survives the reload.',
      'Use recommended clears the typed numbers and keeps the pace.',
    ],
  },

  // ---- Saved meals ----
  {
    id: 'S-05', feature: 'Saved meals', title: 'Add a saved meal to another day', persona: 'meal-planner', brief: 'diet-saved-meals',
    steps: [
      'Open Nutrition and use the day stepper to go to yesterday.',
      'In Saved meals tap "Usual breakfast".',
      'Rename the meal "Weekday breakfast", then press Delete, press it again ("Tap again to delete"), and press Undo.',
    ],
    expected: [
      'Tapping the meal adds each food as its own entry with the meal\'s numbers (two foods for Usual breakfast).',
      'The rename shows at once; Delete takes two taps and then shows an Undo notice; Undo brings the meal back.',
    ],
  },
  {
    id: 'S-06', feature: 'Saved meals', title: 'Save today\'s foods as a meal; same name replaces', persona: 'diet-on-target', brief: 'diet-saved-meals', edge: true,
    steps: [
      'Open Nutrition. Tick Oatmeal with berries and Greek yogurt in today\'s list and save them as "Breakfast".',
      'Tick the same two foods again and save as "breakfast" (small b).',
      'Try saving with a blank name.',
    ],
    expected: [
      'A saved meal "Breakfast" appears showing "2 foods" and their summed calories.',
      'The second save replaces the first (still one meal, not two).',
      'A blank name is refused.',
    ],
  },

  // ---- Meal planner ----
  {
    id: 'S-07', feature: 'Meal planner', title: 'Read a planned day and change a portion', persona: 'meal-planner', brief: 'diet-meal-planner',
    steps: [
      'Open the meal planner and look at the seven planned days.',
      'On one day with a recipe and a saved meal, open More on the recipe and raise the portions.',
      'Remove the recipe from that day.',
    ],
    expected: [
      'Each day lists its items in order with planned calories and protein against the 2,400 / 160 targets.',
      'Raising the portion raises the day\'s planned totals; removing the recipe lowers them.',
    ],
  },
  {
    id: 'S-08', feature: 'Meal planner', title: 'Log from the plan; later days have no Log button', persona: 'meal-planner', brief: 'diet-meal-planner', edge: true,
    steps: [
      'In the planner, on today\'s planned recipe, press Log.',
      'On today\'s planned saved meal, press Log.',
      'Look at a day after today.',
    ],
    expected: [
      'The recipe logs one entry with its numbers at the planned portion; the saved meal logs each of its foods.',
      'Days after today show no Log button.',
    ],
  },
  {
    id: 'S-09', feature: 'Meal planner', title: 'Plan to Groceries adds each missing ingredient once', persona: 'meal-planner', brief: 'diet-meal-planner',
    steps: [
      'In the planner press the grocery button for the shown week.',
      'Open Groceries and look at To get.',
      'Return to the planner and press the grocery button again.',
    ],
    expected: [
      'The first press adds every ingredient of the week\'s recipes once (a name two recipes share is added once) and reports "Added N. M already on the list."',
      'The second press adds nothing and reports that all are already on the list.',
    ],
  },

  // ---- Suggest and copy ----
  {
    id: 'S-10', feature: 'Suggest and copy', title: 'One-off food suggests by the hour', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
    steps: [
      'Open Nutrition and, under One-off food, tap Add one.',
      'Read the suggested foods (the seed logged Oatmeal with berries near 8, Greek yogurt 10, Chicken and rice bowl 13, Almonds and fruit 16, Salmon with potatoes 19).',
      'Tap the first suggestion.',
    ],
    expected: [
      'The food eaten nearest to the current hour comes first; foods never eaten near this hour still appear after the ranked ones.',
      'Tapping adds one portion with the latest numbers of that food and the totals move and the notice reads "Added <food>." (there is no Undo here; delete the entry by hand to put the day back).',
    ],
  },
  {
    id: 'S-11', feature: 'Suggest and copy', title: 'Copy from yesterday with one food unticked', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
    steps: [
      'Open Copy from yesterday: yesterday\'s foods are all ticked.',
      'Untick one and press Add selected.',
    ],
    expected: [
      'Only the ticked foods are added to the day being viewed, with their numbers unchanged.',
      'If the day would pass 20 entries it adds what fits and says how many were left out.',
    ],
  },

  // ---- Auto macros ----
  {
    id: 'S-12', feature: 'Auto macros', title: 'Calories follow typed macros', persona: 'diet-on-target', brief: 'diet-auto-macros',
    steps: [
      'Open One-off food (Add one). Type protein 30, carbs 50 and fat 10 without touching Calories.',
      'Change Calories by hand to 500, then change protein to 40.',
    ],
    expected: [
      'Calories fill in as 410 (4 x 30 + 4 x 50 + 9 x 10).',
      'After a hand edit, Calories stays at 500 when a macro changes: a manual number always wins.',
    ],
  },
  {
    id: 'S-13', feature: 'Auto macros', title: 'Calories typed first are not overwritten', persona: 'diet-fresh', brief: 'diet-auto-macros', edge: true,
    steps: [
      'Open One-off food (Add one) and type Calories 300 first.',
      'Then type protein 20, carbs 20 and fat 5.',
    ],
    expected: [
      'Calories stay at 300 while the macros are typed.',
    ],
  },
  {
    id: 'S-14', feature: 'Auto macros', title: 'Search past meals and recipes, with a portion stepper', persona: 'meal-planner', brief: 'diet-auto-macros',
    steps: [
      'On the Diet card use the "Search your past meals and recipes" box and type "oat".',
      'Pick Overnight oats, set the portion to 1.5, and press Add.',
    ],
    expected: [
      'Matching foods you logged before and your own recipes that have calories and protein are listed newest first, at most six, with their numbers.',
      'The portion stepper (0.5 to 10) scales the numbers; Add logs them; the recipe entry keeps its recipe link.',
    ],
  },

  // ---- Ingredient macros ----
  {
    id: 'S-15', feature: 'Ingredient macros', title: 'Totals from looked-up ingredients', persona: 'meal-planner', brief: 'recipe-ingredient-macros',
    steps: [
      'Edit the recipe "Chicken and rice bowl". Change its first two ingredient amounts to "200 g" and "150 g".',
      'Open the ingredient nutrition helper, look each of the two up and pick a food. (This needs QA\'s food lookup key; see S-17.)',
      'Press Use these numbers, then Cancel the form without saving.',
    ],
    expected: [
      'The panel counts the two gram-readable ingredients, sums them, divides by the servings, and fills Calories, Protein, Carbs and Fat per serving.',
      'The numbers stay editable; Cancel leaves the recipe as it was.',
    ],
  },
  {
    id: 'S-16', feature: 'Ingredient macros', title: 'Ingredients with cup amounts are left out', persona: 'meal-planner', brief: 'recipe-ingredient-macros', edge: true,
    steps: [
      'Edit "Baked salmon" and leave its seeded amounts such as "1 cup" or "2 tbsp".',
      'Open the ingredient nutrition helper.',
    ],
    expected: [
      'Amounts in cups, spoons or pieces are not counted; the panel says how many ingredients were counted (for example "Counted 0 of 4") and names the ones left out.',
    ],
  },

  // ---- Food lookup ----
  {
    id: 'S-17', feature: 'Food lookup', title: 'Look up a food and scale it by grams', persona: 'diet-on-target', brief: 'diet-food-lookup',
    steps: [
      'In the "Search your past meals and recipes" box type "banana".',
      'Pick a result and enter 150 g.',
      'Change Protein by hand and press Add.',
    ],
    expected: [
      'Up to eight foods appear with kcal per 100 g; one letter shows nothing.',
      'Calories, Protein, Carbs and Fat fill as per-100-g x grams / 100 and stay editable before Add.',
      'If QA has no food search key you see the "not available" message instead (record that as the result).',
    ],
  },
  {
    id: 'S-18', feature: 'Food lookup', title: 'Food search offline', persona: 'diet-on-target', brief: 'diet-food-lookup', edge: true,
    steps: [
      'Turn the browser offline (DevTools Network, Offline).',
      'In the "Search your past meals and recipes" box type "banana", then type the numbers by hand and press Add.',
    ],
    expected: [
      'The search says "You are offline. You can still type the numbers." ("Food search is not available right now." is the message when the service is down, not when you are offline) and the rest of the form keeps working; Add still logs the entry.',
    ],
  },

  // ---- Recipe-first log ----
  {
    id: 'S-19', feature: 'Recipe-first log', title: 'Ate this on a recipe, for a chosen day', persona: 'meal-planner', brief: 'recipe-first-diet-log',
    steps: [
      'Open Recipes, then a recipe with calories and protein (for example Overnight oats).',
      'Press Ate this, choose yesterday in the Day field and confirm.',
      'Press Undo. Then try a day 401 days back and a day in the future.',
    ],
    expected: [
      'One entry with the recipe\'s numbers and its recipe link is added to the chosen day; Undo removes only that entry.',
      'A future day ("Pick today or an earlier day.") and a day over 400 days back are refused; the app keeps 400 days of diet history.',
    ],
  },
  {
    id: 'S-20', feature: 'Recipe-first log', title: 'New ready-made food', persona: 'diet-fresh', brief: 'recipe-first-diet-log',
    steps: [
      'Open Recipes and press New ready-made food.',
      'Save it with only a name; then add 250 kcal and 20 g protein and save.',
      'Find it under the Ready-made chip, open it and press Ate this.',
      'Edit the food to 300 kcal and look at the entry already logged.',
    ],
    expected: [
      'A name alone is refused; the form needs a name, calories and protein.',
      'The detail has no ingredients, steps, scaler or grocery buttons; Ate this logs a snapshot with its recipe link.',
      'The earlier entry keeps 250 kcal after the food changes.',
    ],
  },

  // ---- Recipe nutrition ----
  {
    id: 'S-21', feature: 'Recipe nutrition', title: 'Nutrition badges and the two filter chips', persona: 'recipe-collector', brief: 'recipe-nutrition-badges',
    steps: [
      'Open Recipes (Mine) and read the rows.',
      'Turn on High protein, then turn it off and turn on Under 500 kcal.',
      'Turn both on together, and add a category chip.',
    ],
    expected: [
      'Each row shows "N kcal · N g protein" when it has numbers.',
      'High protein lists only 30 g or more; Under 500 kcal lists only strictly under 500; both together and with a category use AND.',
    ],
  },
  {
    id: 'S-22', feature: 'Recipe nutrition', title: 'Meal tags from the recipe form', persona: 'recipe-collector', brief: 'recipe-nutrition-badges', edge: true,
    steps: [
      'Edit a recipe and look at the tag suggestions.',
      'Tap Dinner and save.',
      'Return to the list.',
    ],
    expected: [
      'Breakfast, Lunch, Dinner and Snack are suggested (those not already used); Dinner becomes an ordinary tag and shows as a tag chip on the list.',
    ],
  },

  // ---- Recipe servings ----
  {
    id: 'S-23', feature: 'Recipe servings', title: 'Scale a recipe by servings', persona: 'recipe-collector', brief: 'recipe-servings-scaling',
    steps: [
      'Edit a recipe with 2 servings and note its amounts (for example "1 cup").',
      'Double the Servings, then set them back.',
      'Double them again and Save; reload and reopen the recipe.',
      'Open the recipe view and change its servings control, then leave and return.',
    ],
    expected: [
      'Amounts double at once ("1 cup" becomes "2 cup"), return to the original text when servings return, and persist after Save and reload.',
      'The view page\'s servings control shows scaled amounts, saves nothing, and resets on leaving.',
    ],
  },
  {
    id: 'S-24', feature: 'Recipe servings', title: 'Serving size text and grams', persona: 'recipe-collector', brief: 'recipe-serving-size',
    steps: [
      'Edit a recipe. Enter Serving size "1 bowl" and Grams per serving 250, then Save.',
      'Open the recipe detail.',
      'Change the recipe\'s Servings and look at the serving size.',
    ],
    expected: [
      'The detail reads "Serving size: 1 bowl (250 g)".',
      'Changing Servings leaves the text and the grams per serving as they were.',
    ],
  },
  {
    id: 'S-25', feature: 'Recipe servings', title: 'Estimate grams with no gram amounts', persona: 'recipe-collector', brief: 'recipe-serving-size', edge: true,
    steps: [
      'Edit a recipe whose amounts are in cups, spoons or pieces and press Estimate from ingredients.',
    ],
    expected: [
      'It says no ingredient has an amount in grams and fills nothing.',
    ],
  },

  // ---- Recipe video link ----
  {
    id: 'S-26', feature: 'Recipe video link', title: 'Add, open and clear a video link', persona: 'recipe-collector', brief: 'recipe-video-link',
    steps: [
      'Edit a recipe and enter https://www.youtube.com/watch?v=example in Video link, then Save.',
      'Open its detail and tap the link.',
      'Edit again, clear the field and Save.',
    ],
    expected: [
      'The detail shows a "Watch on YouTube" link that opens in a new tab and is at least 44 px tall on a phone width.',
      'After clearing, the link and its row are gone.',
    ],
  },
  {
    id: 'S-27', feature: 'Recipe video link', title: 'A link must start with http:// or https://', persona: 'recipe-collector', brief: 'recipe-video-link', edge: true,
    steps: [
      'Edit a recipe and enter "youtube.com/abc" in Video link (a URL box), then press Save.',
      'Then enter "ftp://x.y/z" and press Save.',
      'Then enter "http://youtube.com/abc" and press Save.',
      'Edit again, enter "https://youtube.com/abc" and press Save.',
    ],
    expected: [
      'The browser blocks the bare domain with its own "Please enter a URL." message and nothing saves; the app\'s own text only shows for a value the browser lets through.',
      'The ftp:// link shows the app message "Video link should start with http:// or https://" and nothing saves.',
      'The http:// link is accepted and saved.',
      'The https:// link is accepted and saved.',
    ],
  },

  // ---- Recipe auto-match ----
  {
    id: 'S-28', feature: 'Recipe auto-match', title: 'Water counts as always at home', persona: 'recipe-collector', brief: 'recipe-auto-match',
    steps: [
      'Edit "Chicken and rice bowl" and add an ingredient "water" with amount "2 cups"; Save.',
      'Open the recipe and read the ingredient status.',
      'Press Add missing to Groceries.',
    ],
    expected: [
      'Water shows as Have with the note "Always at home" and is included in "Have x of y"; the Have, Missing and On your list marks line up in one column down the page.',
      'Add missing does not add water to the grocery list.',
    ],
  },
  {
    id: 'S-29', feature: 'Recipe auto-match', title: 'Maybe matches and Accept all', persona: 'recipe-collector', brief: 'recipe-auto-match', edge: true,
    steps: [
      'Open "Chicken and rice bowl" (ingredient "Chicken breast") while At home holds a "Chicken thighs" item.',
      'Choose the item from the "Maybe: <item>" dropdown, then undo the pin by hand.',
      'Open another recipe with several Maybe lines and press Accept all suggestions.',
    ],
    expected: [
      'A close but inexact name shows "Maybe: <item>" as a dropdown choice and is not counted as a match until chosen.',
      'Choosing it pins it; Accept all pins every suggestion in one action and the button disappears when none are left.',
      'Press Reset on the account first: anything added to the grocery list since the seed changes which recipes show Maybe. The seeded names decide which recipes show Maybe; if none does, record that and add an At home item with a shared word.',
    ],
  },

  // ---- Share target ----
  {
    id: 'S-30', feature: 'Share target', title: 'Share a YouTube link to an exercise', persona: 'superset-builder', brief: 'share-target', device: true,
    steps: [
      'On an Android phone with Loadbearer installed, open a YouTube video and choose Share, then Loadbearer.',
      'In the "Save this link" sheet pick an exercise and confirm.',
      'Share a different link to the same exercise.',
    ],
    expected: [
      'Loadbearer is listed in the share sheet and opens "Save this link" over the board.',
      'The link is saved as the exercise\'s video and shows on its card; a different link first asks "Replace the link on <exercise>?"',
    ],
  },
  {
    id: 'S-31', feature: 'Share target', title: 'Share a link to a recipe, and share with no link', persona: 'meal-planner', brief: 'share-target', device: true, edge: true,
    steps: [
      'Share a video link from the phone to Loadbearer and choose one of your recipes.',
      'Share again and choose New recipe with this link.',
      'Share plain text with no web address.',
    ],
    expected: [
      'The link is saved on the chosen recipe; "New recipe with this link" opens the recipe form with the link and title filled in.',
      'A share with no usable link says "No web link found in what you shared." with Close.',
      'Back closes the sheet and a reload does not reopen it.',
    ],
  },

  // ---- Account menu ----
  {
    id: 'S-32', feature: 'Account menu', title: 'Open the account menu and jump to a Settings group', persona: 'new-user', brief: 'feature-map',
    steps: [
      'Press the account badge (your initial, top right) to open the account menu.',
      'Tap one of the Settings rows.',
      'Open the menu again and press Escape.',
    ],
    expected: [
      'The menu lists the Settings groups and Sign out; a row opens Settings at that group.',
      'Escape closes the menu and returns focus to the badge.',
    ],
  },
  {
    id: 'S-33', feature: 'Account menu', title: 'The account menu on a phone width', persona: 'new-user', brief: 'feature-map', edge: true,
    steps: [
      'Emulate a 375 px wide window and open the account menu.',
      'Tap outside it.',
    ],
    expected: [
      'The menu is a bottom sheet with the same rows; tapping outside closes it.',
    ],
  },

  // ---- QA picker ----
  {
    id: 'S-34', feature: 'QA picker', title: 'Switch between test accounts and return to admin', persona: 'new-user', brief: 'qa-picker-access',
    steps: [
      'On a test account, press Switch on the QA banner.',
      'In the sheet search for "diet" and switch to Diet, on target.',
      'Press Return to admin on the banner.',
    ],
    expected: [
      'The sheet opens with "You are: New user"; the search narrows the list; the switch signs you in as Diet, on target after the wipe prompt.',
      'Return to admin restores your own session.',
    ],
  },
  {
    id: 'S-35', feature: 'QA picker', title: 'Reset a test account to its starting data', persona: 'diet-on-target', brief: 'qa-picker-access',
    steps: [
      'As Diet, on target, delete today\'s entries and add a recipe.',
      'Switch to another account, open the picker and press Reset on Diet, on target.',
      'Switch back and open Nutrition.',
    ],
    expected: [
      'Reset is disabled on the account you are on ("Switch away to reset it").',
      'After Reset, the account is back to its seed: three foods today and the saved meal you added is gone. This account is seeded with no recipes (for a recipe check use Meal planner or Recipe collector).',
    ],
  },
  {
    id: 'S-36', feature: 'QA picker', title: 'Seed missing accounts and the Recent list', persona: 'new-user', brief: 'qa-picker-access', edge: true,
    steps: [
      'Open the picker and look for an account marked Not seeded (hollow dot) and the "Seed missing accounts" button. If every account is seeded, delete one through the app first (for example Legacy beta).',
      'Press it if shown, then switch to two accounts in turn.',
      'Reopen the picker.',
    ],
    expected: [
      'An unseeded account\'s Switch is disabled with "Seed it first"; pressing Seed missing accounts seeds it, fills the dot and the button goes away.',
      'The last three accounts appear under Recent, newest first.',
      'Leave the picker page idle for several minutes, then open it and switch again: it still opens and lists accounts, with no error page or crash.',
    ],
  },

  // ---- Wide layouts ----
  {
    id: 'S-37', feature: 'Wide layouts', title: 'Board fits a 1920 px screen', persona: 'heavy-logger', brief: 'board-columns-fit-wide',
    steps: [
      'Open the Board in a 1920 x 1080 window.',
      'Narrow the window to 1280 px.',
    ],
    expected: [
      'At 1920 px all seven day columns fit with no sideways scroll.',
      'At 1280 px the Board scrolls sideways again with its usual column width.',
    ],
  },
  {
    id: 'S-38', feature: 'Wide layouts', title: 'Settings in two columns', persona: 'new-user', brief: 'settings-two-columns',
    steps: [
      'Open Settings at 1920 px, then 1280 px, then 1279 px, then 375 px.',
      'At 1920 px use a rail jump link.',
    ],
    expected: [
      'From 1280 px Data and App sit beside Training; below that it is one column in the same order.',
      'The jump link scrolls to the right group; no sideways scroll at any width.',
    ],
  },
  {
    id: 'S-39', feature: 'Wide layouts', title: 'Exercise library in two columns', persona: 'superset-builder', brief: 'library-two-columns',
    steps: [
      'Open Program, then Exercise library (`#/program/exercises`), at 1920 px and at 1024 px. The heading reads "Exercise library" and the search box "Search 46 exercises" (the account\'s two programs use 46; if it says 0, press Reset on the account).',
      'Use Search and an Equipment chip at 1920 px.',
    ],
    expected: [
      'From 1280 px the exercise rows sit in two columns and the filters share one full-width row.',
      'At 1024 px it is one column, at most 760 px wide.',
    ],
  },
  {
    id: 'S-40', feature: 'Wide layouts', title: 'Nutrition beside Supplements', persona: 'diet-on-target', brief: 'nutrition-two-columns',
    steps: [
      'Open Nutrition at 1920 px and at 1279 px.',
    ],
    expected: [
      'From 1280 px Diet and Supplements are side by side with tops aligned; below it the order is Diet, Supplements, Water, Last 7 days in one column.',
    ],
  },
  // ---- Admin accounts (run as the owner's own admin account; the persona is the test account acted on) ----
  {
    id: 'S-41', feature: 'Admin accounts', title: 'Read the cap and the account list', persona: 'new-user', brief: 'admin-accounts-screen',
    steps: [
      'Signed in as your own admin account, open Settings and press Open accounts.',
      'Look at the cap, the counts and the list of newest accounts.',
    ],
    expected: [
      'The address ends #/settings/accounts and the page shows the sign-up cap used, free and paid counts and a suspended count.',
      'Each account is a masked email such as j***@gmail.com with its number, plan and join date; no name, full email or workout content appears; admin accounts have no Suspend button.',
    ],
  },
  {
    id: 'S-42', feature: 'Admin accounts', title: 'Suspend and restore a test account', persona: 'new-user', brief: 'admin-accounts-screen',
    steps: [
      'On the Accounts page find the New user test account and press Suspend, then press Press again to suspend.',
      'Use the account menu to switch to the New user test account.',
      'Return to your admin account and press Restore on that row.',
      'Switch to the New user test account again.',
    ],
    expected: [
      'The row shows Suspended and Last actions lists "Suspended account" with the number.',
      'As the suspended account every screen shows "This account is suspended" and nothing syncs; Settings still offers export and delete.',
      'After Restore the notice is gone and the app works as before with no data lost.',
    ],
  },
  {
    id: 'S-43', feature: 'Admin accounts', title: 'A non-admin cannot reach the page', persona: 'paid-monthly', brief: 'admin-accounts-screen', edge: true,
    steps: [
      'Switch to the Paid, monthly test account and open Settings.',
      'Type #/settings/accounts at the end of the address and press Enter.',
    ],
    expected: [
      'Settings has no Accounts section and no Open accounts button.',
      'The typed address shows Settings and no list of accounts.',
    ],
  },
  {
    id: 'S-44', feature: 'Admin accounts', title: 'Back and reload on the Accounts page', persona: 'new-user', brief: 'admin-accounts-screen', edge: true, device: true,
    steps: [
      'On a phone, as your admin account, open Settings, then Open accounts.',
      'Reload the page, then swipe back (or press the phone Back button).',
    ],
    expected: [
      'The reload reopens the Accounts page.',
      'Back returns to Settings, not out of the app.',
    ],
  },
  {
    id: 'S-45', feature: 'Admin accounts', title: 'Delete a suspended test account for good', persona: 'recipe-collector', brief: 'admin-delete-account',
    steps: [
      'Signed in as your own admin account, open Settings, Open accounts, and suspend the Recipe collector test account.',
      'Press Delete forever on that row, type the account number shown, and press Delete forever again.',
      'Re-seed the QA test accounts afterwards so Recipe collector exists again.',
    ],
    expected: [
      'Delete forever is disabled until the typed number is exactly the account number, and Cancel closes the form with nothing deleted.',
      'After confirming, the row is gone and Last actions says "Deleted an account"; switching to that test account no longer works.',
    ],
  },
  {
    id: 'S-46', feature: 'Admin accounts', title: 'Delete forever only on a suspended row', persona: 'new-user', brief: 'admin-delete-account', edge: true,
    steps: [
      'On the Accounts page look at the New user row while it is active, then at your own admin row.',
      'Suspend New user and look at its row again, then restore it.',
    ],
    expected: [
      'An active row and an admin row have no Delete forever button.',
      'Once New user is suspended, Delete forever appears beside Restore; after Restore it is gone again.',
    ],
  },
  // ---- kg beside lb ----
  {
    id: 'S-47', feature: 'kg beside lb', title: 'See the kg beside a pound weight', persona: 'heavy-logger', brief: 'lb-kg-toggle',
    steps: [
      'On the Board press Log on an exercise and type 135 in Set 1 weight.',
      'Fill the reps, press Save set, then open the Log sheet again and look at Recent.',
    ],
    expected: [
      'A small grey "61.2 kg" shows right of the weight box as you type, and nothing shows when the box is empty.',
      'The Recent list shows the load as "135 lb (61.2 kg)". The saved weight is still 135 lb.',
    ],
  },
  {
    id: 'S-48', feature: 'kg beside lb', title: 'Hide the kg figures', persona: 'heavy-logger', brief: 'lb-kg-toggle', edge: true,
    steps: [
      'Open Settings, find Kilograms and turn off Show kg beside lb.',
      'Open a Log sheet and type a weight; open Maxes.',
      'Turn the switch back on.',
    ],
    expected: [
      'No kg figure appears in the Log sheet, Recent or Maxes while it is off.',
      'The kg figures return when it is switched on again; no logged weight changed.',
    ],
  },
  // ---- Label scan ----
  {
    id: 'S-49', feature: 'Label scan', title: 'Fill a ready-made food from a label photo', persona: 'diet-on-target', brief: 'label-photo-scan', device: true,
    steps: [
      'On a phone, sign in as an admin account. On Recipes press New ready-made food, then Scan label (opens the camera) and photograph a nutrition-facts label (frozen gnocchi, cereal, a can); on a second food press Choose photo and pick a saved photo of a label.',
      'Compare the filled calories, protein, carbs and fat with the printed per-serving column and fix anything that differs.',
      'Press Save food, open it, and use Ate this with 1.5 portions.',
    ],
    expected: [
      'The form fills in a few seconds with the name, per-serving numbers and a Note like "1 serving = 2/3 cup (55 g). About 6 servings per pack." and says to check the numbers; nothing is saved yet.',
      'After Save food the food is in the Ready-made list; Ate this logs 1.5 times the calories and protein to today.',
    ],
  },
  {
    id: 'S-50', feature: 'Label scan', title: 'A blurry photo or a non-admin account', persona: 'diet-fresh', brief: 'label-photo-scan', edge: true, device: true,
    steps: [
      'On a phone as an admin, press Scan label and photograph something that is not a label (a table), then a label that only shows a per 100 g column if you have one.',
      'Sign in as a test account that is not an admin and open New ready-made food.',
    ],
    expected: [
      'The form stays empty and says it could not read the numbers (or that the label shows per 100 g only); you can still type the numbers and save.',
      'The non-admin account sees no Scan label button.',
    ],
  },
  // ---- Whole pack ----
  {
    id: 'S-51', feature: 'Whole pack', title: 'Log a whole pack of a ready-made food', persona: 'diet-on-target', brief: 'whole-pack',
    steps: [
      'On Recipes press New ready-made food, type a name, 210 calories and 6 protein, set Servings per pack to 12 and press Save food.',
      'Open the food, look under Per portion, then press Whole pack (12) and press More once.',
      'Press Whole pack (12) again, press Ate this, then press Undo.',
    ],
    expected: [
      'The page says "12 servings per pack"; Whole pack (12) sets the stepper to 12 portions and More is disabled at 12.',
      'Ate this logs "12 portions" with 2,520 calories to today; Undo removes it. A food saved with no pack size has no Whole pack button and its stepper stops at 10.',
    ],
  },
  {
    id: 'S-52', feature: 'Whole pack', title: 'A wrong pack size is refused', persona: 'diet-fresh', brief: 'whole-pack', edge: true,
    steps: [
      'On New ready-made food fill the name and numbers and type 2.5 in Servings per pack, then press Save food.',
      'Change it to 8, save, then edit the food and clear the box.',
    ],
    expected: [
      'It says "Servings per pack must be a whole number from 1 to 99." and saves nothing.',
      'With 8 the page shows "8 servings per pack"; after clearing the box the line and the Whole pack button are gone.',
    ],
  },
  // ---- Receipt scan ----
  {
    id: 'S-53', feature: 'Receipt scan', title: 'Scan a BJ\'s receipt and apply it', persona: 'grocery-shopper', brief: 'receipt-scan', device: true,
    steps: [
      'On a phone, sign in as an admin account with items like the ones on your receipt. On Groceries, To get, press Scan receipt and photograph a BJ\'s receipt.',
      'In the sheet, compare each line with the paper: the item it matched, the quantity and the price after the instant savings. Change one match and untick one line.',
      'Check the Total check line, pick the store for the tax if it asks, then press Apply and look at the list; then press Undo.',
    ],
    expected: [
      'The sheet lists every receipt line; a discount is taken off the item above it and the old price shows crossed out; lines with no item on your list are greyed and skipped.',
      'Apply ticks the matched items as bought this month with the right quantity and price and sets the store tax; Undo puts every price, tick and the tax back as they were.',
      'A line sold by weight (lb or oz on the paper) is converted into the item\'s own unit; Undo is held back while the app is still syncing the apply and works once it has finished.',
    ],
  },
  {
    id: 'S-54', feature: 'Receipt scan', title: 'A bad photo or a total that does not add up', persona: 'grocery-shopper', brief: 'receipt-scan', edge: true, device: true,
    steps: [
      'On a phone as an admin, press Scan receipt and photograph something that is not a receipt, or half of one.',
      'Scan a real receipt again with the bottom cut off, so a line is missing, and look at the Total check.',
      'Sign in as a test account that is not an admin and open Groceries.',
    ],
    expected: [
      'A photo that is not a receipt says it could not read it and changes nothing on the list.',
      'A cut-off receipt shows the missing amount in the Total check but still lets you Apply; a non-admin account sees no Scan receipt button.',
    ],
  },
  // ---- Usual amount ----
  {
    id: 'S-55', feature: 'Usual amount', title: 'Log 4 eggs in two taps', persona: 'diet-on-target', brief: 'usual-amount-and-unit',
    steps: [
      'On Recipes press New ready-made food, name it Egg (large), type 72 calories and 6 protein, set Usual amount to 4 and One serving is called to egg, and press Save food.',
      'Look at the food\'s page: the Usual line, the Per line and the stepper. Press More once, then Less once.',
      'Press Ate this, look at today\'s Diet log, then press Undo.',
    ],
    expected: [
      'The page says "Usual: 4 eggs", "Per egg: 72 kcal · 6 g protein" and the stepper opens at "4 eggs"; More shows "4.5 eggs".',
      'Ate this says "Logged 4 eggs of Egg (large) to today." and adds 288 calories to the day; Undo removes it. A food saved with neither box still opens at "1 portion".',
    ],
  },
  {
    id: 'S-56', feature: 'Usual amount', title: 'An odd plural, and a wrong amount is refused', persona: 'diet-fresh', brief: 'usual-amount-and-unit', edge: true,
    steps: [
      'Make a ready-made food Bread with Usual amount 2, One serving is called loaf and Plural loaves; open it and press Less twice.',
      'Edit it and type 2.3 in Usual amount, then 4 eggs in One serving is called, pressing Save food each time.',
      'Clear all three boxes, save, and open the food again.',
    ],
    expected: [
      'The stepper reads "2 loaves", then "1.5 loaves", then "1 loaf".',
      'Saving 2.3 says the amount must be from 0.5 to 99 in half steps; "4 eggs" as a unit says it must be 1 to 20 letters; with all three boxes cleared the food opens at "1 portion" again.',
    ],
  },
  {
    id: 'S-57', feature: 'Receipt scan', title: 'Add an unmatched receipt line to the list', persona: 'grocery-shopper', brief: 'receipt-add-item', device: true,
    steps: [
      'On a phone as an admin, scan a BJ\'s receipt that has a line your list does not have (for example a soda).',
      'On that line press Add to list. Check the name, store, count and price the form filled in, then press Add item.',
      'Look at the row and the footer, then press Apply and open the To get list and Bought this month. Then press Undo.',
    ],
    expected: [
      'The form starts with the receipt text tidied (Zevia soda 12pk), the receipt\'s store (or Anywhere), the count and the price after any savings; Add item marks the row New and the footer says 1 new item will be added, with nothing yet on the list.',
      'Apply adds the item under that store, ticked bought with the receipt price; Undo removes it again along with the other prices and ticks.',
    ],
  },
  {
    id: 'S-58', feature: 'Receipt scan', title: 'Cancel, remove or repeat a new item', persona: 'grocery-shopper', brief: 'receipt-add-item', edge: true, device: true,
    steps: [
      'On a phone as an admin, on the receipt sheet press Add to list on a line, then Not now. Add it again, press Remove on the row, add it again and press Cancel on the sheet.',
      'Press Add to list on a line and type the name of an item that is already in that store (such as Eggs), then press Add item. Empty the name and press Add item.',
    ],
    expected: [
      'Not now, Remove and Cancel each leave the list exactly as it was.',
      'A name already in that store says it is already in the list and to pick it instead; an empty name says to give the item a name; neither adds anything to the row.',
    ],
  },
  // ---- Receipt photos ----
  {
    id: 'S-59', feature: 'Receipt photos', title: 'Keep a receipt photo, then open, note, download and delete it', persona: 'grocery-shopper', brief: 'receipt-save-photo', device: true,
    steps: [
      'On a phone as an admin, scan a BJ\'s receipt. In the sheet, tick Keep a copy of this photo and press Apply.',
      'Press Receipts beside Scan receipt. Find the receipt under its month, open it, read every line of the photo (scroll inside it), type a note and press Save note.',
      'Press Download, then Delete this receipt and Keep it, then Delete this receipt and Delete. Press Back.',
    ],
    expected: [
      'The box starts unticked; after Apply a line says "Photo saved. Find it under Receipts." and the receipt is listed as store, date and total, newest month first.',
      'The photo is sharp enough to read every line; the note is still there when you close and reopen it; Download saves a .jpg named with the date and store; Keep it changes nothing, Delete removes the row; Back goes up to the grocery list.',
    ],
  },
  {
    id: 'S-60', feature: 'Receipt photos', title: 'Not ticked saves nothing; a failed or full save says so', persona: 'grocery-shopper', brief: 'receipt-save-photo', edge: true, device: true,
    steps: [
      'On a phone as an admin, scan a receipt and press Apply with the box unticked; then scan another, tick the box and press Cancel. Open Receipts.',
      'Scan a receipt, tick the box, turn on airplane mode and press Apply; turn it off and press Try again.',
      'Sign in as a test account that is not an admin and open Groceries.',
    ],
    expected: [
      'Neither the unticked Apply nor the cancelled one leaves a receipt on the Receipts page, which says "No saved receipts yet" when it is empty.',
      'Offline, the prices still apply and the notice says the photo was not saved, with Try again; Try again saves it once. A non-admin account sees no Receipts button and no Keep box. Opening a saved receipt and closing it, or pressing Retry, before the photo has loaded never shows that photo on the wrong sheet. (At 200 receipts or 60 MB the notice says to delete some in Receipts.)',
    ],
  },
  {
    id: 'S-61', feature: 'Finished group', title: 'Done and skipped exercises fold into one bar', persona: 'superset-builder', brief: 'finished-group-fold',
    steps: [
      'Open the Board on Day 1. Tick one exercise and skip another from its ⋯ menu.',
      'Look at the bottom of the day: press the Finished bar to open it, then press it again to close it.',
    ],
    expected: [
      'Both cards leave the list of open cards, which keeps its usual look. A closed Finished (2) bar sits below them with "1 done" and "1 skipped".',
      'Open, it shows one short row per exercise: the done one has Edit and Untick, the skipped one has Undo skip. Closed, only the bar shows.',
    ],
  },
  {
    id: 'S-62', feature: 'Finished group', title: 'Edit a done exercise and put cards back', persona: 'superset-builder', brief: 'finished-group-fold',
    steps: [
      'Log a set for an exercise so it is done, open the Finished bar and press Edit on its row; change a number and save.',
      'Press Untick on that row, then press Undo skip on a skipped row.',
    ],
    expected: [
      'Edit opens the log sheet in Edit mode ("You are changing the session logged ...") and the saved number shows.',
      'Each card returns to the open list as a normal card; when the last finished row goes, the bar disappears and the day shows only open cards.',
    ],
  },
  {
    id: 'S-63', feature: 'Finished group', title: 'A superset and a day with nothing left', persona: 'superset-builder', brief: 'finished-group-fold', edge: true,
    steps: [
      'Tick both halves of a superset, then finish every other card in the day (tick or skip).',
      'Open the Finished bar and Untick one half of the superset.',
    ],
    expected: [
      'The superset shows as two rows in the bar, one per exercise. With every card finished the day shows its header and the closed bar, with no extra text between them.',
      'Only that half goes back; the superset returns to the open list with the other half still ticked.',
    ],
  },
  {
    id: 'S-64', feature: 'Weight step', title: 'Set how far an exercise goes up, and see the suggestion follow', persona: 'heavy-logger', brief: 'progression-step-per-exercise',
    steps: [
      'Open Program, Exercise library and press Edit on an exercise you have logged at the same weight twice in a row with every set done (the heavy logger has several).',
      'Under Equipment, tap the 10 chip in Weight step and save. Go to the Board and find that exercise\'s card.',
      'Open the exercise again and tap the lit 10 chip once more, then save.',
    ],
    expected: [
      'The card\'s green badge reads "suggested, from N lb" with the weight 10 lb above N, not the usual 2.5 or 5.',
      'Tapping the lit chip empties the box (its placeholder reads "Default: 2.5 lb under 50 lb, else 5"); after saving, the badge goes back to the usual step. On a card with nothing logged, the Log sheet has the same field under Equipment.',
    ],
  },
  {
    id: 'S-65', feature: 'Weight step', title: 'A step that is not allowed is refused', persona: 'heavy-logger', brief: 'progression-step-per-exercise', edge: true,
    steps: [
      'In Program, Exercise library, Edit an exercise and type 60 in the Weight step box; then try 0, 2.3 and abc.',
      'Type 7.5 and save, then open it again. Press Save with the box showing 60 once more.',
    ],
    expected: [
      'Each of 60, 0, 2.3 and abc shows "Enter a step above 0, up to 50, in 0.5 steps." and Save keeps the sheet open without saving.',
      '7.5 is accepted and shown again when the sheet is reopened.',
    ],
  },
  {
    id: 'S-66', feature: 'Program compare', title: 'Compare two programs day by day and filter the differences', persona: 'superset-builder', brief: 'program-compare',
    steps: [
      'Open Program, scroll to the end and tap Compare programs. Program A and Program B are chosen.',
      'Tap Day 2, then Any difference, then Changed. Tap Phase differs, then pick a phase under Phase.',
      'Choose a saved program (save a copy of A first if the list is empty) as the second program.',
    ],
    expected: [
      'Two boards appear one above the other, each with its phase mix and the day buttons showing how many exercises differ; every row is tagged Same, Changed, Phase differs or Only here, and shows the editor\'s name, phase, weight and sets.',
      'Each filter hides the other rows and the numbers on the chips stay the same; nothing on the page can be dragged or edited, and Program A and B are unchanged afterwards.',
      'A saved copy of A against A shows no differences; choosing the same program on both sides says "Both sides are the same program."',
    ],
  },
  {
    id: 'S-67', feature: 'Program compare', title: 'An empty day, and a day that exists on one side only', persona: 'new-user', brief: 'program-compare', edge: true,
    steps: [
      'As a new account, create a program, open Program, Compare programs, and pick it against Program A.',
      'Step through the day buttons.',
    ],
    expected: [
      'A day empty on both sides says "Nothing on this day in either program."; a day with exercises on one side lists them all as Only here on that side and an empty board on the other.',
      'The section is closed again after you leave the Program tab and come back, and the phone view does not scroll sideways.',
    ],
  },
  {
    id: 'S-68', feature: 'Polish pass', title: 'Dark mode opens dark, with no white flash', persona: 'new-user', brief: 'polish-theme-flash-pressed-errors', device: true,
    steps: [
      'On a phone, tap the Colours button until it says dark, then close the app completely.',
      'Open the app again from the home screen or the browser, on a throttled connection if you can.',
    ],
    expected: [
      'The screen is dark from the first moment: no white or light-grey flash before the app appears.',
      'Choosing light, or match this device, and reopening shows light, or the phone\'s own setting, from the first moment as well.',
    ],
  },
  {
    id: 'S-69', feature: 'Polish pass', title: 'Buttons and section tabs respond to a press', persona: 'new-user', brief: 'polish-theme-flash-pressed-errors',
    steps: [
      'Press and hold a section tab (Daily, Progress, Program, Settings) and a plain button such as Cancel on a sheet, without letting go.',
      'Press and hold a Board card button or a Swap day button.',
    ],
    expected: [
      'The tab and the plain button sink slightly and darken while held, and return when released; with "reduce motion" on the phone, they only darken.',
      'The Board card buttons and Swap day buttons look and behave exactly as before.',
    ],
  },
  {
    id: 'S-70', feature: 'Polish pass', title: 'A file that cannot be read gives a plain sentence', persona: 'new-user', brief: 'polish-theme-flash-pressed-errors', edge: true,
    steps: [
      'In Settings, pick an export file to import that is on a cloud drive and not downloaded to the phone (or one that is revoked or corrupt).',
    ],
    expected: [
      'A plain sentence appears (about downloading it first, or that the file could not be read), with no text such as "Error:", a status number or "undefined".',
    ],
  },
  // ---- Recipe auto-match (On your list) ----
  {
    id: 'S-71', feature: 'Recipe auto-match', title: 'A missing ingredient already on the list says On your list', persona: 'recipe-collector', brief: 'feature-map',
    steps: [
      'Open "Chicken and rice bowl" and note an ingredient shown as Missing that has an item on Groceries, To get (add one with the ingredient\'s name if there is none).',
      'Look at that line, then press Add missing to Groceries.',
      'Open Groceries, To get and check how many times the item appears.',
    ],
    expected: [
      'The line shows Missing with a small "On your list" mark beside it; an ingredient that is at home, skipped or "Always at home" (water) never shows it.',
      'Add missing does not add that item a second time; it stays on the list once.',
    ],
  },
  // ---- Program on phones ----
  {
    id: 'S-72', feature: 'Program on phones', title: 'Create a program starts at the left, and the switch shows A and B', persona: 'new-user', brief: 'feature-map',
    steps: [
      'On a phone (or a 375 px wide window), open the Program tab.',
      'Look at the row holding Create a program and the program switch.',
    ],
    expected: [
      'Create a program starts at the left edge of the screen and is not pushed off to the right or cut off.',
      'The switch shows only A and B (no other labels), and the row does not scroll sideways.',
    ],
  },
  // ---- Stale page guard ----
  {
    id: 'S-73', feature: 'Stale page guard', title: 'Erase or delete is refused from a page for another account', persona: 'new-user', brief: 'x-expected-user-409',
    steps: [
      'In one browser tab sign in as New user and open Settings. Leave it open.',
      'In a second tab of the same browser, switch to another test account (the QA picker).',
      'Back in the first tab, open Delete my data and press Erase everything in my account, and confirm.',
      'Repeat steps 1 to 3 from the start, pressing Delete my account instead (the first page no longer has the panel after a refusal).',
    ],
    expected: [
      'The request is refused: the Delete my data panel goes away and the other-account card takes its place; neither account loses anything. The same happens for Delete my account.',
      'After reloading the first tab it shows the account you are now signed in as, and the other test account\'s data is untouched.',
    ],
  },
];





export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find(s => s.id === id);
/** The scenarios a persona runs (retired ones left out), in id order. */
export const scenariosForPersona = (personaId: string): Scenario[] => SCENARIOS.filter(s => s.persona === personaId && !s.retired);
