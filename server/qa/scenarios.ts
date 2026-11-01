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
  | 'Wide layouts';

/** Every feature a scenario may cover, in the order the document lists them. The test fails on one with no scenario. */
export const SCENARIO_FEATURES: readonly ScenarioFeature[] = [
  'Diet targets and log', 'Goal calories and pace', 'Saved meals', 'Meal planner', 'Suggest and copy', 'Auto macros', 'Ingredient macros', 'Food lookup',
  'Recipe-first log', 'Recipe nutrition', 'Recipe servings', 'Recipe video link', 'Recipe auto-match', 'Share target', 'Account menu', 'QA picker', 'Wide layouts',
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
    id: 'S-01', feature: 'Diet targets and log', title: 'Read today and quick add a food', persona: 'diet-on-target', brief: 'diet-targets-and-log',
    steps: [
      'Open Nutrition and look at the Diet card for today.',
      'Tap Quick add, enter "Rice", 200 kcal and 4 g protein, and press Add.',
      'Edit the Rice entry to 250 kcal, then delete it.',
      'Use the day stepper to go back one day.',
    ],
    expected: [
      'Before adding: three foods are logged and the bars read about "Calories 1,440 of 2,400" and "Protein 96 of 160".',
      'Adding Rice moves the totals by 200 kcal and 4 g; editing and deleting move them again; the total returns to where it began.',
      'Yesterday shows its own full day of five foods, not today\'s.',
    ],
  },
  {
    id: 'S-02', feature: 'Diet targets and log', title: 'Over target, and the 20 entries a day limit', persona: 'diet-over-target', brief: 'diet-targets-and-log', edge: true,
    steps: [
      'Open Nutrition and read the Diet card for today.',
      'Add small quick-add foods (for example "Tea", 5 kcal, 0 g) until the day holds 20 entries.',
      'Try to add a 21st.',
    ],
    expected: [
      'Today is about 120% of the calories (about 2,880 of 2,400) and shown as over target; protein reads short (about 88 of 160).',
      'The 21st add is refused and the message states the limit of 20 entries a day.',
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
      'Rename the meal "Weekday breakfast", then delete it and press Undo.',
    ],
    expected: [
      'Tapping the meal adds each food as its own entry with the meal\'s numbers (two foods for Usual breakfast).',
      'The rename shows at once; Delete shows an Undo notice and Undo brings the meal back.',
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
    id: 'S-10', feature: 'Suggest and copy', title: 'Quick add suggests by the hour', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
    steps: [
      'Open Nutrition and Quick add.',
      'Read the suggested foods (the seed logged Oatmeal with berries near 8, Greek yogurt 10, Chicken and rice bowl 13, Almonds and fruit 16, Salmon with potatoes 19).',
      'Tap the first suggestion, then press Undo.',
    ],
    expected: [
      'The food eaten nearest to the current hour comes first; foods never eaten near this hour still appear after the ranked ones.',
      'Tapping adds one portion with the latest numbers of that food and the totals move; Undo removes only that entry.',
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
      'Open Quick add. Type protein 30, carbs 50 and fat 10 without touching Calories.',
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
      'Open Quick add and type Calories 300 first.',
      'Then type protein 20, carbs 20 and fat 5.',
    ],
    expected: [
      'Calories stay at 300 while the macros are typed.',
    ],
  },
  {
    id: 'S-14', feature: 'Auto macros', title: 'Search past meals and recipes, with a portion stepper', persona: 'meal-planner', brief: 'diet-auto-macros',
    steps: [
      'In Quick add open "Search your past meals and recipes" and type "oat".',
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
      'Open Quick add and type "banana" in the food search.',
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
      'Type "banana" in the food search, then type the numbers by hand and press Add.',
    ],
    expected: [
      'The search says "Food search is not available right now. You can still type the numbers." and the rest of the form keeps working; Add still logs the entry.',
    ],
  },

  // ---- Recipe-first log ----
  {
    id: 'S-19', feature: 'Recipe-first log', title: 'Ate this on a recipe, for a chosen day', persona: 'meal-planner', brief: 'recipe-first-diet-log',
    steps: [
      'Open Recipes, then a recipe with calories and protein (for example Overnight oats).',
      'Press Ate this, choose yesterday in the Day field and confirm.',
      'Press Undo. Then try a day 31 days back and a day in the future.',
    ],
    expected: [
      'One entry with the recipe\'s numbers and its recipe link is added to the chosen day; Undo removes only that entry.',
      'A future day and a day over 30 days back are refused.',
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
      'The detail reads "N servings, about 1 bowl (250 g) each".',
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
    id: 'S-27', feature: 'Recipe video link', title: 'A link must start with https://', persona: 'recipe-collector', brief: 'recipe-video-link', edge: true,
    steps: [
      'Edit a recipe and enter "youtube.com/abc" in Video link, then press Save.',
    ],
    expected: [
      'The form shows "Video link should start with https://" and does not save.',
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
      'Water shows as Have and is included in "Have x of y".',
      'Add missing does not add water to the grocery list.',
    ],
  },
  {
    id: 'S-29', feature: 'Recipe auto-match', title: 'Maybe matches and Accept all', persona: 'recipe-collector', brief: 'recipe-auto-match', edge: true,
    steps: [
      'Open "Chicken and rice bowl" (ingredient "Chicken breast") while At home holds a "Chicken thighs" item.',
      'Tap a "Maybe: <item>" line, then undo the pin by hand.',
      'Open another recipe with several Maybe lines and press Accept all suggestions.',
    ],
    expected: [
      'A close but inexact name shows "Maybe: <item>" and is not counted as a match until tapped.',
      'Tapping pins it; Accept all pins every suggestion in one action and the button disappears when none are left.',
      'The seeded names decide which recipes show Maybe; if none does, record that and add an At home item with a shared word.',
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
      'After Reset, the account is back to its seed: three foods today and no recipes.',
    ],
  },
  {
    id: 'S-36', feature: 'QA picker', title: 'Seed missing accounts and the Recent list', persona: 'new-user', brief: 'qa-picker-access', edge: true,
    steps: [
      'Open the picker and look for a hollow dot (an account not seeded) and the "Seed missing accounts" button.',
      'Press it if shown, then switch to two accounts in turn.',
      'Reopen the picker.',
    ],
    expected: [
      'An unseeded account\'s Switch is disabled with "Seed it first"; seeding fills the dot.',
      'The last three accounts appear under Recent, newest first.',
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
      'Open the exercise library at 1920 px and at 1024 px.',
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
];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find(s => s.id === id);
/** The scenarios a persona runs (retired ones left out), in id order. */
export const scenariosForPersona = (personaId: string): Scenario[] => SCENARIOS.filter(s => s.persona === personaId && !s.retired);
