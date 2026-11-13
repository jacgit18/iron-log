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
  | 'Desktop week card';

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
      'Open Daily, Nutrition and find today\'s column (its name ends "· today"). Read its Calories and Protein meters and its eaten rows.',
      'Press Add food, then One-off food, enter "Rice", 200 kcal and 4 g protein, and press Add. Press Done.',
      'In today\'s eaten rows tap the Rice row, press Edit in its sheet, change the calories to 250 and press Save, then tap the row again, press Delete and press Tap again to delete.',
      'Read yesterday\'s column, the one just before today\'s (on a phone press Previous day; if today is a Sunday, press the previous-week arrow first).',
    ],
    expected: [
      'Before adding: the eaten rows holds three foods and the meters read "1,440 / 2,400 kcal" and "58 / 160 g".',
      'Adding Rice moves the totals by 200 kcal and 4 g; editing and deleting move them again; the total returns to where it began.',
      'Yesterday shows its own full day of five foods under Not in a meal, not today\'s; its rows open the same row sheet as today\'s (an earlier day can be corrected: S-209).',
    ],
  },
  {
    id: 'S-02', feature: 'Diet targets and log', title: 'Over target, and the 20 entries a day limit', persona: 'diet-over-target', brief: 'diet-targets-and-log', edge: true,
    steps: [
      'Open Daily, Nutrition and read today\'s Calories and Protein meters.',
      'Press Add food, One-off food, and add small foods (for example "Tea", 5 kcal, 0 g) until the day holds 20 entries.',
      'Try to add a 21st from One-off food, then open Quick add from the sheet\'s list of ways.',
    ],
    expected: [
      'Today is about 120% of the calories (about "2,880 / 2,400 kcal"); the bar stays full and turns red, and protein reads short (about "106 / 160 g").',
      'A 21st one-off food is refused with "You can log 20 things a day."; Quick add shows "That’s 20 things for the day. Delete one to add another." instead of its choices. Deleting one entry from the eaten rows brings both back.',
    ],
  },

  // ---- Goal calories and pace ----
  {
    id: 'S-03', feature: 'Goal calories and pace', title: 'Missing goal weight, then a recommended target', persona: 'diet-fresh', brief: 'diet-pace',
    steps: [
      'Open Daily, Nutrition, press Manage and read Daily targets: no targets are saved and no goal weight is set.',
      'Manage shows "No goal set" under Weight and goal. Press Edit in Progress (or the "Set a goal weight" button under Daily targets), set a goal 15 lb below the latest body weight (about 180 lb is seeded) in Progress > Trends, then open Nutrition and Manage again.',
      'Read Daily targets again.',
      'Pick each pace chip in turn: Slow, Steady, Fast.',
    ],
    expected: [
      'Before the goal: Daily target names what is missing ("Set a goal weight") instead of showing numbers.',
      'After the goal: calories, protein, fat and carbs appear labelled as an estimate, with a sentence about calories to stay the same, the daily change and the weeks to the goal; the board\'s meters now show that calorie target.',
      'Each pace changes the calories and the weeks; the pick survives a reload.',
    ],
  },
  {
    id: 'S-04', feature: 'Goal calories and pace', title: 'Fast pace is held at the limit; a typed number wins', persona: 'diet-fresh', brief: 'diet-macros-and-goal-calories', edge: true,
    steps: [
      'In Manage, with a goal weight set below the latest weight (see S-03), pick Fast.',
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
    id: 'S-05', feature: 'Saved meals', title: 'Plan a saved meal for a day ahead', persona: 'meal-planner', brief: 'diet-saved-meals',
    steps: [
      'Open Daily, Nutrition and tap the name of a day after today (for example "Fri 25") so the toolbar reads "Adding to Fri 25".',
      'Press Add food, pick Lunch under Which meal?, press Saved meals and tap "Usual breakfast".',
      'Open Recipes, press Meals, open the meal and rename it "Weekday breakfast" from Edit. Open Nutrition again, press Add food on that day and press Saved meals.',
    ],
    expected: [
      'A day ahead plans, it does not log: the notice reads "Planned Usual breakfast for Lunch." and the meal appears under Lunch on that day. On today the same list logs the meal\'s foods as entries instead (S-202).',
      'The rename is made in Recipes (there is no Manage button) and shows in Saved meals. See S-183 to S-185.',
    ],
  },
  {
    id: 'S-06', feature: 'Saved meals', title: 'Save today\'s foods as a meal; a name a recipe has is refused', persona: 'diet-on-target', brief: 'diet-saved-meals', edge: true,
    steps: [
      'Open Nutrition, press Add food, then Save as a meal. Press Save as a meal, tick Oatmeal with berries and Greek yogurt and save them as "Breakfast".',
      'Tick the same two foods again and save as "breakfast" (small b).',
      'Try saving with a blank name.',
    ],
    expected: [
      'A meal "Breakfast" is made in Recipes (Meals) and appears in Saved meals as one food with the two foods\' summed calories.',
      'The second save is refused ("You already have a recipe or meal with that name."); it no longer replaces.',
      'A blank name is refused.',
    ],
  },

  // ---- Meal planner ----
  {
    id: 'S-07', feature: 'Meal planner', title: 'Read a planned day and change a portion', persona: 'meal-planner', brief: 'diet-meal-planner',
    steps: [
      'Open Daily, Nutrition and read the seven days of This week (on a phone step through them with the day stepper). Look at the meals of a day after today that has a recipe and a meal planned.',
      'Tap the recipe\'s card, press More and raise the portions.',
      'Tap the card again, press Remove and press Tap again to remove (the first tap only arms it).',
    ],
    expected: [
      'Each day lists its planned items under Breakfast, Lunch, Dinner and Snack, and a day ahead reads its planned calories and protein against the 2,400 / 160 targets in its meters.',
      'Raising the portion raises that day\'s planned totals; removing the recipe lowers them. (Today\'s meters count only what was eaten: S-196.)',
    ],
  },
  {
    id: 'S-08', feature: 'Meal planner', title: 'Tick the plan to log it; later days have no check box', persona: 'meal-planner', brief: 'diet-meal-planner', edge: true,
    steps: [
      'On today\'s column, tick the check box beside today\'s planned recipe (Check <name> as eaten).',
      'Tick the check box beside today\'s planned meal.',
      'Look at the cards of a day after today.',
    ],
    expected: [
      'The recipe logs one entry with its numbers at the planned portion, shown as checked in its meal (the notice reads "Added 1 from <name>."), not listed again as a separate eaten row, and today\'s meters move. Unticking removes what it logged. A planned meal (it is a recipe in the plan now that saved meals live in Recipes) also logs one entry with its total; Quick add logs the same meal\'s linked foods one by one.',
      'Days after today have no check box.',
    ],
  },
  {
    id: 'S-09', feature: 'Meal planner', title: 'A recipe\'s missing ingredients go to Shopping once; Nutrition has no button for it', persona: 'meal-planner', brief: 'diet-meal-planner',
    steps: [
      'Open Daily, Nutrition and look under the day for a button named Add missing ingredients to Shopping.',
      'Open Recipes, open a planned recipe and press Add missing to Shopping.',
      'Open Groceries and look at Shopping, then press the recipe\'s button again.',
    ],
    expected: [
      'Nutrition has no Add missing ingredients to Shopping button; the page ends with the day\'s Hydration.',
      'The recipe\'s button adds each ingredient it lacks once and reports how many were added and how many are on Shopping already.',
      'The second press adds nothing and says they are all on Shopping already.',
    ],
  },

  // ---- Suggest and copy ----
  {
    id: 'S-10', feature: 'Suggest and copy', title: 'Quick add suggests by the hour', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
    steps: [
      'Open Daily, Nutrition and press Quick add in the toolbar.',
      'Read Suggested now (the seed logged Oatmeal with berries near 8, Greek yogurt 10, Chicken and rice bowl 13, Almonds and fruit 16, Salmon with potatoes 19).',
      'Tap the first suggestion.',
    ],
    expected: [
      'The food eaten nearest to the current hour comes first; foods never eaten near this hour still appear after the ranked ones.',
      'Tapping adds one portion with the latest numbers of that food and the totals move and the notice reads "Added <food>." (there is no Undo here; delete the entry by hand to put the day back).',
    ],
  },
  {
    id: 'S-11', feature: 'Suggest and copy', title: 'Copy yesterday with one food unticked', persona: 'diet-on-target', brief: 'diet-suggest-and-copy',
    steps: [
      'On Nutrition press Add food, then Copy yesterday, then Copy yesterday again: yesterday\'s foods are all ticked.',
      'Untick one and press Add selected.',
    ],
    expected: [
      'Only the ticked foods are added to today, with their numbers unchanged, and they show in the eaten rows.',
      'If the day would pass 20 entries it adds what fits and says how many were left out.',
    ],
  },

  // ---- Auto macros ----
  {
    id: 'S-12', feature: 'Auto macros', title: 'Calories follow typed macros', persona: 'diet-on-target', brief: 'diet-auto-macros',
    steps: [
      'Press Add food, then One-off food. Type protein 30, carbs 50 and fat 10 without touching Calories.',
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
      'Press Add food, then One-off food, and type Calories 300 first.',
      'Then type protein 20, carbs 20 and fat 5.',
    ],
    expected: [
      'Calories stay at 300 while the macros are typed.',
    ],
  },
  {
    id: 'S-14', feature: 'Auto macros', title: 'Search past meals and recipes, with a portion stepper', persona: 'meal-planner', brief: 'diet-auto-macros',
    steps: [
      'Press Add food, then Find food. In the "Search your past meals and recipes" box type "oat".',
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
      'Press Add food, then Find food. In the "Search your past meals and recipes" box type "banana".',
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
      'Press Add food, then Find food. In the "Search your past meals and recipes" box type "banana", then type the numbers by hand and press Add.',
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
      'Open Recipes and press + New, then Add a food by hand.',
      'Save it with only a name; then add 250 kcal and 20 g protein and save.',
      'Find it under the Foods tab, open it and press Ate this.',
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
    id: 'S-22', feature: 'Recipe nutrition', title: 'Meal tags from the recipe form', persona: 'recipe-collector', brief: 'recipe-nutrition-badges',
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
      'Press Add missing to Shopping.',
    ],
    expected: [
      'Water shows as Have with the note "Always at home" and is included in "Have x of y"; the Have, Missing and On your list marks line up in one column down the page.',
      'Add missing does not add water to the grocery list.',
    ],
  },
  {
    id: 'S-29', feature: 'Recipe auto-match', title: 'Maybe matches and Accept all', persona: 'recipe-collector', brief: 'recipe-auto-match', edge: true,
    steps: [
      'Open "Chicken and rice bowl" (ingredient "Chicken breast") while Inventory holds a "Chicken thighs" item.',
      'Choose the item from the "Maybe: <item>" dropdown, then undo the pin by hand.',
      'Open another recipe with several Maybe lines and press Accept all suggestions.',
    ],
    expected: [
      'A close but inexact name shows "Maybe: <item>" as a dropdown choice and is not counted as a match until chosen.',
      'Choosing it pins it; Accept all pins every suggestion in one action and the button disappears when none are left.',
      'Press Reset on the account first: anything added to the grocery list since the seed changes which recipes show Maybe. The seeded names decide which recipes show Maybe; if none does, record that and add an Inventory item with a shared word.',
    ],
  },

  // ---- Share target ----
  {
    id: 'S-30', feature: 'Share target', title: 'Share a YouTube link to an exercise', persona: 'superset-builder', brief: 'share-target', device: true,
    steps: [
      'On an Android phone with Loadbearer installed, open a YouTube video and choose Share, then Loadbearer.',
      'In the "Save this link" sheet pick an exercise and confirm.',
      'Share a different link to the same exercise.',
      'On a computer, open Chrome\'s developer tools on the QA site, Application, Manifest, and read the warnings.',
    ],
    expected: [
      'Loadbearer is listed in the share sheet and opens "Save this link" over the board.',
      'The link is saved as the exercise\'s video and shows on its card; a different link first asks "Replace the link on <exercise>?"',
      'The Manifest page shows no warning about the share target\'s enctype, and sharing a link still works as above.',
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
      'Open Program, then Exercises (`#/program/exercises`), at 1920 px and at 1024 px. The heading reads "Exercises" and the search box "Search 46 exercises" (the account\'s two programs use 46; if it says 0, press Reset on the account).',
      'Use Search and an Equipment chip at 1920 px.',
    ],
    expected: [
      'From 1280 px the exercise rows sit in two columns and the filters share one full-width row.',
      'At 1024 px it is one column, at most 760 px wide.',
    ],
  },
  {
    id: 'S-40', feature: 'Wide layouts', title: 'Nutrition as seven day columns, one day with a stepper below 1280 px', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'Open Daily, Nutrition at 1920 px and at 1279 px.',
    ],
    expected: [
      'From 1280 px the week is seven day columns side by side, each with its meters, meals with their eaten food, Supplements and Hydration; below it one day shows with the day stepper (Previous day, Day to show, Next day). The old Diet, Supplements, Water and Last 7 days panels are gone.',
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
      'On the Accounts page find the New user test account (its masked email is n***@qa.invalid) and press Suspend, then press Press again to suspend.',
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
      'Signed in as your own admin account, open Settings, Open accounts, and suspend the Recipe collector test account (its masked email is r***@qa.invalid).',
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
      'On the Accounts page look at the New user row (n***@qa.invalid) while it is active, then at your own admin row.',
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
      'On a phone. On Recipes press + New, then Add a food by hand, then Scan label (opens the camera) and photograph a nutrition-facts label (frozen gnocchi, cereal, a can); on a second food press Pick from photos and pick a saved photo of a label.',
      'Compare the filled calories, protein, carbs and fat with the printed per-serving column and fix anything that differs.',
      'Press Save food, open it, and use Ate this with 1.5 portions.',
    ],
    expected: [
      'The form fills in a few seconds with the name, per-serving numbers and a Note like "1 serving = 2/3 cup (55 g). About 6 servings per pack." and says to check the numbers; nothing is saved yet.',
      'After Save food the food is in the Foods list; Ate this logs 1.5 times the calories and protein to today.',
    ],
  },
  {
    id: 'S-50', feature: 'Label scan', title: 'A blurry photo or a label with per 100 g only', persona: 'diet-fresh', brief: 'label-photo-scan', edge: true, device: true,
    steps: [
      'On a phone, press Scan label and photograph something that is not a label (a table), then a label that only shows a per 100 g column if you have one.',
      'Check that every account (not only an admin) sees Scan label and Choose photo on the New food form.',
    ],
    expected: [
      'The form stays empty and says "Could not read the numbers. Try a closer, flatter photo or type them in." (or "That label only shows numbers per 100 g, so nothing was filled in. Type the numbers for one serving."); you can still type the numbers and save.',
      'Every account sees Scan label and Choose photo.',
    ],
  },
  // ---- Whole pack ----
  {
    id: 'S-51', feature: 'Whole pack', title: 'Log a whole pack of a ready-made food', persona: 'diet-on-target', brief: 'whole-pack',
    steps: [
      'On Recipes press + New, then Add a food by hand, type a name, 210 calories and 6 protein, set Servings per pack to 12 and press Save food.',
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
      'On the New food form fill the name and numbers and type 2.5 in Servings per pack, then press Save food.',
      'Change it to 8, save, then edit the food and clear the box.',
    ],
    expected: [
      'It says "Servings per pack must be a whole number from 1 to 99." and saves nothing.',
      'With 8 the page shows "8 servings per pack"; after clearing the box the line and the Whole pack button are gone.',
    ],
  },
  // ---- Receipt scan ----
  {
    id: 'S-53', feature: 'Receipt scan', title: 'Scan a Costco receipt and apply it', persona: 'grocery-shopper', brief: 'receipt-scan', device: true,
    steps: [
      'On a phone, with items like the ones on your receipt. On Groceries, Shopping, press Scan receipt and photograph a Costco receipt.',
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
      'On a phone, press Scan receipt and photograph something that is not a receipt, or half of one.',
      'Scan a real receipt again with the bottom cut off, so a line is missing, and look at the Total check.',
    ],
    expected: [
      'A photo that is not a receipt says it could not read it and changes nothing on the list.',
      'A cut-off receipt shows the missing amount in the Total check but still lets you Apply.',
    ],
  },
  // ---- Usual amount ----
  {
    id: 'S-55', feature: 'Usual amount', title: 'Log 4 eggs in two taps', persona: 'diet-on-target', brief: 'usual-amount-and-unit',
    steps: [
      'On Recipes press + New, then Add a food by hand, name it Egg (large), type 72 calories and 6 protein, set Usual amount to 4 and One serving is called to egg, and press Save food.',
      'Look at the food\'s page: the Usual line, the Per line and the stepper. Press More once, then Less once.',
      'Press Ate this, look at today\'s eaten rows on Nutrition, then press Undo.',
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
      'On a phone, scan a Costco receipt that has a line your list does not have (for example a soda).',
      'On that line press Add to list. Check the name, store, count and price the form filled in, then press Add item.',
      'Look at the row and the footer, then press Apply and open the Shopping list and Bought this month. Then press Undo.',
    ],
    expected: [
      'The form starts with the receipt text tidied (Zevia soda 12pk), the receipt\'s store (or Anywhere), the count and the price after any savings; Add item marks the row New and the footer says 1 new item will be added, with nothing yet on the list.',
      'Apply adds the item under that store, ticked bought with the receipt price; Undo removes it again along with the other prices and ticks.',
    ],
  },
  {
    id: 'S-58', feature: 'Receipt scan', title: 'Close, remove or repeat a new item', persona: 'grocery-shopper', brief: 'receipt-add-item', edge: true, device: true,
    steps: [
      'On a phone, on the receipt sheet press Add to list on a line, then Not now. Add it again, press Remove on the row, add it again and press Close at the top of the sheet.',
      'Press Add to list on a line and type the name of an item that is already in that store (such as Eggs 1), then press Add item. Empty the name and press Add item.',
    ],
    expected: [
      'Not now, Remove and Close each leave the list exactly as it was.',
      'A name already in that store says it is already in the list and to pick it instead; an empty name says to give the item a name; neither adds anything to the row.',
    ],
  },
  // ---- Receipt photos ----
  {
    id: 'S-59', feature: 'Receipt photos', title: 'Keep a receipt photo, then open, note, download and delete it', persona: 'grocery-shopper', brief: 'receipt-save-photo', device: true,
    steps: [
      'On a phone, scan a Costco receipt. In the sheet, tick Keep a copy of this photo and press Apply.',
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
      'On a phone, scan a receipt and press Apply with the box unticked; then scan another, tick the box and press Close. Open Saved receipts.',
      'Scan a receipt, tick the box, turn on airplane mode and press Apply; turn it off and press Try again.',
    ],
    expected: [
      'Neither the unticked Apply nor the cancelled one leaves a receipt on the Saved receipts page, which says "No saved receipts yet" when it is empty.',
      'Offline, the prices still apply and the notice says the photo was not saved, with Try again; Try again saves it once. Opening a saved receipt and closing it, or pressing Retry, before the photo has loaded never shows that photo on the wrong sheet. (At 200 receipts or 60 MB the notice says to delete some in Receipts.)',
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
      'Open Program, Exercises and press Edit on Kneeling Cable Ab Crunch (the heavy logger logged it twice in a row at 100 lb, every set done). Its card is on Day 2 of the Board.',
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
      'In Program, Exercises, Edit an exercise and type 60 in the Weight step box; then try 0, 2.3 and abc.',
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
      'Tap Day 2, then open the Filter panel. Pick Changed in the Show rows dropdown (its options carry counts, for example Any difference (5)), then pick a phase in the Phase dropdown (it lists only phases present, plus No phase, and hides when there is none).',
      'Choose a saved program (save a copy of A first if the list is empty) as the second program.',
    ],
    expected: [
      'One list appears under each program\'s phase mix, with the day buttons showing how many exercises differ; each exercise is one row with both programs\' lines (side by side on a wide screen, the second under the first on a phone), tagged Same, Changed, Phase differs or Only in that program, with the editor\'s name, phase, weight and sets; where the two differ, the weight and sets are marked on both sides.',
      'Each filter hides the other rows and the numbers on the chips stay the same; nothing on the page can be dragged or edited, and Program A and B are unchanged afterwards.',
      'A saved copy of A against A shows no differences; choosing the same program on both sides says "Both sides are the same program."',
    ],
  },
  {
    id: 'S-67', feature: 'Program compare', title: 'An empty day, and a day that exists on one side only', persona: 'superset-builder', brief: 'program-compare', edge: true,
    steps: [
      'On a phone (or a 375 px wide window), as a new account, create a program, open Program, Compare programs, and pick it against Program A.',
      'Step through the day buttons.',
    ],
    expected: [
      'A day empty on both sides says "Nothing on this day in either program."; a day with exercises on one side lists them all as Only in that program, with "Not in this program" on the other side.',
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
      'The launch splash (the app icon) is on a dark background in every mode. An installed app may need to be removed and added again before it takes the new colour.',
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
      'Open "Chicken and rice bowl" and note an ingredient shown as Missing that has an item on Groceries, Shopping (add one with the ingredient\'s name if there is none).',
      'Look at that line, then press Add missing to Shopping.',
      'Open Groceries, Shopping and check how many times the item appears.',
    ],
    expected: [
      'The line shows Missing with a small "On your list" mark beside it; an ingredient that is at home, skipped or "Always at home" (water) never shows it.',
      'Add missing does not add that item a second time; it stays on the list once.',
    ],
  },
  // ---- Program on phones ----
  {
    id: 'S-72', feature: 'Program on phones', title: 'The header card has the A and B switch and no Create button; + New program floats above the tab bar', persona: 'new-user', brief: 'program-tab-clarity',
    steps: [
      'On a phone (or a 375 px wide window), open the Program tab.',
      'Look at the card under the three section buttons, and at the bottom right corner.',
    ],
    expected: [
      'The card says "You are editing" and the program name, with the switch showing only Program A and Program B (no other labels), and it does not scroll sideways.',
      'There is no Create a program button in the card; a gold + New program pill floats at the bottom right above the tab bar.',
    ],
  },
  // ---- Stale page guard ----
  {
    id: 'S-73', feature: 'Stale page guard', title: 'Erase or delete is refused from a page for another account', persona: 'new-user', brief: 'x-expected-user-409',
    steps: [
      'In one browser tab sign in as New user and open Settings. Leave it open.',
      'In a second tab of the same browser, switch to another test account (the QA picker).',
      'Back in the first tab, open Delete my data and press Erase everything in my account, and confirm.',
      'Repeat steps 1 to 3 from the start, pressing Delete my account instead.',
    ],
    expected: [
      'The request is refused: the Delete my data panel stays with a note that this is not available right now and nothing was erased (a card saying the device holds data from another account may show for a moment first); neither account loses anything. The same happens for Delete my account.',
      'After reloading the first tab it shows the account you are now signed in as, and the other test account\'s data is untouched.',
    ],
  },
  // ---- Barcode scan ----
  {
    id: 'S-74', feature: 'Barcode scan', title: 'Scan a packaged food\'s barcode into a ready-made food', persona: 'diet-on-target', brief: 'barcode-scan', device: true,
    steps: [
      'On a phone, sign in with any account (barcode scan is open to everyone). On Recipes press + New, then Add a food by hand, then Scan to fill form and allow the camera.',
      'Point the camera at the barcode of a packaged US food (cereal, a can, frozen gnocchi) until the sheet closes by itself.',
      'Check the picked product and its grams (its own serving), press Use, then compare the calories and protein with the printed label and press Save food.',
      'Repeat on the diet day: open Nutrition, press Add food, Find food and Scan to fill form, and scan a second product.',
    ],
    expected: [
      'The sheet reads the code within a few seconds, closes, and shows the product name (with brand) and its calories per 100 g; the grams start at the product\'s serving.',
      'Use fills the name, calories and protein (carbs and fat when USDA has them) for that serving; they match the label, and nothing is saved until Save food.',
      'The camera light goes off when the sheet closes. On the diet day the sheet comes back on Find food with the product picked, and Use fills the One-off food form the same way.',
    ],
  },
  {
    id: 'S-75', feature: 'Barcode scan', title: 'A code that is not found, and no camera (retired 2026-11-13: needs a real camera, which the QA pane cannot supply; the miss ladder is covered by e2e/barcodeMissLadder.spec.js)', persona: 'diet-fresh', brief: 'barcode-scan', retired: true, edge: true,
    steps: [
      'Open + New, then Add a food by hand, press Scan to fill form and scan something that is not in USDA (a book\'s barcode, a store-brand item, a local product).',
      'Close the sheet. In your browser settings block the camera for the site, press Scan to fill form again, and press Photo instead with a saved photo of a barcode (or of a table).',
    ],
    expected: [
      'The sheet says "That barcode is not in USDA or Open Food Facts." with a Tried list (USDA: not found, Open Food Facts: not found), makes Type the name the main choice and offers Photo the label; scanning stops (no repeated lookups) and Close leaves the form empty and usable.',
      'With the camera blocked the sheet says "The camera is not available. Choose a photo of the barcode instead." and offers Photo instead; a photo with a readable barcode works, a table photo says it could not read one.',
    ],
  },
  {
    id: 'S-76', feature: 'Custom 404', title: 'A wrong page address shows the Page not found page', persona: 'new-user', brief: 'custom-404',
    steps: [
      'In a browser, signed out, open the app address followed by /zzz (for example qa.loadbearer.app/zzz).',
      'Tap Go to Loadbearer. Then sign in and open /zzz again.',
    ],
    expected: [
      'A plain Page not found page with the line "That address does not exist." appears, light or dark to match the device, and it does not repeat the address you typed.',
      'Go to Loadbearer opens the landing page when signed out and the app when signed in. The page looks the same signed in and out.',
    ],
  },
  {
    id: 'S-77', feature: 'Custom 404', title: 'An installed app still opens, and a wrong address reaches the 404 page', persona: 'new-user', brief: 'custom-404', device: true, edge: true,
    steps: [
      'On a phone with the app installed and opened at least once, open the browser and type the app address followed by /zzz.',
      'Open the installed app from the home screen, then turn on airplane mode and open it again.',
    ],
    expected: [
      'The first step shows the Page not found page, not the app.',
      'The installed app opens normally, online and offline, on its home screen address and on /plans.',
    ],
  },
  {
    id: 'S-78', feature: 'Custom 404', title: 'Real pages, files and in-app addresses are not affected', persona: 'new-user', brief: 'custom-404', edge: true,
    steps: [
      'Open /plans, /delete-account and /privacy.html.',
      'Open /assets/old.js, and then the app with #/progress/zzz after the address.',
    ],
    expected: [
      'The first three open as they did before. /privacy without .html shows Page not found on a first visit; in a browser where the app\'s service worker is already active the Privacy Policy may still open.',
      '/assets/old.js shows a small plain 404 error, not the Loadbearer page. #/progress/zzz opens Progress.',
    ],
  },
  // ---- Receipt store ----
  {
    id: 'S-79', feature: 'Receipt store', title: 'A scanned receipt marks the items as bought at its store', persona: 'grocery-shopper', brief: 'receipt-bought-at', device: true,
    steps: [
      'On a phone (Grocery shopper has Costco, Trader Joe\'s, Farmers market and Corner shop). On Groceries, Inventory, make sure a few items you also bought on your receipt are listed under other stores or Anywhere (add them with Edit if needed).',
      'On Shopping press Scan receipt and photograph a Costco receipt (or choose a saved photo of one; any store that is on your list works).',
      'In the sheet read the rows and the line under the list, then press Apply.',
      'Open Shopping and Inventory, then press Undo on the notice.',
    ],
    expected: [
      'Every ticked item that is not already at the receipt\'s store says "Bought at Costco (usually ...)" and a line says how many items will be marked bought at Costco this month; nothing is saved before Apply.',
      'After Apply Shopping shows those items under Costco, ticked and priced, the store\'s bill and tax follow, and Inventory still lists each item under its old store.',
      'Undo puts every item back to its old store and unticks it.',
    ],
  },
  {
    id: 'S-80', feature: 'Receipt store', title: 'Make the receipt\'s store the usual store, and a name already there is refused', persona: 'grocery-shopper', brief: 'receipt-bought-at', edge: true,
    steps: [
      'As an admin, add an item named Oats to Costco on Inventory (Edit), and make sure another item named Oats is under Trader Joe\'s.',
      'Scan a Costco receipt that has an oats line matched to the Trader Joe\'s Oats, and a second item matched to something under another store.',
      'In the sheet read the line under the Also make Costco box (it starts unticked because the items already have usual stores), then tick "Also make Costco the usual store for these items" and press Apply.',
      'Look at the notice and Inventory, then press Undo.',
      'Scan a Costco receipt where every matched item is under Anywhere on Inventory (no usual store). Read the box and the line under it before pressing Apply.',
    ],
    expected: [
      'The second item moves to Costco on Inventory; the Trader Joe\'s Oats stays under Trader Joe\'s (an Oats is already at Costco) but is still bought at Costco this month, and the notice says "except Oats" with the reason.',
      'Undo restores the usual store of the item that moved, and both lines go back to unticked.',
      'Before you tick the box the line reads "Inventory stays as it is. Tick the box to list these under Costco there."; ticked, it reads "Inventory will list these under Costco."',
      'When every item that moves is under Anywhere, "Also make Costco the usual store for these items" starts ticked and the line reads "Inventory will list these under Costco."; when any of them already has a usual store it starts unticked.',
    ],
  },
  {
    id: 'S-81', feature: 'Receipt store', title: 'A store that is not on the list, and moving between sharing groups', persona: 'grocery-shopper', brief: 'receipt-bought-at', edge: true,
    steps: [
      'As an admin scan a receipt from a store that is not on your list (for example Walmart).',
      'Check the sheet: no row says Bought at, and "Store for this receipt" is set to Do not set the store or the tax. Pick Costco in it.',
      'Close the sheet. On Inventory > Edit > Sharing, make a group that splits with one person and give it Costco only; scan the receipt again with Costco picked and look under the list.',
    ],
    expected: [
      'With no store picked nothing moves and no row says Bought at; picking Costco adds the Bought at notes and the "will be marked bought at Costco" line.',
      'When the items\' old store has no sharing group and Costco has one, a warning says moving them changes who shares them; items with a split of their own are not counted in it.',
    ],
  },
  {
    id: 'S-82', feature: 'Receipt merge', title: 'The same item twice on a receipt is one row', persona: 'grocery-shopper', brief: 'receipt-merge-lines', device: true,
    steps: [
      'As an admin, on your phone, photograph and scan a Costco receipt where the same item (for example eggs) is printed on two lines with the same price.',
      'In the sheet find that item. Tick it, pick the matching item from the list, and press Apply.',
      'On Shopping look at the item, then press Undo.',
    ],
    expected: [
      'The sheet shows ONE row for the two lines, with one checkbox, one item picker, a count of 2 and "$X each" under the price; the total check and the Apply count are unchanged by the merge.',
      'After Apply the item is ticked bought with a count of 2 at that price; Undo puts it back.',
    ],
  },
  {
    id: 'S-83', feature: 'Receipt merge', title: 'Two packs at different prices stay one item with both prices', persona: 'grocery-shopper', brief: 'receipt-merge-lines', device: true, edge: true,
    steps: [
      'As an admin, on your phone, photograph and scan a receipt that has the same meat (for example chuck roast) on two lines at different prices, such as $14.12 and $17.86, with no match on your list.',
      'Press Add to list once on the merged row and check the count and price in the form, then Add item and Apply.',
      'Look at Inventory and at the month on Shopping, then press Undo.',
    ],
    expected: [
      'One row with a note "2 packs, each at its own price: $14.12 + $17.86"; the form starts with Count 2 and the average price, both editable.',
      'Inventory gets ONE item (not two); the month shows both packs at their own prices and the bill matches the receipt; Undo removes the item and the month line.',
    ],
  },
  {
    id: 'S-84', feature: 'Receipt merge', title: 'Show these lines separately', persona: 'grocery-shopper', brief: 'receipt-merge-lines', edge: true,
    steps: [
      'As an admin, scan a receipt with the same item on two lines (no match on your list).',
      'On the merged row press "Show these lines separately".',
      'Press Add to list on the first row and add it, then press Add to list on the second row with the same name and press Add item.',
    ],
    expected: [
      'The row splits into its original rows (nothing is saved yet) and the link goes away.',
      'The second add is refused with "That item is already in this store\u2019s list. Pick it in the list instead.", as it always was; picking the first row\u2019s new item in the second row\u2019s picker joins them.',
    ],
  },
  // ---- Bulk share ----
  {
    id: 'S-85', feature: 'Bulk share', title: 'Select all in Costco, share with one person, and Undo', persona: 'grocery-shopper', brief: 'grocery-bulk-share',
    steps: [
      'Sign in as Grocery shopper (it has a sharing group, Home with Sam and Alex, that Costco splits with). Open Groceries, Shopping.',
      'Press Select items. A checkbox appears on each row, each store heading says "Select all in ...", and a bar at the bottom says "0 selected".',
      'Press "Select all in Costco", then Change who shares In the sheet tick Sam only and press Apply.',
      'Look at the Costco rows and the notice, then press Undo within about 10 seconds (the notice goes away by itself).',
    ],
    expected: [
      'Nothing changes until Apply; the bar counts the Costco items and Change who shares is off while nothing is selected.',
      'Every Costco row now says "Me +1" (it said "Me +2" before), the notice reads "Shared N items: Me +1.", Select mode is off and focus is on the Select items button.',
      'Undo puts every row back to "Me +2".',
    ],
  },
  {
    id: 'S-86', feature: 'Bulk share', title: 'The usual-split box changes Inventory, and this month only is the default', persona: 'grocery-shopper', brief: 'grocery-bulk-share',
    steps: [
      'On Shopping, press Select items and tick two Costco items and press Change who shares Tick Alex only and press Apply (leave "Also make this the usual split" unticked).',
      'Open Inventory, Edit, and open one of those items\' sharing chip. Then Undo is not needed: go back to Shopping, press Select items, pick the same two items, tick Sam only, tick "Also make this the usual split for these items" and press Apply.',
      'Open Inventory again and look at the same items\' split.',
    ],
    expected: [
      'After the first Apply Shopping shows the new split but Inventory still shows the store\'s split for those items (this month only).',
      'After the second Apply Inventory shows Sam as the items\' usual split, and the notice\'s Undo restores both the rows and the usual split.',
    ],
  },
  {
    id: 'S-87', feature: 'Bulk share', title: 'A pack-priced item takes the split on every pack, and no group means no Select items', persona: 'grocery-shopper', brief: 'grocery-bulk-share', edge: true,
    steps: [
      'On Shopping open a Costco item, give it two pack prices (Add price) and give pack 1 its own split (Sam only). Close it.',
      'Press Select items, tick that item and one other, press Change who shares, and read the sheet. Tick Alex and press Apply.',
      'Open the pack-priced item and look at both packs; press Undo on the notice within about 10 seconds (it goes away by itself).',
      'Sign in as Recipe collector (30 grocery items and no sharing group; any account that has grocery items but no sharing group will do) and open Groceries, Shopping. New user does not prove it, because its list is empty.',
    ],
    expected: [
      'The sheet says "1 picked item is priced pack by pack: every pack gets this split."',
      'After Apply both packs show Alex\'s split (pack 1\'s own split is gone); Undo brings back pack 1\'s Sam-only split.',
      'An account that has items but no sharing group has no Select items button on Shopping.',
    ],
  },
  {
    id: 'S-88', feature: 'Barcode scan', title: 'A store-brand frozen food (Aldi, Trader Joe\'s) is found in Open Food Facts', persona: 'diet-on-target', brief: 'barcode-coverage', device: true,
    steps: [
      'On a phone. On Recipes press + New, then Add a food by hand, then Scan to fill form and point the camera at an Aldi or Trader Joe\'s frozen food (the ones USDA did not know in S-74).',
      'When the sheet closes, read the product name, its calories per 100 g and the line under it.',
      'Press Use, compare the calories, protein, carbs and fat with the printed label, and press Save food only if you want it.',
      'Scan a product USDA does know (oatmeal) and read the same place.',
    ],
    expected: [
      'The product is found; under it the line "Data from Open Food Facts. Crowd-sourced: check the numbers against the label." shows, and the grams start at the product\'s serving when it has one.',
      'Use fills the form with that serving\'s numbers (editable); nothing is saved until Save food. A number that disagrees with the label is yours to correct before saving.',
      'The USDA product shows no Open Food Facts line.',
    ],
  },
  {
    id: 'S-89', feature: 'Barcode scan', title: 'A code in neither database offers a photo of the label', persona: 'diet-fresh', brief: 'barcode-coverage', device: true, edge: true,
    steps: [
      'On a phone, open + New, then Add a food by hand, press Scan to fill form and scan something neither source knows (a book, a local product with no entry).',
      'Read the sheet, then press Photo the label.',
      'Take a photo of the product\'s nutrition label and check the form fills; close without saving.',
    ],
    expected: [
      'The sheet lists USDA and Open Food Facts as not found, with Type the name as the main button and Photo the label second (see S-93).',
      'Photo the label closes the sheet and opens the same camera as Scan label; the photo fills the form like any label scan.',
      'Nothing is saved until Save food.',
    ],
  },
  {
    id: 'S-90', feature: 'Receipt reconcile', title: 'Tick items in the store, scan the receipt at home, and see Was and Now', persona: 'grocery-shopper', brief: 'receipt-reconcile-ticked', device: true,
    steps: [
      'On a phone. On Groceries, Shopping, tick three items as if you were in the store without typing a price (or with an old one).',
      'Later, press Scan receipt and photograph a receipt that has those three items, and read the note under each of their rows.',
      'Press Apply and look at the three items; then press Undo.',
    ],
    expected: [
      'Each ticked item\'s row says what the list had and what the receipt says ("Was no price, now 1 × $8.99"), with a label: Price added, Price changed, Count changed or Matches the list; an item you did not tick has no note.',
      'Apply gives the three items the receipt\'s price and count, and the item that had no price now has one; Undo puts the old price, count and "no price" back.',
    ],
  },
  {
    id: 'S-91', feature: 'Receipt reconcile', title: 'An item marked bought that is not on the receipt is listed, stays bought, or moves back to to-get', persona: 'grocery-shopper', brief: 'receipt-reconcile-ticked', edge: true, device: true,
    steps: [
      'On a phone, on Shopping, tick an item you will not put on the receipt (say Milk, with a price) and two that are on it. Scan the receipt.',
      'Find "Already bought, not on this receipt" under the lines, press "Review these" and read the row for Milk. Press Apply without touching it and look at Milk.',
      'Scan again, open the list, tick "Move back" on Milk, and read the footer; press Apply, look at Milk, then press Undo.',
      'Scan a receipt that has none of your ticked items.',
    ],
    expected: [
      'Milk is listed with what it holds now ("Bought: 1 × $3.79"); applying leaves Milk ticked with its price.',
      'With the box ticked, the row says "Will move back to Shopping", the footer says "1 will move back to Shopping.", Apply puts Milk back on Shopping with the notice "1 item moved back to Shopping.", and Undo ticks it again with its price.',
      'When nothing on the receipt matches your list, the text above the list starts with "None of the items on your list match this receipt. Is this the right one?"',
    ],
  },
  {
    id: 'S-92', feature: 'Receipt reconcile', title: 'The receipt has a different count than you ticked', persona: 'grocery-shopper', brief: 'receipt-reconcile-ticked', edge: true, device: true,
    steps: [
      'On a phone, tick one item with a count of 1 and a price. Scan a receipt where that item is bought twice (a count of 2 at the same unit price).',
      'Read the note under its row, then press Apply and open the item.',
    ],
    expected: [
      'The note says "Count changed" with "Was 1 × $4.49, now 2 × $4.49".',
      'After Apply the item shows a count of 2 at $4.49; the receipt\'s count wins over the one you ticked with.',
    ],
  },
  {
    id: 'S-93', feature: 'Barcode scan', title: 'A missed scan makes typing the name the main choice and offers the AI label photo second', persona: 'diet-fresh', brief: 'barcode-miss-ladder', device: true,
    steps: [
      'On a phone, open Daily, Nutrition, press Add food, Find food and Scan to fill form; scan a code neither source knows. Watch the line while it looks.',
      'Read the sheet: the steps tried, the main button, the button under it and the small note under that.',
      'Press Type the name and see where the cursor is. Scan the code again and press Photo the label.',
      'Photograph a nutrition label and read the result before pressing Use; then press Use.',
    ],
    expected: [
      'While looking the line says Checking USDA... and then Checking Open Food Facts...',
      'After a miss the sheet lists USDA: not found and Open Food Facts: not found, with Type the name as the main button, Photo the label second with "Uses AI" under it, and Scan again, Photo of the barcode and Close as plain links.',
      'Type the name closes the camera sheet and puts the cursor in the Search your past meals and recipes box on Find food; no AI call was made.',
      'Photo the label closes the sheet and opens the camera at once with no confirm step; the result shows an AI mark and "Read from the photo. Check these numbers against the label." before Use, and Use fills the One-off food form.',
    ],
  },
  {
    id: 'S-94', feature: 'Barcode scan', title: 'The label count shows after a read, and a used-up day switches the label button off', persona: 'diet-fresh', brief: 'barcode-miss-ladder', edge: true,
    steps: [
      'As an admin, miss a scan and read the note under Photo the label; read a label; then miss another scan and read the note again.',
      'When the daily label cap is used up (a test server with SCAN_DAILY_MAX set to 1 is the quick way), miss a scan again and try the buttons.',
    ],
    expected: [
      'Before any label has been read in this session the note says only "Uses AI"; after one it says how many are left today, for example "Uses AI · 29 of 30 left today". The count is shared by the whole server, not by you.',
      'With none left, Photo the label is switched off with "Label photos are used up for today. Type the name instead."; Type the name still works.',
    ],
  },
  {
    id: 'S-95', feature: 'Sharing done', title: 'Done closes the Sharing panel and adds what you typed', persona: 'grocery-shopper', brief: 'sharing-done-button',
    steps: [
      'Open Daily, Groceries, Inventory, press Sharing groups and look at the bottom of the panel.',
      'In the Home group type Jo in Add a person without pressing Add person, then press Done.',
      'Press Sharing again and look at the Home group.',
    ],
    expected: [
      'A Done button sits at the bottom of the panel. Pressing it closes the panel, a note says "Sharing saved." under the buttons, and focus is back on the Sharing button.',
      'Jo is in the Home group, added by Done; the note is gone while the panel is open again.',
    ],
  },
  {
    id: 'S-96', feature: 'Sharing done', title: 'Text that cannot be added keeps the panel open', persona: 'grocery-shopper', brief: 'sharing-done-button', edge: true,
    steps: [
      'Open the Sharing panel, type Sam in Add a person in the Home group (Sam is already there) and press Done.',
      'Clear the box and press Done.',
    ],
    expected: [
      'The panel stays open and the Home group says "That person is already in this group."; no "Sharing saved." note appears.',
      'With the box empty, Done closes the panel and says "Sharing saved.".',
    ],
  },
  {
    id: 'S-97', feature: 'Security headers', title: 'The barcode scanner\'s live camera opens on a phone', persona: 'diet-fresh', brief: 'camera-and-headers', device: true,
    steps: [
      'On a phone, open Daily, Nutrition and press Scan and log in the toolbar.',
      'When the browser asks to use the camera, allow it. Read the line under the camera view.',
      'Scan any product barcode, then close the sheet and reopen it.',
    ],
    expected: [
      'The sheet says "Starting the camera..." and then shows the live camera view with "Point the camera at the barcode."; it does not drop to the photo-of-the-barcode choice because the site blocked the camera.',
      'A scanned code is looked up; closing the sheet switches the camera off (the browser\'s camera light goes out), and reopening starts it again.',
    ],
  },
  {
    id: 'S-98', feature: 'Security headers', title: 'Every tab and the plain pages render styled with no security errors in the console', persona: 'diet-fresh', brief: 'camera-and-headers', edge: true,
    steps: [
      'On a computer, open the QA site in Chrome with developer tools open on the Console tab, and sign in.',
      'Open each tab in turn (Daily, Progress, Program, Settings) and open one sheet on each.',
      'Open /privacy, /terms and an address that does not exist, such as /nothing-here, one after another.',
    ],
    expected: [
      'Every screen is styled as normal (colours, fonts and layout, not bare text).',
      'The Console shows no red errors that mention Content Security Policy, Permissions Policy or "Refused to".',
      'The privacy and terms pages and the "Page not found" page are styled the same way and show no such errors.',
    ],
  },
  {
    id: 'S-99', feature: 'Link previews', title: 'Pasting the app address into a chat app shows a title, description and picture', persona: 'new-user', brief: 'share-preview-sitemap', device: true,
    steps: [
      'On a phone, paste the production address (https://loadbearer.app/; the QA page points its card picture and address at production, so production is the one to try) into a chat message to yourself in a chat app (Messages, WhatsApp or similar) and read the card it shows.',
      'Read the title, the description and the picture on the card.',
    ],
    expected: [
      'The card is titled "Loadbearer: a weekly training board that remembers your lifts" with the description "A weekly workout board with A/B program rotation, phase-based targets, timers and a muscle map. Works offline."',
      'A wide picture (the Loadbearer logo beside the title line) shows on the card. A chat app that cached the address earlier may show an old card; try a different app or add ?x=1 to the address.',
    ],
  },
  {
    id: 'S-100', feature: 'Link previews', title: 'The sitemap and icon files load, and the plain pages have their own titles', persona: 'new-user', brief: 'share-preview-sitemap',
    steps: [
      'In a browser, open /sitemap.xml and /favicon.ico on the QA address.',
      'Open /privacy.html, /terms.html and /delete-account and read each browser tab\'s title.',
      'Open the app itself and read its tab title and icon.',
    ],
    expected: [
      '/sitemap.xml shows an XML list of five addresses (the home page, /plans, /privacy.html, /terms.html and /delete-account), all naming loadbearer.app, the production host; /favicon.ico loads a small picture, not a "not found" page.',
      'The tabs are titled "Privacy Policy · Loadbearer", "Terms of Use · Loadbearer" and "Delete your account · Loadbearer".',
      'The app tab is titled "Loadbearer QA" on QA (plain "Loadbearer" on production) with the logo as its icon (the QA logo on QA).',
    ],
  },
  {
    id: 'S-101', feature: 'Search hiding', title: 'QA asks search engines to stay out', persona: 'new-user', brief: 'qa-noindex-robots',
    steps: [
      'In a terminal, run curl https://qa.loadbearer.app/robots.txt (or open that address in a browser) and read the answer.',
      'Open /sitemap.xml on QA and confirm the app itself still loads normally.',
    ],
    expected: [
      'robots.txt answers exactly two lines, "User-agent: *" and "Disallow: /", with no Sitemap line.',
      'The sitemap and the app still load; only crawlers are asked to stay away. The same holds on the Staging address if it is up.',
    ],
  },
  {
    id: 'S-102', feature: 'Search hiding', title: 'Production\'s robots.txt still allows search, once production has the new build', persona: 'new-user', brief: 'qa-noindex-robots', edge: true,
    steps: [
      'In a terminal, run curl https://loadbearer.app/robots.txt (or open that address in a browser) and read the answer.',
    ],
    expected: [
      'Production answers "User-agent: *", "Allow: /" and a "Sitemap: https://loadbearer.app/sitemap.xml" line. It never answers Disallow: /.',
      'Until production is deployed with PR 740, it may still answer the older file (no Sitemap line); that is expected, not a fail. A "Disallow: /" on production is a fail.',
    ],
  },
  {
    id: 'S-103', feature: 'Moved-card tag', title: 'A card moved to another day is tagged with the day it came from', persona: 'superset-builder', brief: 'moved-from-label',
    steps: [
      'Open the Board and open the ⋯ menu on a card that sits on Day 2.',
      'In Move to choose Day 4. Find the card in the Day 4 column and read its tag.',
      'Move it back to Day 2 (Day 2 shows "(planned)") and look for the tag.',
    ],
    expected: [
      'On Day 4 the card carries the tag "From Day 2".',
      'Back on its planned day the tag is gone.',
    ],
  },
  {
    id: 'S-104', feature: 'Moved-card tag', title: 'A moved card whose home day is off the board names its program day', persona: 'superset-builder', brief: 'moved-from-label', edge: true,
    steps: [
      'Superset builder has no Day 7 workout, so make one first: in Program, open Day 6, use "Copy this day to" Day 7 and press Copy.',
      'Open the ⋯ menu on a card from the Day 7 workout and move it to Day 3; its tag says "From Day 7".',
      'Tick Rest on Day 6, so every workout from Day 6 on slips one column later and the Day 7 workout\'s home column is past the end of the board (if the page asks to confirm, read it and press OK).',
      'Read the tag on the card you moved. Untick Rest on Day 6 and read it again.',
    ],
    expected: [
      'With the rest day on, the tag reads "From Day 7’s workout, off this week" (the program day, not a column number that does not exist).',
      'With the rest day off, the tag is back to "From Day 7".',
    ],
  },
  {
    id: 'S-105', feature: 'Program compare', title: 'On a phone the programs line up one over the other, and the filters fold behind a button', persona: 'superset-builder', brief: 'program-compare', edge: true,
    steps: [
      'On a phone (or a browser window 375 px wide), open Program, Compare programs. Look at the first rows.',
      'Tap Filter, then Any difference; tap Filter again. Then tap All days, the first of the Day buttons. Then open the same page in a window wider than 800 px.',
    ],
    expected: [
      'Each exercise is one row: the first program\'s line with its name in front of it, the second program\'s line right under it. The Day buttons stay in one row you can swipe sideways, and the status and phase buttons are hidden behind a Filter button.',
      'Filter opens and closes the status and phase buttons, and says "Filter · 1 on" once one is chosen; the rows keep the filter when it is folded. All days lists every day one after the other, each under its own Day heading, with the same filter applied to all of them. On the wide window the programs are two columns under their names, Filter is not shown and the buttons stay in view.',
    ],
  },
  {
    id: 'S-106', feature: 'Program compare', title: 'All days lists every day under its own heading, and the filters apply to all of them', persona: 'superset-builder', brief: 'program-compare',
    steps: [
      'On a phone, open Program, Compare programs. In the Day strip the first button is "All days"; press it.',
      'Scroll down the list. Then press Filter, choose Same, and look at the headings and at the Filter button.',
      'Press the Day 3 button, then press All days again.',
    ],
    expected: [
      'Every day that has exercises is listed one after the other under its own heading ("Day 1", "Day 2" and so on); a day with no exercises has no heading. The All days button carries a count such as "· 42 differ", the total over the days, and each exercise is still one row with Program A over Program B.',
      'With Same chosen the headings stay and only the rows that match are left (fewer rows than before); the Filter button reads "Filter · 1 on".',
      'Day 3 alone shows only that day\'s rows with no day heading; All days brings the whole list back.',
    ],
  },
  {
    id: 'S-107', feature: 'Program compare', title: 'On a wide screen Compare opens on All days in a wider panel; a narrower window starts on the current day', persona: 'superset-builder', brief: 'program-compare', edge: true,
    steps: [
      'On a computer, in a window 1000 px wide or more, open Program, then press Compare programs to open the panel. Look at which button in the Day strip is highlighted, and at how wide the panel is.',
      'Make the window narrower than 1000 px (or open the same page on a phone), reload, and open Compare programs again.',
    ],
    expected: [
      'All days is highlighted and the days are cards side by side, each with its own Day heading and three columns (name, Program A, Program B): three cards across at 1920 px, two from a window about 1360 px wide (when the panel is 1240 px or more) and one below that. The panel fills the page width, not the narrow 760 px column it used to be, and the status and phase buttons stay in view. Pressing one day shows just that day as a single card.',
      'In the narrower window the editor\'s current day (Day 1 for a fresh account) is highlighted instead, there are no day headings, and All days is still there to press.',
    ],
  },
  {
    id: 'S-108', feature: 'Ideas to try', title: 'The Board section for exercises you saw online is called Ideas to try, and adding one works as before', persona: 'superset-builder', brief: 'ideas-to-try-rename',
    steps: [
      'Open the Board, Workout, and scroll under the days. Read the heading and the button next to it.',
      'Press "+ Add idea", read the sheet\'s title, type Face Pull in Exercise, pick it from the list, add a note and press Save.',
      'On the new idea press the pencil (Edit) and read the sheet\'s title, then Cancel. Press "+ Add idea" again and add Face Pull a second time.',
      'On the idea press Add (the sheet opens with "This week only" chosen), press Day 3, and look at the card that appears on that day.',
    ],
    expected: [
      'The heading reads "Ideas to try" and the button "+ Add idea"; the word "Experiments" is nowhere on the page.',
      'The add sheet is titled "Add an exercise to try"; after Save the idea is listed under the heading with its note and an Add button.',
      'The edit sheet is titled "Edit idea". Adding Face Pull again is refused with "Face Pull is already on the Ideas to try list." and the sheet stays open.',
      'The notice reads "Added Face Pull to Day 3 this week" and the card on that day is tagged "To try"; the idea stays listed.',
    ],
  },
  {
    id: 'S-109', feature: 'Ideas to try', title: 'Stretches to try and Help use the new name, and nothing else on the page still says Experiments', persona: 'superset-builder', brief: 'ideas-to-try-rename', edge: true,
    steps: [
      'On the Board press Stretches at the top. Look for the line about trying a stretch you saw online, and at the heading under the days.',
      'Press "+ Add stretch" and read the sheet\'s title; Cancel.',
      'Go back to Workout, press Help at the top and read the Board item under "Where things are" and the "Words and abbreviations" list.',
    ],
    expected: [
      'The heading under the stretch days reads "Stretches to try" and its button "+ Add stretch"; the line reads "To try a stretch you saw online, add it under Stretches to try, below, with a link to the video."',
      'The sheet is titled "Add a stretch to try".',
      'Help says "Ideas to try sit under the days" in its Board part and has an "Ideas to try" entry among its terms; the word "Experiments" does not appear in Help. (An exported workbook still has a sheet named Experiments, on purpose, so older files import.)',
    ],
  },
  {
    id: 'S-110', feature: 'Receipt store', title: 'A store the list does not have is added from the receipt', persona: 'grocery-shopper', brief: 'receipt-add-store', device: true,
    steps: [
      'On your own admin account on a phone (the QA test accounts are not admins and have no Scan receipt button), open Groceries, Inventory, Edit and check the list does not have the store on your receipt (for example Safeway, which Grocery shopper does not have); other stores may stay.',
      'On Shopping press Scan receipt and photograph a receipt from a store (for example Safeway) that has a few items from your list.',
      'In the sheet read the box under the store line and the line under the list; do not press Apply yet.',
      'Press Apply, then open Shopping and Inventory, then press Undo on the notice.',
    ],
    expected: [
      'A ticked box says "Add this store to your stores" with a tidy name in the box (SAFEWAY #123 reads Safeway); the line under the list says how many items will be marked bought at it this month. Nothing is added before Apply.',
      'After Apply the store exists, the notice says "Added the store Safeway.", and Shopping lists the matched items under Safeway, ticked and priced.',
      'Undo removes the store again and puts the items back and unticked.',
    ],
  },
  {
    id: 'S-111', feature: 'Receipt store', title: 'Edit the new store name, or untick the box and nothing is added', persona: 'grocery-shopper', brief: 'receipt-add-store', edge: true,
    steps: [
      'On your admin account, with the receipt\'s store not on the list, scan a receipt from that store.',
      'Change the name in the box to something else, and press Apply. Press Undo.',
      'Scan again, untick "Add this store to your stores", look at the sheet, and press Apply.',
      'Add a store named like the receipt\'s (Edit, Stores), then scan once more.',
      'With the receipt\'s store still not on the list and the box ticked, scan a receipt that has a line your list does not have. On that line press Add to list, read the Store choice, add the item, then untick "Add this store to your stores" and press Apply.',
    ],
    expected: [
      'The store is added under the name you typed, and Undo removes it.',
      'With the box unticked the name box disappears, no "will be marked bought" line shows, and Apply adds no store.',
      'When the list already has the store there is no box and the items are marked bought at it as before.',
      'The Store choice lists the new store (for example "Safeway (new)") after Anywhere and starts on it; you can still pick Anywhere or another store. Unticking the box moves the item to Anywhere, and no store is added.',
    ],
  },
  {
    id: 'S-112', feature: 'Price history', title: 'An Inventory item shows its last price and store, and the line opens its history', persona: 'grocery-shopper', brief: 'grocery-price-history',
    steps: [
      'On Shopping, tick an item bought (give it a price) under a store; do the same for another item. Open Inventory.',
      'Find the ticked item. Under its name read the small underlined line, then tap it.',
      'In the sheet read the average, the store it is most often bought at and the list of months, then press Close.',
    ],
    expected: [
      'The line reads "Last: $X at Store, Mon" with the price you gave and this month; an item never bought has no line.',
      'The sheet lists this month with its price and store; with two or more priced months the lowest is tagged Cheapest.',
      'Close puts you back on Inventory with focus on the line you tapped.',
    ],
  },
  {
    id: 'S-113', feature: 'Price history', title: 'Packs at two prices, a purchase with no price, and an item never bought', persona: 'grocery-shopper', brief: 'grocery-price-history', edge: true,
    steps: [
      'On Shopping, tick an item bought and give it two pack prices (Add price twice, for example $2.50 and $3.00). Tick another item bought and leave its price empty.',
      'On Inventory tap the Last: line of the pack item, then of the item with no price.',
      'Find an item you have never ticked bought and look under its name.',
    ],
    expected: [
      'The pack item reads "Last: $2.75 at ..." and its sheet row says "$2.50 + $3.00 (2 packs)".',
      'The item with no price reads "Last: no price at ..." and its sheet row says "No price saved" and is left out of Cheapest and the average.',
      'The item never bought has no line under it.',
    ],
  },
  // ---- Program tab clarity ----
  {
    id: 'S-114', feature: 'Program tab clarity', title: 'First visit: the guide, the header card and the section tabs (retired 2026-11-13: needs a first visit with cleared site data, which cannot be set up on a shared QA browser; covered by e2e/programTabClarity.spec.js)', persona: 'superset-builder', brief: 'program-tab-clarity', retired: true,
    steps: [
      'On a computer open the Program tab for the first time on this browser (clear the site data first if you have been here).',
      'Read the guide card at the top, then the section tabs (Programs, Exercises, Stretches, Saved, Compare) and the card under them.',
      'Press Open help, close it, then press Got it and reload the page.',
    ],
    expected: [
      'The guide has four steps; step 4 has a Send me the link button. The tabs read Programs, Exercises, Stretches, Saved and Compare, each with a one-line description. The card says "You are editing", Program A, an "On your Board" pill and "N exercises across 7 days", with the A | B switch and Create a program.',
      'Open help shows the Help sheet. Got it hides the guide, and after the reload it stays hidden.',
    ],
  },
  {
    id: 'S-115', feature: 'Program tab clarity', title: 'Rows say what they hold; a superset sits in one box; Day at a glance and its breakdown', persona: 'superset-builder', brief: 'program-tab-clarity',
    steps: [
      'On a computer open Program, Day 1.',
      'Look at a Main lift row, a superset and an either/or row, and the section labels.',
      'Look at Day at a glance, then press See the full breakdown (on a screen 1280 px or wider it starts open, so the press folds it).',
    ],
    expected: [
      'Each row shows the name, a pill (Main lift, Accessory or Optional), sets and weight and a coloured phase pill; a superset card shows a line per exercise; consecutive superset cards share one box labelled Superset. Optional, Regular and Supersets explain themselves; a section you named yourself shows as you typed it.',
      'Day at a glance shows the exercise and set counts and one sentence; the phase, muscles and equipment breakdown starts open, and See the full breakdown toggles it. The panel is only drawn from 1280 px, so a narrower screen shows no Day at a glance. Edit and the more-actions button still open their sheets.',
    ],
  },
  {
    id: 'S-116', feature: 'Program tab clarity', title: 'Saved programs: save a copy, edit it, put it on the Board', persona: 'superset-builder', brief: 'program-tab-clarity',
    steps: [
      'On Program, scroll to Saved programs and read its text.',
      'Save Program A as "Kept copy" with Save a copy, then switch the card to Program B.',
      'Press Put on Board on Kept copy, read the button, press it again.',
    ],
    expected: [
      'The panel is called Saved programs (not Program library) and says what saving and putting on the Board do.',
      'The first press changes nothing and the button asks "Tap to replace Program B"; the second makes the card say Kept copy. Edit, Archive, Delete and Compare programs still work.',
    ],
  },
  {
    id: 'S-117', feature: 'Program tab clarity', title: 'On a phone the first exercise shows on the first screen and the compact top works', persona: 'superset-builder', brief: 'program-tab-clarity',
    steps: [
      'On a phone (or a 375 x 812 window) open Program with the guide dismissed.',
      'Look at the top of the editor: + Add exercise and the two small buttons under it.',
      'Press Add a day label, type a label and press Enter. Press Copy day..., choose another day and press Copy.',
      'Press + New program.',
    ],
    expected: [
      'The first exercise row is on the first screen. + Add exercise is full width, with Add a day label and Copy day... under it.',
      'The label is saved and the field then stays; Copy shows the Copied notice. + New program opens the Create a program sheet and the pill hides while it is open.',
    ],
  },
  {
    id: 'S-118', feature: 'Program tab clarity', title: 'The pill hides while the rest timer runs; a long program name wraps', persona: 'new-user', brief: 'program-tab-clarity', edge: true,
    steps: [
      'On a phone start the Rest timer on the Board, then open Program.',
      'Stop the timer.',
      'Rename Program A to a 60 character name (Settings) and look at the header card.',
    ],
    expected: [
      'While the timer bar shows, there is no + New program pill; after Stop it comes back.',
      'The long name wraps inside the header card, the page does not scroll sideways and the A | B switch stays on screen.',
    ],
  },
  {
    id: 'S-119', feature: 'Program desktop layout', title: 'On a computer, Add exercise and Copy day sit in the day heading and the days are one row of tabs', persona: 'superset-builder', brief: 'program-tab-desktop-layout',
    steps: [
      'On a computer (a window at least 1280 px wide), open Program. Look at the day heading "Program A · Day 1" and the row under the header card.',
      'Press Copy day…, pick another day and press Copy. Then press Undo on the notice.',
      'Press a different day tab, then press + Add exercise.',
    ],
    expected: [
      'One row of tabs Day 1 to Day 7 sits under the header card, each with its exercise count (or "rest"); there is no arrow or dropdown. The Day label field is under the heading, and Copy day… and + Add exercise are normal-height buttons at the right of the heading.',
      'Copy day… opens the day picker under the Day label (the picker stays open for that day); Copy shows the Copied notice and Undo takes it back.',
      'The day tab you pressed is highlighted and the heading names that day; + Add exercise opens the same add sheet as before.',
    ],
  },
  {
    id: 'S-120', feature: 'Program desktop layout', title: 'On a computer, Saved and Compare are their own tabs with addresses', persona: 'superset-builder', brief: 'program-tab-desktop-layout', edge: true,
    steps: [
      'On a computer open Program and read the tab strip. Scroll to the bottom of Programs.',
      'Press Saved. Type a name in "Save Program A as" and press Save a copy; do it twice with different names; then type part of one name in the search box and clear it.',
      'Press Compare, then press Back, then reload the page on the Compare tab.',
    ],
    expected: [
      'The tabs read Programs, Exercises, Stretches, Saved, Compare, each with a short line under it. Programs ends after the day and its note: no Saved programs and no Compare strip below it.',
      'Saved shows the Save a copy form on top, the search and sort, and one row per program with Put on Board, Edit, Archive and Delete; the search keeps only names that contain what you typed and says "No saved program matches" when none does. The address reads #/program/saved.',
      'Compare opens full width with the two program pickers and no toggle, its address is #/program/compare, a reload stays on Compare, and Back goes to the screen before the tabs (a tab press replaces the address, so Back does not step back through Saved).',
    ],
  },
  {
    id: 'S-121', feature: 'Program desktop layout', title: 'On a phone Program keeps its three tabs and day stepper, and Compare sits above Saved programs', persona: 'superset-builder', brief: 'program-tab-desktop-layout', edge: true,
    steps: [
      'On a phone (or a window under 700 px wide) open Program and read the tab strip and the day control.',
      'Scroll to the end of Programs and read the order of the last two sections.',
      'Type #/program/saved at the end of the address and open it.',
    ],
    expected: [
      'The tabs read Programs, Exercises, Stretches. The A | B switch is two equal halves. The day control is the arrows and the "Day N of 7" dropdown, as before; there are no Day tabs and + Add exercise is full width.',
      'Compare programs (a collapsed strip) comes before Saved programs.',
      'The address opens Programs, since a phone has no Saved tab.',
    ],
  },
  // ---- Groceries views ----
  {
    id: 'S-122', feature: 'Groceries views', title: 'A tick on Shopping moves the item to Bought, and the box on Bought puts it back', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory',
    steps: [
      'Sign in as Grocery shopper and open Groceries. Read the three views; the buttons carry no counts.',
      'Tick the box of one item on Shopping. Look at the "n to get" line and the notice, then open Bought.',
      'On Bought, tick the same item\'s box. Then reload the page.',
    ],
    expected: [
      'The views read Shopping, Bought and Inventory with no counts on the buttons (Spending history is inside Bought).',
      'The item leaves Shopping, the "n to get" line goes down by one, and a notice says "Bought <item>." with Undo. Bought lists it under its store.',
      'The item is back on Shopping and the to-get count returns. After the reload the same view is open (the address names it).',
    ],
  },
  {
    id: 'S-123', feature: 'Groceries views', title: 'On Bought, select all in a store, change who shares, and Undo', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory',
    steps: [
      'Tick two Costco items on Shopping, then open Bought.',
      'Press Select items, then "Select all in Costco", then "Change who shares". In the sheet tick Sam only and press Apply.',
      'Look at the two rows and the notice, then press Undo within about 10 seconds (the notice goes away by itself).',
    ],
    expected: [
      'The bar says "2 selected" and nothing changes until Apply.',
      'Both rows say "Me +1" and the notice reads "Shared 2 items: Me +1."',
      'Undo puts both rows back to their earlier split.',
    ],
  },
  {
    id: 'S-124', feature: 'Groceries views', title: 'The old To get and At home addresses open Shopping and Inventory', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory', edge: true,
    steps: [
      'With Groceries open, replace the end of the address with #/daily/grocery/home and press Enter.',
      'Replace it with #/daily/grocery/get and press Enter.',
    ],
    expected: [
      'The first address opens Inventory (the list you tick Have on).',
      'The second opens Shopping.',
    ],
  },
  {
    id: 'S-125', feature: 'Groceries views', title: 'On a phone at large text the four views wrap and nothing scrolls sideways', persona: 'grocery-shopper', brief: 'groceries-shopping-bought-inventory', device: true, edge: true,
    steps: [
      'On a phone set the text size to its largest and open Groceries.',
      'Look at the four views, then open Inventory and look at the Sharing groups and Edit buttons.',
    ],
    expected: [
      'The four views wrap onto more than one row; every one can be tapped and the page does not scroll sideways.',
      'Sharing groups and Edit wrap under each other instead of running off the edge.',
    ],
  },
  {
    id: 'S-126', feature: 'Receipt scan', title: 'Apply the receipt with one wide button, and Close never applies', persona: 'grocery-shopper', brief: 'receipt-apply-footer', device: true,
    steps: [
      'On a phone, scan a Costco receipt whose lines add up to its total. Read the bar at the bottom and the top corner of the sheet.',
      'Press Close in the top corner. Scan again, scroll the sheet up and down with your thumb near the bottom edge, then press the wide Apply button once.',
    ],
    expected: [
      'The top corner has Close and the bottom bar has one wide button that says what it will do, such as "Apply 5 items, $40.69", with a line above it counting the items and tax; there is no Cancel beside it.',
      'Close changes nothing on the list; scrolling never applies anything; one tap on Apply applies, and the Undo notice stays for 10 seconds.',
    ],
  },
  {
    id: 'S-127', feature: 'Receipt scan', title: 'A receipt that does not add up needs a second tap to apply', persona: 'grocery-shopper', brief: 'receipt-apply-footer', edge: true, device: true,
    steps: [
      'On a phone, scan a receipt with the bottom cut off so a line is missing and the Total check says the lines differ.',
      'Press Apply anyway once, then tap somewhere else on the sheet. Press Apply anyway, then Tap again to apply anyway.',
    ],
    expected: [
      'The summary line says the lines and tax do not match the receipt total, and the button reads "Apply anyway".',
      'The first tap only changes the button to "Tap again to apply anyway" and applies nothing; tapping elsewhere puts it back; the second tap applies and Undo is offered.',
    ],
  },
  {
    id: 'S-128', feature: 'Receipt scan', title: 'The last receipt row clears the bar and the row links are easy to hit', persona: 'grocery-shopper', brief: 'receipt-apply-footer', edge: true, device: true,
    steps: [
      'On a phone, scan a long receipt with at least one line that is not on your list, and scroll to the end of the sheet.',
      'Tap Add to list on that line, add the item, then tap Remove on its row.',
    ],
    expected: [
      'The last row ends above the bottom bar with clear space, and the bar stays above the phone\'s bottom edge.',
      'Add to list and Remove are text links with room around them; each takes one tap and neither lands on the bar.',
    ],
  },
  {
    id: 'S-129', feature: 'Groceries views', title: 'Store chips filter Shopping, and All is one column with no empty blocks', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes',
    steps: [
      'Sign in as Grocery shopper and open Groceries, Shopping. Read the Store filter above the list (a dropdown: with four stores and All it is too many for chips; All and one entry per store, each with a count).',
      'Choose a store from the Store dropdown, then look at the list. Choose All.',
      'Make the window about 1900 px wide, then about 390 px wide, and look at the list each time.',
    ],
    expected: [
      'The Store dropdown reads All n, then each store with how many items are still to get.',
      'A chosen store shows only that store, with taller rows and no split tags; All shows every store, one under the other.',
      'At both widths the stores are in one column with no empty block beside a short store. At 1100 px and wider a rail on the right shows the summary and a Stores list that also picks the store.',
    ],
  },
  {
    id: 'S-130', feature: 'Groceries views', title: 'Who owes who is the first row on Bought and is gone from Shopping', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes',
    steps: [
      'Tick two Costco items on Shopping. Look for Who owes who on Shopping.',
      'Open Bought and look at the top of the page. Press the Who owes who row.',
    ],
    expected: [
      'Shopping has no Who owes who row and no money line over the list.',
      'Bought starts with a closed Who owes who row that says what is outstanding; pressing it opens the split card in place.',
    ],
  },
  {
    id: 'S-131', feature: 'Groceries views', title: 'Row details start open on a computer and closed on a phone, and the More menu choice sticks', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes', device: true, edge: true,
    steps: [
      'On a computer open Shopping and look at the rows. Then open the same page on a phone.',
      'On the phone press Show details above the list. Reload the page.',
    ],
    expected: [
      'On the computer every row shows its count, price, Move to and Shared with. On the phone every row is closed.',
      'After the choice every row on the phone is open, and it is still open after the reload (the choice is kept on that phone only).',
    ],
  },
  {
    id: 'S-132', feature: 'Groceries views', title: 'A ticked item with no price offers Add price, and Bought shows an Add price chip', persona: 'grocery-shopper', brief: 'groceries-store-chips-owes', edge: true,
    steps: [
      'On Shopping tick an item that has no price (its count says "no price").',
      'Press Add price in the notice. Then look at the item on Bought.',
    ],
    expected: [
      'The notice reads "Bought <item>. It has no price yet." with Undo, Add price and Dismiss.',
      'Add price opens Bought with that item\'s price field open. A bought item with no price shows an Add price chip in place of its count and price.',
    ],
  },
  {
    id: 'S-133', feature: 'Receipt scan', title: 'Rename a matched receipt line and apply', persona: 'grocery-shopper', brief: 'receipt-rename-memory', device: true,
    steps: [
      'On a phone, scan a receipt. Find a line that matched an item and look at its name field and the area under it.',
      'Type a different name in that line’s name field, leave the field, and look under it. Leave Remember this name ticked and press Apply.',
    ],
    expected: [
      'Every line has a name field. A match you have not touched shows no Remember tick.',
      'Remember this name appears once the name changed, ticked. After Apply the item has the new name and the notice says "Remembered 1 receipt name."; Undo puts the old name back.',
    ],
  },
  {
    id: 'S-134', feature: 'Receipt scan', title: 'Scan again and see the saved name matched', persona: 'grocery-shopper', brief: 'receipt-rename-memory', device: true,
    steps: [
      'On a phone, scan a receipt that has the same printed line text as the one you renamed.',
      'Look at that line’s item and the chip beside its name.',
    ],
    expected: [
      'The line is already set to your item, with the chip "Matched your earlier rename", whatever the scan guessed.',
      'Changing the item on that line removes the chip.',
    ],
  },
  {
    id: 'S-135', feature: 'Receipt scan', title: 'Name a line that is not on your list', persona: 'grocery-shopper', brief: 'receipt-rename-memory', device: true,
    steps: [
      'On a phone, scan a receipt with a line that matched nothing. Type a name in its name field and leave the field.',
      'Press Apply, then scan the same text again.',
    ],
    expected: [
      'The line shows New with that name and a Remember tick; Apply creates the item bought with the receipt price.',
      'The second scan sets that line to the new item with the "Matched your earlier rename" chip.',
    ],
  },
  {
    id: 'S-136', feature: 'Receipt scan', title: 'A receipt text saved for another item moves', persona: 'grocery-shopper', brief: 'receipt-rename-memory', edge: true, device: true,
    steps: [
      'On a phone, scan a receipt, pick an item that already holds a receipt name on a line with that text, choose a different item for the line, and read under the name field.',
      'Press Apply, then open the first item’s edit row in Inventory.',
    ],
    expected: [
      'A note says the text is saved for the first item and that remembering it moves it here.',
      'The text is now listed under the new item and no longer under the first.',
    ],
  },
  {
    id: 'S-137', feature: 'Receipt scan', title: 'Forget a receipt name from an item and Undo', persona: 'grocery-shopper', brief: 'receipt-rename-memory', edge: true, device: true,
    steps: [
      'On a phone, in Inventory press Edit and open an item that has receipt names (rename a receipt line to it and Apply first; the seed has none). Press Forget beside one.',
      'Press Undo in the Removed notice, then scan a receipt with that text.',
    ],
    expected: [
      'The name is gone from the list and a Removed notice with Undo appears; the Forget buttons are easy to hit.',
      'The name is back after Undo. After Forget (without Undo) a scan with that text no longer matches.',
    ],
  },
  {
    id: 'S-138', feature: 'Groceries views', title: 'Spending history is inside Bought, and the old Spending address opens it', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add',
    steps: [
      'Open Groceries. Look at the three views, then open Bought.',
      'Press Spending history, then reload the page. Then open the address ending /daily/grocery/spend.',
    ],
    expected: [
      'The views read Shopping, Bought and Inventory. Bought has This month and Spending history under its title.',
      'Spending history shows the chart, the 6 mo and 12 mo buttons and the text lines. The reload and the old address both open it.',
    ],
  },
  {
    id: 'S-139', feature: 'Groceries views', title: 'On a phone Shopping has Scan receipt, a search box and Sort, Select items, More in one row', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add', device: true,
    steps: [
      'On a phone open Shopping.',
      'Look at the buttons under the month row, then press More.',
    ],
    expected: [
      'Scan receipt and the search box are full width. Sort, Select items and More are three equal buttons in one row.',
      'More holds Pick from photos, Saved receipts and Skip the N left (Details by screen size appears there only after a details choice was made). Show details sits under the list summary, not in More. A computer keeps its own toolbar.',
    ],
  },
  {
    id: 'S-140', feature: 'Groceries views', title: 'Quick add puts an item on Shopping with an honest notice, and Undo works', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add',
    steps: [
      'On Shopping press + Add one-time item to a store, type a name and press Enter.',
      'Add another item and press Undo in the notice.',
    ],
    expected: [
      'The item shows under that store and in Inventory. The notice says it is on this month\'s list and stays in Inventory, and has no Make it every month button.',
      'Undo takes the second item away.',
    ],
  },
  {
    id: 'S-141', feature: 'Groceries views', title: 'Quick add refuses a name already in that store and an empty name', persona: 'grocery-shopper', brief: 'groceries-spending-buttons-quick-add', edge: true,
    steps: [
      'On Shopping press + Add one-time item to a store and press Enter with nothing typed.',
      'Type the name of an item already in that store and press Enter.',
    ],
    expected: [
      'A message says to give the item a name, and the field stays open.',
      'A message says the item is already in this store\'s list, and nothing is added.',
    ],
  },
  {
    id: 'S-142', feature: 'Groceries views', title: 'Bought has one Who owes who row and no money line under the month switcher', persona: 'grocery-shopper', brief: 'groceries-bought-inventory-lists',
    steps: [
      'Open Groceries, then Bought (This month). Look at what sits above the store sections, then press the Who owes who row.',
    ],
    expected: [
      'Who owes who is the first row, closed, above the month switcher. There is no line reading Paid, Your share and Owed to you under the switcher. Opening the row shows Paid, Your share and Still owed to you.',
    ],
  },
  {
    id: 'S-143', feature: 'Groceries views', title: 'Store chips filter Bought and Inventory, one column with no empty block', persona: 'grocery-shopper', brief: 'groceries-bought-inventory-lists',
    steps: [
      'On Bought press one store chip, then All. Press the Spending history switch and back to This month.',
      'Open Inventory. Press a store chip, tick a Have box inside it, then press Edit.',
    ],
    expected: [
      'A chip shows only that store; All shows every store in one column with no gap beside a short store. Spending history opens and This month comes back.',
      'Each store header reads "n items · m you have" and the count goes up with the tick. Edit shows no chips and keeps its columns; Done brings the chips back.',
    ],
  },
  {
    id: 'S-144', feature: 'Groceries views', title: 'On a wide screen the right rail lists the stores and picks the chip on Bought and Inventory', persona: 'grocery-shopper', brief: 'groceries-bought-inventory-lists', edge: true,
    steps: [
      'On a computer at 1280 px or wider open Bought, then Inventory. Press a store in the rail on each, then make the window narrower than 1100 px.',
    ],
    expected: [
      'The rail lists the stores with counts; on Inventory it also says "m of n items this month". Pressing a store picks that chip. Under 1100 px there is no rail and the chips still work.',
    ],
  },
  {
    id: 'S-145', feature: 'Groceries views', title: 'Edit on Inventory shows store chips and one list; a chip shows one store; stores fold', persona: 'grocery-shopper', brief: 'groceries-inventory-edit-list',
    steps: [
      'Open Inventory with two or more stores and press Edit. Press a store chip, then Done, then Edit again. Press a store\'s name to fold it, then press it again.',
    ],
    expected: [
      'Chips with counts show above one list of stores (no columns). A chip shows one store and stays across Done and Edit. A folded store shows only its name and count; opening it brings the rows back. There is no Sort in Edit mode.',
    ],
  },
  {
    id: 'S-146', feature: 'Groceries views', title: 'Search in Edit mode filters by name and opens folded stores', persona: 'grocery-shopper', brief: 'groceries-inventory-edit-list',
    steps: [
      'In Edit mode fold a store, then type part of one of its item names in the search box. Then type a name that matches nothing.',
    ],
    expected: [
      'The folded store opens and shows the matching row. The second search says "No items match" and the Add item, More and Done buttons stay at the bottom.',
    ],
  },
  {
    id: 'S-147', feature: 'Groceries views', title: 'Moving an item to another store under a chip switches the chip to All', persona: 'grocery-shopper', brief: 'groceries-inventory-edit-list', edge: true,
    steps: [
      'In Edit mode press one store\'s chip, open an item there and change its store to another one. On a computer 1100 px or wider look at the right side.',
    ],
    expected: [
      'The chip switches to All, the cursor stays on the item\'s Store box, and the item shows under its new store. On a wide screen the Stores panel sits in the right rail; on a narrower one it sits under the list.',
    ],
  },
  // ---- Food type ----
  {
    id: 'S-148', feature: 'Food type', title: 'Pick a Type on a new ready-made food', persona: 'diet-fresh', brief: 'food-type-and-migration',
    steps: [
      'Open Recipes and press + New, then Add a food by hand. Look at the Used as chips, press Drink, name it Goat milk kefir, type 150 calories and 8 protein, and press Save food.',
      'Open the food and press Edit.',
    ],
    expected: [
      'Used as starts on Ready to eat; Drink turns it off. The food saves with no banner about types.',
      'The form opens with Drink picked.',
    ],
  },
  {
    id: 'S-149', feature: 'Food type', title: 'Review types: suggestions, one change, Looks right, Undo', persona: 'recipe-collector', brief: 'food-type-and-migration',
    steps: [
      'Make three ready-made foods without a Type (an older account that has them; or on a test account add them in an older build): Whole milk, Eggs large, Frozen lasagna. Open Recipes.',
      'Read the banner and press Review types. Change Frozen lasagna to Drink (its Ready to eat chip turns off), then press Looks right.',
      'Press Undo on the notice.',
    ],
    expected: [
      'The banner says "3 foods need a type." The review page lists each food with its suggestion: Whole milk Drink, Eggs large Ingredient and Ready to eat together, Frozen lasagna Ready to eat. Each row shows the Used as chips.',
      'The list shows "Food types saved." and the banner is gone.',
      'The banner returns with "3 foods need a type."; Back from the review page returns to the list, and a reload on it shows the list.',
    ],
  },
  {
    id: 'S-150', feature: 'Food type', title: 'Nothing to review, and a food edited later', persona: 'diet-fresh', brief: 'food-type-and-migration', edge: true,
    steps: [
      'With no ready-made foods open Recipes. Then add one food and, from its Edit form, change its Used as from Ready to eat to Ingredient and save.',
    ],
    expected: [
      'There is no banner and no Review types button. The edited food keeps Ingredient when it is opened again.',
    ],
  },
  {
    id: 'S-151', feature: 'Recipes find', title: 'Type tabs: counts, search inside a tab, rows tagged', persona: 'recipe-collector', brief: 'recipes-find-type-tabs',
    steps: [
      'Open Recipes. Read the five tabs (All, Foods, Meals, Ingredients, Drinks) and their counts, then press Foods, Meals, Ingredients and Drinks in turn.',
      'Press All, type a word from one recipe name in the search box, then press each tab.',
      'Press Filters, pick a category chip, and read the counts again.',
    ],
    expected: [
      'Each count is the number of rows that tab shows. A recipe with two labels (for example Meal + Ingredient) is in both of its tabs, so the tab counts can add up to more than All. Every row carries a small tag naming its labels.',
      'The search narrows every tab, and the counts follow it.',
      'The counts follow the category too. A tab with nothing in it says what to do instead of showing a blank list.',
    ],
  },
  {
    id: 'S-152', feature: 'Recipes find', title: 'List beside its detail on a wide screen, a page on a phone', persona: 'recipe-collector', brief: 'recipes-find-type-tabs',
    steps: [
      'On a desktop browser 1280 px wide or more open Recipes and press three different rows.',
      'Narrow the window to a phone width (or open the app on a phone) and press a row, then press Back.',
    ],
    expected: [
      'The list stays on the left and the pressed recipe shows on the right, in place, with no Back to recipes bar.',
      'The recipe opens as its own page and Back returns to the list.',
    ],
  },
  {
    id: 'S-153', feature: 'Recipes find', title: '+ New menu and the Recent and favorites row', persona: 'recipe-collector', brief: 'recipes-find-type-tabs',
    steps: [
      'Open Recipes and press + New. Read the choices, then press Recipe or meal and go Back. Press the Library pill beside Mine, then press Mine again. Press + New, then Scan to fill a food form.',
      'After starring two recipes (S-173 walks the star), reload the page and press a starred chip above the list.',
    ],
    expected: [
      'The menu lists three rows: Recipe or meal, Scan to fill a food form and Add a food by hand (the Library is the pill beside Mine, not a menu row); each opens its own flow, and Scan to fill a food form opens the New food form with the barcode sheet on top.',
      'The chips above the list show the starred recipes first and open the one pressed.',
      'After a reload with no stars and nothing logged or opened since, the row is not shown (a recipe opened in the same visit still counts as recent).',
    ],
  },
  // ---- Nutrition quick log ----
  {
    id: 'S-154', feature: 'Nutrition quick log', title: 'Log a recent food from Quick add with the portion sheet and Undo', persona: 'recipe-collector', brief: 'nutrition-quick-log',
    steps: [
      'Open a recipe that has calories and protein, press Ate this once, then open Daily, Nutrition, press Quick add in the toolbar and look under Recent and favorites. Press the food, press Less once, then Log it, and press Undo.',
    ],
    expected: [
      'Recent and favorites lists the food. The sheet opens at the usual amount (1 portion if none is set), Less lowers it by a half and the numbers change with it. Log it says Logged ... to today with an Undo, and Undo removes only that entry.',
    ],
  },
  {
    id: 'S-155', feature: 'Nutrition quick log', title: 'Scan a food from Quick add: pick its Type and it is saved and logged once', persona: 'diet-fresh', brief: 'nutrition-quick-log',
    steps: [
      'On the Nutrition tab press Scan and log in the toolbar, scan a packaged product (or use the photo of a barcode), press Drink, set the grams and press Save and log it. Then open Recipes.',
    ],
    expected: [
      'The food shows once in the day\'s eaten rows and once in Recipes as a Drink, and one entry is logged however many times Save and log it was tapped. Scanning on a phone needs a camera: try it on a real phone.',
    ],
  },
  {
    id: 'S-156', feature: 'Nutrition quick log', title: 'The sheet refuses a day ahead and a day too far back, and a full day says so', persona: 'recipe-collector', brief: 'nutrition-quick-log', edge: true,
    steps: [
      'Open the portion sheet from a Recipes row (the Log button), set Day to tomorrow and press Log it, then set a day more than 400 days back and press Log it. Then fill one day with 20 entries and open the sheet again.',
    ],
    expected: [
      'A day ahead says Pick today or an earlier day, and a day too far back says entries are kept for 400 days. A day with 20 entries says that is the limit and logs nothing more.',
    ],
  },
  {
    id: 'S-157', feature: 'Meals from foods', title: 'Build a cereal bowl from two foods and see its numbers add up', persona: 'recipe-collector', brief: 'meals-from-foods',
    steps: [
      'In Recipes press + New, add a food by hand called Oat cereal (150 kcal, 5 g protein) and another called Whole milk (150 kcal, 8 g protein). Then press + New, Recipe or meal, name it Cereal bowl, press + Food or meal, pick Oat cereal, press More once, press + Food or meal again and pick Whole milk. Press Save recipe.',
    ],
    expected: [
      'While you build it the form says Per serving, from the parts: 375 kcal and 15.5 g protein, with 2 of 2 ingredients counted. After Save the recipe\'s page says the same, lists 1.5 portions Oat cereal and 1 portion Whole milk, and Log offers those numbers.',
    ],
  },
  {
    id: 'S-158', feature: 'Meals from foods', title: 'Build a shake from foods, then change one food and the shake follows', persona: 'recipe-collector', brief: 'meals-from-foods',
    steps: [
      'Make a Kefir drink, a Banana food and a Whey food with their calories and protein, then a recipe Shake that links all three with + Food or meal. Open Whey, press Edit, raise its calories and Save, then open Shake again.',
    ],
    expected: [
      'The shake\'s numbers per serving include the new Whey calories without editing the shake, and Log opens at the new numbers. A day already logged keeps the numbers it had.',
    ],
  },
  {
    id: 'S-159', feature: 'Meals from foods', title: 'A meal inside a meal rolls up through both, and a loop is refused', persona: 'recipe-collector', brief: 'meals-from-foods', edge: true,
    steps: [
      'Put the Cereal bowl into a new recipe Lunch box with + Food or meal (it is listed under Meals), and check the numbers. Then edit Cereal bowl, press + Food or meal and pick Lunch box.',
    ],
    expected: [
      'Lunch box shows the bowl\'s numbers through both levels. Picking Lunch box inside Cereal bowl says it already contains this meal, so that would loop, and adds nothing. A chain more than 3 levels deep says meals can hold other meals up to 3 levels deep.',
    ],
  },
  {
    id: 'S-160', feature: 'Meals from foods', title: 'Use my own numbers keeps typed numbers; turning it off adopts the roll-up', persona: 'recipe-collector', brief: 'meals-from-foods', edge: true,
    steps: [
      'Edit Cereal bowl, tick Use my own numbers, press Edit under Nutrition per serving, type 700 calories and Save. Open the page, then edit again and untick Use my own numbers and Save.',
    ],
    expected: [
      'With the switch on the page says Your own numbers are used and shows what the parts add up to as a hint; 700 stays. With it off the page says Per serving, from the parts and the numbers come from the foods again.',
    ],
  },
  {
    id: 'S-161', feature: 'Meals from foods', title: 'Delete or rename a linked food; a part with no numbers is named', persona: 'recipe-collector', brief: 'meals-from-foods', edge: true,
    steps: [
      'Rename Whole milk to Milk and open Cereal bowl. Then press + New, Recipe or meal, name it Mystery, type one ingredient (a pinch of something) and no calories, and Save. Open Cereal bowl, press Edit, press + Food or meal, pick Mystery, and look at the counted line (a food added by hand needs calories, so it cannot be the one with no numbers). Finally delete Milk from Recipes (More actions, Delete, then Tap again to delete) and open the bowl.',
    ],
    expected: [
      'The bowl lists the new name Milk. The counted line says 2 of 3 ingredients counted, needs numbers: followed by the food\'s name. After Milk is deleted the line stays as plain text, is no longer a link, and the bowl\'s numbers drop to the parts that are left.',
    ],
  },
  // ---- Grocery budget ----
  {
    id: 'S-162', feature: 'Grocery budget', title: 'Set a monthly budget and read spent of budget', persona: 'grocery-shopper', brief: 'grocery-budget',
    steps: [
      'Open Groceries, Shopping. Under the summary press Set a budget.',
      'Type 400 and press Save. Then open Bought.',
    ],
    expected: [
      'The card reads "Budget", then "<this month\'s spent> of $400.00", with a bar filled to the share spent and an Edit button. "<amount> left" sits beside the spent figure (S-166 covers a list that costs more than the budget).',
      'Bought shows the same card with the same figures (spent includes tax, as the summary does).',
    ],
  },
  {
    id: 'S-163', feature: 'Grocery budget', title: 'The bar turns amber near the budget and red when over', persona: 'grocery-shopper', brief: 'grocery-budget',
    steps: [
      'Press Edit and set the budget to about 1.1 times what this month has spent, so spent is over 80% of it. Save.',
      'Press Edit again and set a budget a little below what has been spent. Save.',
    ],
    expected: [
      'From 80% of the budget the bar and card turn amber and the text still says how much is left.',
      'When spent is above the budget the bar is full and red and the text reads "<amount> over budget".',
    ],
  },
  {
    id: 'S-164', feature: 'Grocery budget', title: 'Edit the budget, then remove it', persona: 'grocery-shopper', brief: 'grocery-budget',
    steps: [
      'Press Edit, change the amount to 600 and press Save.',
      'Press Edit again, press Remove and then Tap again to remove (the first tap only arms it and the budget stays), then reload the page.',
    ],
    expected: [
      'The card shows "of $600.00" and the bar shrinks to match.',
      'The card goes back to Monthly budget with Set a budget, and stays that way after the reload. The budget is kept in your settings, so it also shows on another device you are signed in on.',
    ],
  },
  {
    id: 'S-165', feature: 'Grocery budget', title: 'An invalid amount is refused', persona: 'grocery-shopper', brief: 'grocery-budget', edge: true,
    steps: [
      'Press Set a budget (or Edit), type "abc", and press Save.',
      'Clear the box, press Save, then type 0 and press Save.',
      'Type 425.50 and press Save.',
    ],
    expected: [
      'Each bad try keeps the box open and says "Enter an amount in dollars, like 400 or 425.50."; nothing is saved.',
      '425.50 saves and the card reads "of $425.50".',
    ],
  },
  {
    id: 'S-166', feature: 'Grocery budget', title: 'A list that costs more than the budget says what is left to spend', persona: 'grocery-shopper', brief: 'grocery-budget', edge: true,
    steps: [
      'Set the budget to a small amount, such as 10, so this month\'s priced to-get items add up to more than it.',
      'Look at the card on Shopping.',
    ],
    expected: [
      'A note under the bar, in amber, reads "You still have <amount> left in your budget to spend." and the "<amount> left" on the line above is hidden, so the figure shows once.',
      'Raising the budget above the plan removes the note.',
    ],
  },
  {
    id: 'S-167', feature: 'Grocery budget', title: 'The Shopping and Bought switch is centered with no counts (retired 2026-11-13: the Groceries switch is now Shopping, Bought and Inventory, covered by S-122 and S-138)', persona: 'grocery-shopper', brief: 'grocery-budget', retired: true,
    steps: [
      'Open Groceries on a computer and look at the Shopping and Bought buttons.',
    ],
    expected: [
      'The two buttons show only their names, with no numbers, and sit centered on a row of their own.',
    ],
  },
  {
    id: 'S-168', feature: 'Groceries views', title: 'A quick-added item leaves Inventory after it is bought', persona: 'grocery-shopper', brief: 'quickadd-one-time-items',
    steps: [
      'On Shopping press + Add one-time item to a store, type Milk and press Enter. The notice says it is a one-time item.',
      'Tick Milk on Shopping. Open Inventory, then Bought.',
    ],
    expected: [
      'The notice says Milk leaves Inventory and next month\'s list after you buy it.',
      'Milk is not in Inventory any more, and it shows on Bought for this month.',
    ],
  },
  {
    id: 'S-169', feature: 'Groceries views', title: 'The One-time item box in Edit makes any item leave after it is bought', persona: 'grocery-shopper', brief: 'quickadd-one-time-items',
    steps: [
      'Open Inventory, press Edit, open an item and tick One-time item.',
      'Press Done, tick that item on Shopping, then open Inventory.',
    ],
    expected: [
      'The box stays ticked after you reopen the row.',
      'The item is gone from Inventory and shows on Bought.',
    ],
  },
  {
    id: 'S-170', feature: 'Groceries views', title: 'Unticking a bought one-time item brings it back', persona: 'grocery-shopper', brief: 'quickadd-one-time-items', edge: true,
    steps: [
      'Quick add Milk and tick it on Shopping.',
      'Open Bought and untick Milk, then open Inventory.',
    ],
    expected: [
      'Milk goes back to Shopping.',
      'Milk is in Inventory again, with its one-time box still ticked.',
    ],
  },
  {
    id: 'S-171', feature: 'Groceries views', title: 'The same name can be quick-added again after the first one is bought', persona: 'grocery-shopper', brief: 'quickadd-one-time-items', edge: true,
    steps: [
      'Quick add Milk, tick it, then quick add Milk in the same store again.',
    ],
    expected: [
      'The second Milk is added with no "already in this store\'s list" message and shows on Shopping.',
    ],
  },
  {
    id: 'S-172', feature: 'Receipt reconcile', title: 'A second receipt at the same store does not list what the first receipt bought', persona: 'grocery-shopper', brief: 'receipt-earlier-items', device: true,
    steps: [
      'On a phone, tick Milk 1 by hand on Shopping. Scan a receipt from a store, press Apply. Scan a second receipt from the same store with different items.',
      'Read the text under the lines and open "Review these" if it is there.',
    ],
    expected: [
      'The second sheet says how many items from an earlier receipt are not listed, and lists only Milk 1 (ticked by hand) under "Already bought, not on this receipt", folded until you press Review.',
      'It does not say "Is this the right one?" because some of this receipt\'s lines match your list.',
    ],
  },
  // ---- The Recipes and Nutrition redesign, 2026-11-08 ----
  {
    id: 'S-173', feature: 'Recipe star', title: 'The star is in the recipe\'s own header, and a starred row shows a small mark', persona: 'recipe-collector', brief: 'recipe-star-placement',
    steps: [
      'Open Recipes and open any recipe. Look at the top of its page and press the Star button.',
      'Press Back to recipes and find that recipe in the list. Reload the page, then open the recipe again and press Unstar.',
      'Open Recipes, press Library and open a Library recipe.',
    ],
    expected: [
      'The Star button sits beside the recipe name in the page header and its name changes to Unstar when pressed.',
      'The row shows a small filled star after the name, which is not a button and does not cover Log or the at-home count. It is still there after the reload, and gone after Unstar.',
      'A Library recipe page has no Star button (it is not in Mine yet).',
    ],
  },
  {
    id: 'S-174', feature: 'Used as', title: 'Sauces and seasonings are Ingredients, not Meals', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab',
    steps: [
      'Open Recipes, press + New, Recipe or meal. Name it Garlic aioli, set the category to Sauces and add one ingredient. Read the Used as chips, then Save.',
      'Go Back to recipes and press the Meals tab, then the Ingredients tab.',
    ],
    expected: [
      'Used as starts on Ingredient only. The recipe is not in Meals and is in Ingredients, and its row has no Log button.',
      'The tabs read All, Foods, Meals, Ingredients, Drinks, each with a count.',
    ],
  },
  {
    id: 'S-175', feature: 'Used as', title: 'One food with two labels shows in both tabs', persona: 'diet-fresh', brief: 'recipes-used-as-ingredients-tab',
    steps: [
      'Open Recipes, press + New, Add a food by hand. Name it Eggs, 70 calories and 6 g protein. Look at the Used as chips, press Ingredient too, and Save food.',
      'Go Back to recipes and press the Foods tab, then the Ingredients tab.',
    ],
    expected: [
      'Used as starts on Ready to eat and takes a second chip. The row tag reads Ingredient + Ready to eat.',
      'Eggs is in Foods and in Ingredients, with a Log button on its row.',
    ],
  },
  {
    id: 'S-176', feature: 'Used as', title: 'The chips follow the category until pressed; one always stays on, Drink stands alone', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab', edge: true,
    steps: [
      'Open + New, Recipe or meal. Change the category to Sauces, then to Carbs, and read Used as each time.',
      'Press Meal to turn it off, then change the category to Sauces again.',
      'On + New, Add a food by hand, press Ready to eat off, then press Drink, then press Ingredient.',
    ],
    expected: [
      'Sauces gives Ingredient only; Carbs gives Meal and Ingredient. Once you press a chip the category stops changing it.',
      'The last chip cannot be turned off. Drink turns the others off, and pressing Ingredient afterwards turns Drink off.',
    ],
  },
  {
    id: 'S-177', feature: 'Library rows', title: 'Library rows: In Mine check and a one-tap Add with Undo', persona: 'recipe-collector', brief: 'recipes-used-as-ingredients-tab',
    steps: [
      'Open Recipes and press Library. Read a row: it has no Library pill. Press + Add on one row.',
      'Read the notice, press Undo, then press + Add on the same row again and press Open.',
      'Go back to Library and read that row.',
    ],
    expected: [
      'The row\'s + Add copies it and the notice says "<name> added to Mine." with Open, Undo and Dismiss.',
      'Undo takes the copy away silently. Adding again and pressing Open shows the copy in Mine.',
      'That Library row now shows a check named In Mine and no + Add button.',
    ],
  },
  {
    id: 'S-178', feature: 'Library rows', title: 'Library tabs and how much of a recipe is at home', persona: 'grocery-shopper', brief: 'recipes-used-as-ingredients-tab',
    steps: [
      'Open Groceries and make sure a few items are in At home. Open Recipes, press Library.',
      'Press Meals, Ingredients and Drinks in turn. Read the "n of m at home" on rows.',
      'Press Ingredients, open the filters above the list and set Category to Dessert (no loaded ingredient is a dessert).',
    ],
    expected: [
      'Library has All, Meals, Ingredients and Drinks (no Foods) and no counts. A row says how many of its ingredients are at home, for example "2 of 5 at home".',
      'An empty tab says "No ingredients among these. Show more to load others." and offers Show more.',
    ],
  },
  {
    id: 'S-179', feature: 'Goes with', title: 'Pair chili with rice; it shows from both and Remove clears both', persona: 'meal-planner', brief: 'recipes-goes-with',
    steps: [
      'In Recipes press + New, Recipe or meal: Chili, category Protein, 400 kcal and 30 g protein, one ingredient. Do the same for Rice, category Carbs, 200 kcal and 4 g protein.',
      'Open Chili. In Goes with press "Add a recipe it goes with…" and pick Rice.',
      'Open Rice and read its Goes with. Press Remove on Chili, then Tap again to remove, then open Chili again.',
    ],
    expected: [
      'Chili lists Rice with Make a meal (an underlined link) and Remove. Rice lists Chili without being set separately.',
      'The first Remove tap only changes the button to "Tap again to remove" and pairs stay; after the second, neither recipe lists the other.',
    ],
  },
  {
    id: 'S-180', feature: 'Goes with', title: 'Make a meal from a pair (after S-179): numbers add up, and deleting a recipe clears the pairing', persona: 'meal-planner', brief: 'recipes-goes-with',
    steps: [
      'With Chili and Rice paired (S-179), open Chili and press Make a meal.',
      'Read the new page, then open Recipes, press Meals and find it.',
      'Delete Rice (More actions, Delete, then Tap again to delete), then open Chili and read Goes with. Press Undo on the notice and read it again.',
    ],
    expected: [
      'A meal "Chili with Rice" opens at 1 serving with 600 kcal and 34 g protein per portion, rolled up from its two parts, and it is in the Meals tab.',
      'After Delete, Chili\'s Goes with no longer lists Rice. Undo brings the pairing back.',
    ],
  },
  {
    id: 'S-181', feature: 'Goes with', title: 'After you log a food, what goes with it is one tap away', persona: 'meal-planner', brief: 'recipes-goes-with',
    steps: [
      'With Chili and Rice paired, open Chili, press Ate this, then read under the message.',
      'Press "+ Rice" and read the message. Press Undo next to Rice.',
      'Go back to Recipes, press Log on the Chili row, press Log it and read the sheet.',
    ],
    expected: [
      'A "Goes with it:" row offers + Rice. One tap logs Rice at its usual amount on the same day, and Undo takes back only the Rice entry (the Chili entry stays).',
      'The Log sheet offers the same row after Log it. A recipe with no pairing offers nothing.',
    ],
  },
  {
    id: 'S-182', feature: 'Goes with', title: 'A recipe goes with at most three, and a sauce is not offered', persona: 'recipe-collector', brief: 'recipes-goes-with', edge: true,
    steps: [
      'Open a recipe and add three recipes in Goes with. Look for a fourth. (This account already has Chicken and rice bowl and Baked salmon each going with Tuna salad: open Tuna salad and read its Goes with first.)',
      'Press Remove on one (then Tap again to remove) and add a different one. Make a recipe in + New with the category Sauces (this account has none), then open another recipe and look at its Goes with choices.',
    ],
    expected: [
      'After three, the drop-down is gone and the note says "It goes with 3 recipes. Remove one to add another."',
      'Removing one brings the drop-down back. Sauces and seasonings are not offered as partners.',
    ],
  },
  {
    id: 'S-183', feature: 'Saved meals move', title: 'Old saved meals appear once in Recipes as meals', persona: 'meal-planner', brief: 'saved-meals-into-recipes',
    steps: [
      'Sign in to this account on QA and open Recipes. Press Meals.',
      'Open "Usual breakfast" and read its numbers and ingredients. Reload the page and look at Meals again.',
    ],
    expected: [
      'The four saved meals (Usual breakfast, Chicken bowl, Post-workout, Quick dinner) are meals in Recipes with the numbers they had.',
      'Usual breakfast lists Egg and spinach scramble and Overnight oats as linked parts (it was made from those two recipes); the other three list their foods by name with their saved totals. After a reload each is still there once, not twice.',
    ],
  },
  {
    id: 'S-184', feature: 'Saved meals move', title: 'Saved meals lists the Recipes meals and one tap logs one', persona: 'meal-planner', brief: 'saved-meals-into-recipes',
    steps: [
      'Open Nutrition, press Add food, then Saved meals and read the list. Tap "Usual breakfast".',
      'Look for a Manage button, then open Recipes and rename the meal there.',
    ],
    expected: [
      'The list shows the four meals. "Usual breakfast" reads "· 2 foods ·" and one tap adds two entries (the scramble and the oats). The other three read "· 1 food ·" and one tap adds one entry with the meal\'s total, because they were made of hand-typed foods.',
      'There is no Manage button; a note says to rename or edit a meal in Recipes. The new name shows in Saved meals.',
    ],
  },
  {
    id: 'S-185', feature: 'Saved meals move', title: 'Save as meal makes a Recipes meal, and a name a recipe has is refused', persona: 'diet-on-target', brief: 'saved-meals-into-recipes', edge: true,
    steps: [
      'Open Nutrition, press Add food, then Save as a meal. Press Save as a meal, tick Oatmeal with berries and Greek yogurt, name it "Breakfast" and save.',
      'Open Recipes, press Meals and find it. Then save another meal named "breakfast".',
    ],
    expected: [
      'A meal Breakfast is in Recipes under Meals and in Saved meals, with the two foods\' total (1 food · their calories).',
      'The second save is refused with "You already have a recipe or meal with that name."',
    ],
  },
  {
    id: 'S-186', feature: 'Counts as', title: 'Counts as on a plate: automatic until you press, then your choice', persona: 'recipe-collector', brief: 'week-board',
    steps: [
      'Open + New, Recipe or meal, set the category to Protein and read Counts as on a plate. Press Veg.',
      'Save, open it again with Edit, then press Back to automatic.',
      'On + New, Add a food by hand, type 30 g protein and read Counts as.',
      'Open Lentil soup (this account has it set by hand) and press Edit.',
    ],
    expected: [
      'Protein is on to begin with. Pressing Veg adds it and a dashed Back to automatic chip appears. Your choice is still there after Save and Edit.',
      'Back to automatic returns to Protein only. A food with 30 g protein counts as Protein, and the last chip cannot be turned off.',
      'Lentil soup opens with Protein and Carb on and the dashed Back to automatic chip showing (a hand-set choice).',
    ],
  },
  {
    id: 'S-187', feature: 'Week board', title: 'Plan opens as the Board on a wide screen and the List on a phone (retired 2026-11-09: the Plan List and Board switch was removed by the Nutrition board)', persona: 'meal-planner', brief: 'week-board', retired: true,
    steps: [
      'On a desktop browser open Nutrition and find Plan. Press List, then Board.',
      'On a phone open Nutrition, Plan. Press Board.',
    ],
    expected: [
      'On a wide screen the Board is shown first: seven days side by side. The List is the plan you knew, unchanged.',
      'On a phone the List is shown first, and the Board shows one day at a time with a row of day buttons.',
    ],
  },
  {
    id: 'S-188', feature: 'Week board', title: 'A day as four meals with Calories, Protein and Fat bars', persona: 'meal-planner', brief: 'week-board',
    steps: [
      'On Nutrition look at a day after today that has planned items (a phone: use the day stepper). Read the meters at the top and the meals under them.',
      'Tap that day\'s name, press Add food, pick Dinner, press Recipes and press Plan on a recipe. Tap its card and press More.',
    ],
    expected: [
      'A day ahead shows Calories, Protein and Fat as "amount / target" of its planned items against 2,400 kcal and 160 g, and each meal (Breakfast, Lunch, Dinner, Snack) shows its calories against its share of the day. Planned items from before meals existed sit under Not set.',
      'The added recipe appears in that meal and the bars move; More raises that card\'s portion and the bars with it. A bar over its target fills in full in orange and its label says how many grams over (for example "Fat planned: 108.5 / 70 g, 38.5 g over").',
    ],
  },
  {
    id: 'S-189', feature: 'Week board', title: 'The plate check and its one-tap fix', persona: 'meal-planner', brief: 'week-board',
    steps: [
      'With Chili and Rice paired (S-179), tap the name of a day after today (for example "Fri 25"), press Add food, pick Dinner, press Recipes and press Plan Chili for Dinner. Read the marks under Dinner on that day\'s column.',
      'Press the dashed "+ Add a carb" button.',
    ],
    expected: [
      'Dinner shows Protein, Carb and Veg marks; Protein has a check and Carb and Veg do not.',
      'The button reads "+ Add a carb: Rice (goes with Chili)". One tap puts Rice in Dinner and Carb gets a check. A Veg button appears only if you have a recipe that counts as Veg (a recipe in Sides, or one set to count as Veg); with the starter recipes there is none: add a food by hand called Steamed broccoli (50 kcal, 4 g protein) with the Veg chip on, and a "+ Add a veg: Steamed broccoli" button then appears and gives Veg its check.',
    ],
  },
  {
    id: 'S-190', feature: 'Week board', title: 'Move a card to another meal or day, and drag on a wide screen', persona: 'meal-planner', brief: 'week-board', edge: true,
    steps: [
      'Tap a card, press Move to… and pick Lunch. Tap it again, press Move to… and pick another day.',
      'On a wide screen drag a card into another meal.',
      'Try to move a card to a day that already holds 8 items, and into a meal that already has the same food (then into another meal of that day that has it).',
    ],
    expected: [
      'The card moves to the meal or the day you picked and the bars of both days follow. A food already in that meal is refused with "That is already in that meal."; the same food in another meal of that day is allowed, as adding it is.',
      'Dragging does the same.',
      'A full day refuses with "A day can hold 8 things. Remove one to add another."',
    ],
  },
  {
    id: 'S-191', feature: 'Week board', title: 'The Fat bar says when some foods have no fat figure', persona: 'meal-planner', brief: 'week-board', edge: true,
    steps: [
      'On a day after today plan a recipe that has a fat figure and one that has none (Add food, Recipes, Plan). Read the Fat meter.',
      'Add more portions of the food with no fat until it makes up most of the day\'s calories.',
    ],
    expected: [
      'With a few foods missing fat the meter is hatched and a line says "Fat: n of m foods have it." and it never turns red.',
      'When most of the day has no fat figure the bar is replaced by "Add fat to your foods to see fat here."',
    ],
  },
  {
    id: 'S-192', feature: 'Week board', title: 'A saved meal planned earlier is still on the board after the move', persona: 'meal-planner', brief: 'week-board', edge: true,
    steps: [
      'On Nutrition find a day that had a saved meal planned and read the day\'s meals.',
      'Tap the item and press Move to… to put it in Dinner.',
    ],
    expected: [
      'The saved meal is on that day as its Recipes meal, in the Not set group at the top of the day, with the same calories.',
      'After Move to… it is in Dinner. The Not set group disappears once every item of that day has a meal.',
    ],
  },

  // ---- Nutrition board (PRs 815 and 816, brief nutrition-board; ADR 105). Written after the build from the code's own labels; nothing here has been run by the owner. ----
  // The board's day names read like "Thu 24 · today"; examples below use a made-up date, so read it against your own calendar. Seed facts: the Diet accounts hold targets of 2,400 kcal, 160 g protein and 70 g fat.
  {
    id: 'S-193', feature: 'Nutrition board', title: 'Nutrition is one board with a week switcher', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'Open Daily, Nutrition at 1920 px wide.',
      'Read the top of the page: the week arrows with This week, the line under them, and the two buttons at the right (there is no "Nutrition" heading).',
      'Look down the page for panels named Diet, Supplements, Water, Food eaten and Last 7 days.',
    ],
    expected: [
      'The week switcher is a pair of arrows with a This week button; a line under them names the week (for example "This week · Sep 24 to 30"); the button at the right reads Manage.',
      'Seven day columns sit side by side; today\'s is named with "· today". Each holds five meters (Calories, Protein, Fat, Supplements, Water), its meals (food nobody planned sits in the meal for the hour it was logged), Supplements and Hydration.',
      'None of the old panels is there; food, supplements, water and targets are all reachable from the board (S-199 to S-218).',
    ],
  },
  {
    id: 'S-194', feature: 'Nutrition board', title: 'Weeks run Sunday to Saturday; the arrows step a week and This week returns to today', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'On Nutrition read the first and last day names of This week (Sunday to Saturday, like the Board).',
      'Press the previous-week arrow and read its first and last day names and the line under the arrows.',
      'Press the next-week arrow twice and read the same, then press This week.',
    ],
    expected: [
      'This week runs Sunday to Saturday and today\'s column is inside it. Each arrow press moves exactly one such week.',
      'No day appears in two weeks; the line under the buttons follows (for example "Last week · Sep 17 to 23").',
      'This week returns to the current week and the toolbar reads "Adding to <today> · today" again.',
    ],
  },
  {
    id: 'S-195', feature: 'Nutrition board', title: 'Today\'s meters count what was eaten and drunk', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'On Nutrition read today\'s meters: Calories, Protein, Fat, Supplements and Water.',
      'Press Add food, One-off food, add "Rice" 300 kcal, 20 g protein, 40 g carbs, 5 g fat, then Done.',
      'Press + Drink under Hydration, press the 16.9 oz size, then Done.',
    ],
    expected: [
      'Before: Calories reads "1,440 / 2,400 kcal" and Protein "58 / 160 g"; Fat is a number against 70 g; Supplements reads "n of m taken" (or "None scheduled"); Water is "0 / <goal> oz". A screen reader says "Calories eaten so far: …", and Water "drunk".',
      'After Rice: Calories reads "1,740 / 2,400 kcal", Protein "78 / 160 g", Fat 5 g higher, and Rice shows as an eaten row.',
      'After the drink: Water reads "16.9 / <goal> oz", and Hydration says how many oz are to go.',
    ],
  },
  {
    id: 'S-196', feature: 'Nutrition board', title: 'Meters count the plan for days ahead, and today\'s plan counts only once logged', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'On Nutrition note today\'s Calories meter and the planned items under today\'s meals (the seed plans two under Not set).',
      'Tick the check box of one of today\'s planned items (Check <name> as eaten).',
      'Look at a day after today that has planned items: add up the calories of its cards and compare with its Calories meter.',
    ],
    expected: [
      'Before logging, today\'s Calories meter counts only the eaten rows of food nobody planned (about 35% of 2,400 kcal), not the planned items.',
      'After the check, the item shows its check in its meal (it is not listed again as a separate eaten row) and the meter rises by that item\'s calories.',
      'A day ahead reads the sum of its planned items against 2,400 kcal; a screen reader says "planned" there, not "eaten" (ADR 105).',
    ],
  },
  {
    id: 'S-197', feature: 'Nutrition board', title: 'With no target a meter shows the amount and never turns red', persona: 'diet-fresh', brief: 'nutrition-board', edge: true,
    steps: [
      'On Nutrition read today\'s meters. This account has no targets saved.',
      'Press Add food, One-off food, add "Rice" 300 kcal and 20 g protein, then Done.',
      'Press Manage, type 2,200 into Calories (set a goal weight first if the field is not offered) and press Done.',
    ],
    expected: [
      'Before and after Rice, Calories reads "300 kcal" with no "/ target" and the bar is not red; a screen reader adds "no target set".',
      'Once Calories is 2,200 the meter reads "300 / 2,200 kcal".',
      'Water still has a goal (half the body weight, or 64 oz with no weight), whatever the diet targets say.',
    ],
  },
  {
    id: 'S-198', feature: 'Nutrition board', title: 'The toolbar names the day it adds to, and follows the day you tap', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'On Nutrition read the line beside Add food and the buttons next to it.',
      'Tap the name of a day after today (for example "Sat 26") in its column.',
      'Press the previous-week arrow, tap a day name there and read the toolbar again.',
    ],
    expected: [
      'It reads "Adding to <today> · today", and Scan and log, Quick add and One-off food sit beside Add food, which is the last button of the row.',
      'It reads "Adding to Sat 26"; only Add food is left (a day ahead plans, see S-207).',
      'Last week\'s day reads "Adding to <day>" and offers Add food, Scan and log, Quick add and One-off food like today; they log eaten food on that date (S-209). There is no "food is read-only" line.',
    ],
  },
  {
    id: 'S-199', feature: 'Nutrition board', title: 'The add sheet picks the meal from the time, and remembers your pick', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Use a private window (or a browser that has never opened the add sheet), sign in as this account, open Nutrition and press Add food on today. Press Done.',
      'Tap the name of a day after today (for example "Fri 25") and press Add food. Read which button under Which meal? is pressed. Press a different one and press Done.',
      'Tap the day name again and press Add food again.',
    ],
    expected: [
      'On today the sheet shows no Which meal? question (eaten food has no meal); the title is "Add food" and under it reads "Adding to <today> · today".',
      'On the day ahead, before 10:30 Breakfast is pressed; to 14:30 Lunch; to 16:30 Snack; to 21:30 Dinner; after that Snack. The note under the meal buttons says "Recipes and saved meals you add go into <meal>."',
      'The second time the sheet opens on a day ahead it shows the meal you picked, whatever the time. (The pick is kept in this browser only.)',
    ],
  },
  {
    id: 'S-200', feature: 'Nutrition board', title: 'The ways of adding, and Back to ways of adding', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'On Nutrition press Add food and read the list of ways to add food.',
      'Press One-off food, then Back to ways of adding, then Quick add.',
      'Press Done. Tap tomorrow\'s name and press Add food again.',
    ],
    expected: [
      'Today lists seven ways in three groups, each with an icon and a one-line hint: Fastest (Quick add, Scan and log, One-off food), From what you have (Find food, Recipes) and Whole days and meals (Saved meals, Copy yesterday); once something is eaten that day, Save as a meal in Recipes joins the last group (S-203); every row starts at the same left edge.',
      'The sheet\'s title changes to the way you opened; Back to ways of adding returns to the list; Done closes the sheet.',
      'A day ahead lists only Recipes and Saved meals, under From what you have and Whole days and meals (food is eaten on the day; ahead it only plans).',
    ],
  },
  {
    id: 'S-201', feature: 'Nutrition board', title: 'Log with One-off food and Quick add', persona: 'recipe-collector', brief: 'nutrition-board',
    steps: [
      'Press One-off food in the toolbar, add "Rice" 300 kcal and 20 g protein.',
      'In Recipes press Ate this on one recipe (the chips list recipes you have logged or starred, and this account has none logged yet). Press Quick add in the toolbar. Read Suggested now and Recent and favorites. Tap a food under Recent and favorites, press Log it, then Undo.',
      'Tap one suggestion under Suggested now.',
    ],
    expected: [
      '"Added Rice." shows under the toolbar and in the sheet; Rice is in today\'s eaten rows and the Calories and Protein meters rise.',
      'The portion sheet opens at the usual amount; Log it adds an entry and Undo removes only that entry.',
      'A suggestion adds one portion and says "Added <food>." (there is no Undo here: delete it from its eaten row).',
    ],
  },
  {
    id: 'S-202', feature: 'Nutrition board', title: 'Log with Find food, Saved meals and Recipes', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Press Add food, Find food, type "oat" in "Search your past meals and recipes", pick a result and press Add.',
      'Press Back to ways of adding, then Saved meals, and tap "Usual breakfast".',
      'Press Back to ways of adding, then Recipes. Type a few letters in Find a recipe and press Log on one recipe. Then tap the name of a day after today, press Add food, Recipes, and press Plan on a recipe.',
    ],
    expected: [
      'The food is added ("Added 1 portion of <food>.") and listed under Eaten.',
      'Usual breakfast logs two entries (the scramble and the oats); today\'s meters follow.',
      'On today a recipe has only Log, which opens the portion sheet (there is no Plan on today). On the day ahead Plan says "Planned <recipe> for <meal>." and the recipe appears in that meal on that day\'s column.',
    ],
  },
  {
    id: 'S-203', feature: 'Nutrition board', title: 'Copy yesterday and Save as a meal', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'Press Add food, Copy yesterday, then Copy yesterday again. Untick one food and press Add selected.',
      'Press Back to ways of adding, then Save as a meal. Press Save as a meal, tick two foods from today, name it "Lunch two" and save.',
      'Delete every eaten food on today, then press Add food and read the list of ways.',
    ],
    expected: [
      'Only the ticked foods are added to today and appear in the eaten rows; the notice reads "Added <n>.".',
      'The meal "Lunch two" is in Recipes under Meals and in Saved meals (S-185).',
      'With nothing eaten yet the list of ways has no "Save as a meal in Recipes" row; log one food and it comes back.',
    ],
  },
  {
    id: 'S-204', feature: 'Nutrition board', title: 'Scan from Find food and come back to the same sheet', persona: 'diet-on-target', brief: 'nutrition-board', device: true,
    steps: [
      'On a phone open Nutrition, press Add food, Find food and Scan to fill form, and allow the camera.',
      'Scan a packaged US food until the camera sheet closes.',
      'Read the sheet that comes back, press Use, check the One-off food form and press Add.',
      'Scan a code neither source knows and read the buttons after the miss.',
    ],
    expected: [
      'The camera sheet closes and the Add food sheet should come back on Find food with the product picked (name, calories per 100 g, grams at its serving); you should not have to open the add sheet again. (Expected from the code; not yet walked on a phone, so record what you see.)',
      'Use fills the One-off food form; Add says "Added <name>." and the food is in today\'s eaten rows and meters.',
      'After a miss, Type the name and Photo the label are offered, as in S-93.',
    ],
  },
  {
    id: 'S-205', feature: 'Nutrition board', title: 'Scan and log in the toolbar, save the food and log it once', persona: 'diet-fresh', brief: 'nutrition-board', device: true,
    steps: [
      'On a phone open Nutrition and press Scan and log in the toolbar (it is shown for today only).',
      'Scan a packaged product, pick its Type, set the grams and press Save and log it.',
      'Press Save and log it again if the button is still there, then open Recipes.',
    ],
    expected: [
      'The camera opens straight away, without the add sheet. A panel for the found product appears under the toolbar.',
      'The food is in today\'s eaten rows once and in Recipes once, and the meters moved once (S-155).',
    ],
  },
  {
    id: 'S-206', feature: 'Nutrition board', title: 'A day with nothing says so in every section', persona: 'diet-fresh', brief: 'nutrition-board', edge: true,
    steps: [
      'On Nutrition read today\'s column from top to bottom. This account has never logged a food or set a supplement.',
      'Press Add food and Quick add.',
    ],
    expected: [
      'Breakfast, Lunch and Dinner each say "Nothing planned" with no button; Snack sits between Lunch and Dinner and says "No daily snacks yet" with a Set up daily snacks button. a day with nothing logged shows no Not in a meal group; Supplements says "Nothing scheduled"; Hydration shows how many oz are to go and a + Drink button.',
      'Quick add says "Nothing here yet. Log a few foods and the ones you use most appear."',
    ],
  },
  {
    id: 'S-207', feature: 'Nutrition board', title: 'A day ahead plans recipes and saved meals; it never logs', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Press Next week and pick a day whose Breakfast, Lunch and Dinner all say "Nothing planned" (the seed plans seven days from today, so days later than that are empty). Note that Snack is listed between Lunch and Dinner.',
      'Tap that day\'s name, press Add food, pick Snack, press Recipes. Read the buttons beside each recipe.',
      'Press Plan on Overnight oats. Press Done.',
      'Press This week and tap today\'s name; press Add food and Recipes.',
    ],
    expected: [
      'Breakfast, Lunch and Dinner say "Nothing planned" and have no button; Snack says "No daily snacks yet" (no daily snacks are saved).',
      'The note reads "Recipes and saved meals you add go into Snack."; each recipe has only Plan (no Log). The notice reads "Planned Overnight oats for Snack."',
      'The Snack section now holds an Overnight oats card, and that day\'s Calories meter reads its planned calories. Today\'s recipes list has only Log (no Plan), and today\'s add sheet shows no Which meal? question.',
    ],
  },
  {
    id: 'S-208', feature: 'Nutrition board', title: 'Edit and delete an eaten food from its row sheet; carbs and fat survive an edit', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'In today\'s eaten rows tap the Greek yogurt row, press Edit in its sheet, change only the name to "Plain yogurt" and press Save.',
      'Read the Fat meter before and after.',
      'Tap the Plain yogurt row, press Delete and then Tap again to delete. Then tap an earlier day\'s eaten row and read its sheet.',
      'Add a one-off food with only a name, calories and protein, and read the line under the eaten rows.',
    ],
    expected: [
      'The row shows "Plain yogurt"; Calories, Protein and Fat meters do not change, because the edit kept its carbs and fat.',
      'The first Delete tap only changes the button to "Tap again to delete"; the second removes the row and lowers the meters by that food\'s numbers. An earlier day\'s row opens the same sheet with Edit, Delete, Move to… and Copy to….',
      'A line says "Carbs and fat count only what you enter." once a food has no carbs or fat.',
    ],
  },
  {
    id: 'S-209', feature: 'Nutrition board', title: 'Last week logs food on its date; supplements and water change too', persona: 'diet-on-target', brief: 'nutrition-any-day-add', edge: true,
    steps: [
      'Press the previous-week arrow and read a day: its meters, its eaten food (Not in a meal) and its other sections.',
      'Tap a day name there, read the toolbar, press Add food and add a one-off food. Tap its row and read the sheet.',
      'Tick a supplement on that day (add one first in Manage, S-210) and press + Drink, then press a size.',
    ],
    expected: [
      'The day shows its eaten food under Not in a meal (an earlier day\'s food has no meal) and its meters count that day\'s food.',
      'The toolbar offers Add food, Scan and log, Quick add and One-off food; the food is logged on that date (in "Not in a meal"), counted in that day\'s meters, and its row sheet offers Edit, Delete, Move to… and Copy to…. There is no "food is read-only" line.',
      'The tick and the drink both save, and that day\'s count and Water meter move.',
    ],
  },
  {
    id: 'S-210', feature: 'Nutrition board', title: 'Supplements tick on any day, each with its own count', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'Press Manage, then Supplements and library. Under Morning type "Creatine" with dose "5 g" and press Add; under Night add "Magnesium" with "400 mg". Press Done.',
      'On today\'s column read Supplements, then tick Creatine.',
      'Tick Magnesium on a day after today, then press Last week and tick both on one day. Press This week.',
    ],
    expected: [
      'Each day lists Morning: Creatine 5 g and Night: Magnesium 400 mg with a tick each and "0 of 2 taken" (a day with none scheduled says "Nothing scheduled").',
      'Today reads "1 of 2 taken". The day ahead reads "1 of 2 taken" and last week\'s day "2 of 2 taken"; each day keeps its own ticks after you switch weeks and come back.',
    ],
  },
  {
    id: 'S-211', feature: 'Nutrition board', title: 'The drink sheet adds every size, another amount, and Remove with Undo', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'On today\'s Hydration press + Drink. Read the title and the totals.',
      'Press a size, then type 12 in Other amount (oz) and press Add.',
      'Under Logged press Remove on the 12 oz drink, press Tap again to remove, then Undo.',
      'Type 500 in Other amount (oz) and press Add. Press Done.',
    ],
    expected: [
      'The title reads "Hydration · <day> · today"; nine "Add water by container size" buttons (each "+n oz" with its name and cups); the total reads "n / goal oz", the cups, and "n oz to go" or "goal met".',
      'Each drink appears under Logged; Remove asks "Tap again to remove", the drink goes, and Undo brings it back in the same place.',
      '500 is refused with "Enter ounces, up to 200"; after Done the board\'s Hydration line and Water meter match the sheet.',
    ],
  },
  {
    id: 'S-212', feature: 'Nutrition board', title: 'Hot day and training minutes change the goal line by line', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'Open the drink sheet on today. Tick Hot day (+16 oz).',
      'Type 60 in Training (minutes) and tab out of the field. Read the Goal lines.',
      'Type 700 in Training (minutes) and tab out.',
      'Press Done and read the tags under Hydration.',
    ],
    expected: [
      'The goal rises by 16 oz and the Goal breakdown gains a "Hot day" line; training adds 12 oz per 30 minutes, so 60 minutes adds a "Training 60 min" line of 24 oz; the Goal line is the sum.',
      '700 is refused with "Enter training minutes, up to 600" and the field returns to 60.',
      'Hydration shows tags "Hot day +16" and "Training 60 min +24" and the Water meter uses the new goal. Change base goal opens Manage (S-216).',
    ],
  },
  {
    id: 'S-213', feature: 'Nutrition board', title: 'A day ahead sets its water goal and logs no drinks', persona: 'diet-on-target', brief: 'nutrition-board', edge: true,
    steps: [
      'On a day after today press + Drink under Hydration.',
      'Look for the size buttons and Other amount. Tick Hot day. Press Done and reload the page.',
    ],
    expected: [
      'The sheet says "This day has not happened yet. Set the goal ahead; drinks are logged on the day." and has no size buttons, no Other amount and no Logged list.',
      'The day\'s Hydration reads "Goal <n> oz" with the tag "Hot day +16"; after the reload it is still there.',
    ],
  },
  {
    id: 'S-214', feature: 'Nutrition board', title: 'On a phone: one day, a stepper, and no sideways scroll', persona: 'diet-on-target', brief: 'nutrition-board', edge: true,
    steps: [
      'Emulate a 375 px wide window and open Nutrition.',
      'Press Next day seven times, then read the Week buttons. Keep pressing Next day.',
      'Open Day to show and read its groups. Press Previous day until it stops.',
      'Scroll the page sideways and look at the toolbar and the day.',
    ],
    expected: [
      'One day shows, with Previous day, Day to show and Next day; the day it names is the day food is added to (on a phone the "Adding to" line is read by a screen reader but not drawn).',
      'After the seventh press the stepper has crossed into Next week and Next week is pressed; Next day stops at the end of next week (13 days on). Day to show has groups Last week, This week and Next week.',
      'Previous day stops seven days back. There is no sideways scroll and every button is at least 44 px tall.',
    ],
  },
  {
    id: 'S-215', feature: 'Nutrition board', title: 'Back closes a sheet and the page keeps its address', persona: 'diet-on-target', brief: 'nutrition-board',
    steps: [
      'Open Nutrition and note the address (it ends "daily/nutrition").',
      'Open Add food and press the browser\'s Back (on a phone the back-swipe). Do the same for + Drink and Manage.',
      'Open Manage, Supplements and library, then press Back.',
    ],
    expected: [
      'Each sheet closes on one Back step and you stay on Nutrition; the address never gains a day or a sheet name. (Expected from the code and the e2e spec; not yet walked by hand.)',
      'Back from a sheet does not leave the Nutrition tab, and a reload reopens Nutrition.',
    ],
  },
  {
    id: 'S-216', feature: 'Nutrition board', title: 'Manage: daily targets, read-only weight and goal, and the base water goal in one sheet', persona: 'diet-fresh', brief: 'targets-into-manage',
    steps: [
      'Press Manage and read the headings: Daily targets, Weight and goal, Water, Library.',
      'Read the two lines under Weight and goal. Press Edit in Progress, then come back to Nutrition and press Manage again.',
      'Type 2,000 into Calories under Daily targets. Then press Change base goal, type 80 and press Use this amount.',
      'Press Done and read the board\'s Calories and Water meters.',
    ],
    expected: [
      'The sheet holds all four sections; the weight line reads "Current weight: N lb" from the latest weigh-in (or "No weigh-in yet") and the goal line reads "Goal: N lb by date" (or "No goal set"); neither has an input. There is no Targets and goal button on the board and no colour legend.',
      'Edit in Progress closes the sheet and opens Progress > Trends, where the goal is edited; weight is typed on the board\'s weigh-in row. With a goal, the recommended targets and pace appear (Slow, Steady, Fast, S-03); the typed calories replace only calories. The base goal shows "Base goal 80 oz fixed" with a "Use my weight (0.5 oz per lb)" button.',
      'The board shows Calories against 2,000 and Water against 80 oz plus any hot day or training; a day with a hot day shows 96.',
    ],
  },
  {
    id: 'S-217', feature: 'Nutrition board', title: 'Manage refuses a bad water goal, and Use my weight puts the base goal back', persona: 'diet-on-target', brief: 'targets-into-manage', edge: true,
    steps: [
      'In Manage press Change base goal, type 5 and press Use this amount.',
      'Type 80, press Use this amount, press Change base goal and Use my weight.',
    ],
    expected: [
      'The message reads "Enter a daily goal between 8 and 500 oz"; nothing is saved by a refused entry.',
      'Use my weight puts the base goal back to half the body weight.',
    ],
  },
  {
    id: 'S-218', feature: 'Nutrition board', title: 'Manage: supplements and library, Meals and foods (opens Recipes), Water reminder', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Press Manage and read its rows.',
      'Press Supplements and library, add a supplement under Noon, press Back to Manage and then Done.',
      'Press Manage, Meals and foods (opens Recipes); then press Back, press Manage and press Water reminder (under the water goal).',
    ],
    expected: [
      'The rows read Water reminder, Supplements and library and Meals and foods (opens Recipes), each with a one-line note.',
      'The editor shows the Morning, Noon and Night editor and the whole library; the new supplement appears on every day\'s Supplements.',
      'Meals and foods (opens Recipes) closes the sheet and opens Recipes; Water reminder opens Settings (the reminder is under Alerts). Back from either should return to Nutrition (expected from the code; not yet walked by hand, so record what you see).',
    ],
  },
  // ---- Supplement portions (brief supplement-portions, ADR 114). Written from the brief and the code's own labels; nothing here has been walked by the owner. ----
  {
    id: 'S-219', feature: 'Supplement portions', title: 'Say how many capsules you take and see the amount', persona: 'meal-planner', brief: 'supplement-portions',
    steps: [
      'Press Manage, Supplements and library, then + New. Name it "Magnesium glycinate", add the row Magnesium 200 mg, and type 2 in "Capsules or tablets in one serving".',
      'In "How much you take each time" press − once, then + twice, reading the line under the stepper each time. Press Save, then Done.',
      'On today\'s Supplements tick it, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
    ],
    expected: [
      'The stepper starts at "2 capsules" with "200 mg magnesium" (the row is the amount in one label serving, which is 2 capsules); − gives "1 capsule" and "100 mg magnesium"; + twice gives "3 capsules" and "300 mg magnesium", each with the working under it ("3 × 100 mg per capsule = 300 mg" style).',
      'After saving, today\'s row reads "Magnesium glycinate 3 capsules" next to its tick, and Totals counts the amount you chose, naming "(3 capsules)" beside the product.',
    ],
  },
  {
    id: 'S-220', feature: 'Supplement portions', title: 'Twice a day with a different amount each time', persona: 'meal-planner', brief: 'supplement-portions',
    steps: [
      'With the supplement from the last scenario, add it to Night on the Supplements tab, then open its Night entry and press − until it says "1 capsule". Save.',
      'Tick Morning and Night today and read the Totals magnesium figure; then edit the nutrient rows on the Night entry (change 200 mg to 300 mg) and open the Morning entry.',
    ],
    expected: [
      'A copy added to another section starts at one serving; after the change Morning shows its own amount and Night shows "1 capsule".',
      'The Totals figure is the Morning amount plus the Night amount. The Morning entry now shows the same rows (300 mg) and serving size as Night, while its capsule count is unchanged.',
    ],
  },
  {
    id: 'S-221', feature: 'Supplement portions', title: 'No serving size, and an old supplement', persona: 'vitamin-tracker', brief: 'supplement-portions', edge: true,
    steps: [
      'Open a supplement that has nutrient rows but no serving size (or add one) and read "How much you take each time"; press − then + and watch the line under it.',
      'Open a supplement you saved before portions existed and look at today\'s Supplements and Totals.',
    ],
    expected: [
      'With no serving size it counts servings in quarters ("¾ serving" after one −, "1¼ servings" after one + from one serving) from ¼ to 10, and the line says "per serving × ½".',
      'An older supplement shows no tag on the day and Totals counts it exactly as before (one serving per tick).',
    ],
  },
  // ---- Vitamins and minerals (briefs supplement-nutrient-totals, food-vitamins-minerals, recipes-vitamins-minerals, nutrients-without-upper-limit, type-food-amounts, recommendations-by-age-sex, vitamin-mineral-day-meter,
  // intake-target-and-safety-checks; QA data for the vitamin and mineral features). The figures below are what the 'vitamin-tracker' account's seed produces (checked against the app's own code on 2026-11-09); nothing here has been walked by the owner. ----
  {
    id: 'S-222', feature: 'Vitamin and mineral totals', title: 'Today\'s Totals read the supplements and the foods, with the warning line under the ticks', persona: 'vitamin-tracker', brief: 'supplement-nutrient-totals',
    steps: [
      'Open Nutrition and read today\'s Supplements: the ticks under Morning, Noon and Night, and the line under them.',
      'Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line). Read the line about food at the top, then the rows for Vitamin D, Zinc and Magnesium, then the No upper limit section and the note at the bottom.',
    ],
    expected: [
      'Morning and Noon are ticked, Night (Magnesium glycinate, "1 capsule") is not. Under the ticks: "Over an upper limit today: Vitamin D. Totals shows what each limit counts. General information, not medical advice."',
      'The food line reads "Food: 2 of 3 eaten foods had vitamin or mineral data. Foods without data add nothing, so food totals can be low."',
      'Vitamin D 125 mcg, "Over the limit by 25 mcg", "Limit 100 mcg" (the bar is full and rust red). Zinc 36 mg, "Close to the limit (90%)", "Supplements 30 mg, food 6 mg." Magnesium "200 mg from supplements", "57% of the limit", "Food 130 mg is not added: this limit counts supplements only." Calcium 820 mg, "41% of the limit".',
      'No upper limit: Potassium 950 mg "Below the recommended range"; Vitamin B12 500.8 mcg "20,867% of the recommended amount"; Fiber 9 g "Below the recommended range"; Sodium 710 mg "31% of the 2,300 mg level to stay under". Nothing in that section is amber or red, and none of it is in the warning line.',
      'The sheet says "Add your birth year and sex in Settings to see your own amounts. Until then the adult range is shown." Each row ends with its recommended amount and "General information, not medical advice."; the bottom note ends "It does not account for pregnancy, breastfeeding, medicines or health conditions, and it is not medical advice."',
    ],
  },
  {
    id: 'S-223', feature: 'Vitamin and mineral totals', title: 'What I took, Everything scheduled, and unticking moves the warning', persona: 'vitamin-tracker', brief: 'supplement-nutrient-totals',
    steps: [
      'Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line), then "Everything scheduled". Read the Magnesium row.',
      'Close the sheet. Untick Vitamin D3 under Noon, read the line under the ticks, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) ("What I took") and look for a Vitamin D row.',
      'Tick Vitamin D3 again.',
    ],
    expected: [
      'On Everything scheduled, Magnesium is "300 mg from supplements", "Close to the limit (86%)", listing "Magnesium glycinate 200 mg" and "Magnesium glycinate (1 capsule) 100 mg" (the Night intake counts at half a serving).',
      'Unticked: the warning line is gone and What I took has no Vitamin D row (no food today lists vitamin D). Ticked again: the warning line and the row come back.',
    ],
  },
  {
    id: 'S-224', feature: 'Vitamin and mineral totals', title: 'The target line and the 7-day average sit apart from the limit', persona: 'vitamin-tracker', brief: 'intake-target-and-safety-checks',
    steps: [
      'Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) ("What I took") and read, for Calcium, Zinc, Magnesium and Vitamin D, the line that starts "Target:" and the line that starts "7-day average".',
      'Read the 7-day average of Potassium in the No upper limit section.',
    ],
    expected: [
      'Target lines: Calcium "Below the recommended amount (82%)", Zinc "Above the recommended amount", Magnesium "Meets the recommended amount" (food counts for the target even though the magnesium limit counts supplements only), Vitamin D "Above the recommended amount". None of them mentions the limit.',
      '7-day averages: Calcium "534.29 mg (7 days with data)", Zinc "18.86 mg", Vitamin D "60.43 mcg", Magnesium "171.43 mg from supplements", Potassium "1,721.43 mg (7 days with data)". A day with no data is skipped, never counted as zero.',
    ],
  },
  {
    id: 'S-225', feature: 'Vitamin and mineral totals', title: 'Supplements alone: no target verdict, and an unticked day says nothing is ticked', persona: 'diet-fresh', brief: 'intake-target-and-safety-checks', edge: true,
    steps: [
      'Press Manage, Supplements and library, then + New. Name it "Zinc", add the row Zinc 15 mg, press Save, then Done. Do not tick it.',
      'Read the line under Supplements on today, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
      'Close the sheet, tick Zinc, and open Totals again (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
    ],
    expected: [
      'Unticked: under the Supplements bar "Vitamins and minerals: nothing ticked yet", and Totals says "Nothing ticked on this day yet."',
      'Ticked: Zinc 15 mg, "38% of the limit", "7-day average: 15 mg (1 day with data)". There is no "Target:" line (supplements alone cannot say below) and no line about food.',
    ],
  },
  {
    id: 'S-226', feature: 'Vitamin and mineral day line', title: 'A folded line under Supplements names the two nearest their limits', persona: 'vitamin-tracker', brief: 'vitamin-mineral-day-meter',
    steps: [
      'On today, read the line under the Supplements bar. Press it.',
      'Read the bars, then press the link at the bottom.',
    ],
    expected: [
      'The closed line (one tap tall) reads "Vitamins and minerals: Vitamin D over · Zinc 90%", with words as well as colour.',
      'Opened, five thin bars: Vitamin D (over, rust), Zinc 90%, Magnesium 57%, Calcium 41% and Iron 6%. The link says "All N in Totals" (N is the number of limited nutrients with data that day, about 6 to 8; read it off the sheet) and opens the Totals sheet for that day. Pressing the line again folds it.',
    ],
  },
  {
    id: 'S-227', feature: 'Vitamin and mineral day line', title: 'An earlier day with no ticks still shows what the foods carried', persona: 'vitamin-tracker', brief: 'vitamin-mineral-day-meter', edge: true,
    steps: [
      'Open the day four days ago (use the day picker; it can be in last week) and read the line under Supplements.',
      'Open the day five days ago and read its line.',
    ],
    expected: [
      'Four days ago nothing was ticked, but the foods listed amounts: "Vitamins and minerals: Calcium 16% · Zinc 15%", no Vitamin D over.',
      'Five days ago Magnesium and the B12 and fiber capsule were ticked: "Vitamins and minerals: Magnesium 57% · Calcium 16%".',
    ],
  },
  {
    id: 'S-228', feature: 'Food vitamins and minerals', title: 'A food found by name carries its vitamins and minerals into the log', persona: 'diet-fresh', brief: 'food-vitamins-minerals',
    steps: [
      'Press Add food, then Find food. Type "spinach", pick the first result, set 100 g and press Use.',
      'Read the form that opens, press Add, then close the sheet and open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) on today.',
    ],
    expected: [
      'The One-off form opens with "Vitamins and minerals (optional)" already open and rows filled by the lookup (for example Calcium, Iron, Potassium), each in mg, mcg or g, with "Filled from the food lookup or an earlier save. Check them against the label; change or remove any row."',
      'After Add, today shows a Vitamins and minerals line (or, with no such line, a Totals button). Totals says "Food: 1 of 1 eaten food had vitamin or mineral data." and the rows show the amounts for 100 g.',
    ],
  },
  {
    id: 'S-229', feature: 'Food vitamins and minerals', title: 'A scanned barcode logs the food with its vitamins and minerals', persona: 'diet-fresh', brief: 'food-vitamins-minerals', device: true,
    steps: [
      'On a phone, press Add food, then Find food, press Scan to fill form and scan a packaged food with a nutrition panel (a cereal box works).',
      'Check the amounts in the form against the box (Sodium and Fiber are the ones Open Food Facts lists most often), then press Add.',
    ],
    expected: [
      'The food is found and the form shows "Vitamins and minerals (optional)" with rows that match the box for the serving you chose. A product that lists none shows no rows and counts as a food with no data.',
      'After Add, Totals counts the food and the coverage line says 1 of 1.',
    ],
  },
  {
    id: 'S-230', feature: 'Food vitamins and minerals', title: 'A ready-made food carries amounts per serving and logging it adds them to the day', persona: 'vitamin-tracker', brief: 'recipes-vitamins-minerals',
    steps: [
      'Open Recipes, find "Fortified cereal" and press Edit. Read "Vitamins and minerals per serving (optional)", then press Cancel.',
      'Go to Nutrition, press Add food, Recipes, then Log beside Fortified cereal and confirm one serving. Press Done, then Totals.',
    ],
    expected: [
      'Four rows, in the table\'s order: Calcium 130 mg, Iron 4.5 mg, Vitamin D 2 mcg, Zinc 1.2 mg.',
      'The coverage line reads "Food: 3 of 4 eaten foods had vitamin or mineral data." Zinc 37.2 mg "Close to the limit (93%)", Vitamin D 127 mcg "Over the limit by 27 mcg", Calcium 950 mg, Iron 7 mg.',
    ],
  },
  {
    id: 'S-231', feature: 'Typed amounts', title: 'Type vitamin and mineral amounts on a one-off food', persona: 'diet-fresh', brief: 'type-food-amounts',
    steps: [
      'Press Add food, then One-off food. Type the name "Burrito bowl", 300 calories and 20 protein. Press "Vitamins and minerals (optional)".',
      'Press "+ Add a nutrient", leave Calcium and type 180. Press "+ Add a nutrient" again, choose Vitamin B12, type 0.01 and change its unit to mg. Press Add, then close the sheet.',
      'In Eaten, press Edit on Burrito bowl, read the rows, then Cancel. Open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
    ],
    expected: [
      'The section is closed when the form opens. After Add the food is in Eaten.',
      'Edit shows Calcium 180 mg and Vitamin B12 10 mcg (0.01 mg is stored as 10 mcg).',
      'Totals: Calcium 180 mg "9% of the limit"; Vitamin B12 10 mcg "417% of the recommended amount" in the No upper limit section.',
    ],
  },
  {
    id: 'S-232', feature: 'Typed amounts', title: 'Typed rows survive a calorie change, filled rows do not, and a silly amount is refused in words', persona: 'diet-fresh', brief: 'type-food-amounts', edge: true,
    steps: [
      'Press Add food, Find food, pick a food from the results and press Use. Press "+ Add a nutrient", choose a nutrient the food does not list in the new row (Iodine; a food from the database already lists zinc and copper) and type 1.5. Then change the calories.',
      'On a fresh One-off form open the section, add Vitamin B12 with 1 and unit mg, then add Zinc twice (5 mg, then 2000 mcg). Read the lines under the rows.',
      'Press Add, then Edit the food in Eaten and change only its name.',
    ],
    expected: [
      'After the calorie change the filled rows go and the line says "Calories changed: amounts you did not retype were cleared."; the Zinc row you typed stays. While rows are showing, the "Vitamins and minerals" heading cannot be folded.',
      'The lines read "Vitamin B12 1 mg is far above any food; left out." and "Zinc is listed twice; only the first is kept." The saved food has only Zinc 5 mg.',
      'Changing only the name keeps the amounts; changing the calories on edit drops the ones you did not retype.',
    ],
  },
  {
    id: 'S-233', feature: 'Label scan', title: 'A label photo fills the vitamin and mineral rows, to check against the label', persona: 'diet-fresh', brief: 'food-vitamins-minerals', device: true,
    steps: [
      'On a phone, press Add food, Find food, then the label photo option after a miss (or scan from the New food form), and photograph the Nutrition Facts of a fortified cereal or a packaged food that lists sodium and fiber.',
      'Compare every vitamin and mineral row with the label, remove one row (press Remove, then Tap again to remove), then change the calories.',
    ],
    expected: [
      'The form shows each vitamin and mineral the label lists as its own row (including Sodium and Fiber when listed) so each can be checked against the label.',
      'Removing a row removes only that amount. Changing the calories clears the rows the photo filled and says so. Record any amount that does not match the label: that is the accuracy check for the label scan.',
    ],
  },
  {
    id: 'S-234', feature: 'Age and sex amounts', title: 'A birth year and sex change your own limit and recommended amount', persona: 'vitamin-tracker', brief: 'recommendations-by-age-sex',
    steps: [
      'Open Settings, find "Recommended amounts" in the App group, type 1974 as the birth year and choose Female.',
      'Go back to Nutrition, open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) and read Calcium, Magnesium and Zinc, then Vitamin B12.',
    ],
    expected: [
      'Calcium: "Limit 2,000 mg for ages 51 to 70" and "Recommended for women ages 51 to 70: 1,200 mg a day." Magnesium: "Recommended for women ages 31 and over: 320 mg a day." Zinc: "Recommended for women ages 19 and over: 8 mg a day."',
      'Vitamin B12 reads "20,867% of the recommended amount for women ages 19 and over". The note at the top says the amounts are for the age and sex given and do not cover pregnancy or breastfeeding.',
    ],
  },
  {
    id: 'S-235', feature: 'Age and sex amounts', title: 'A bad year, "Prefer not to say" and Clear', persona: 'vitamin-tracker', brief: 'recommendations-by-age-sex', edge: true,
    steps: [
      'In Settings > Recommended amounts choose Female, then type 85, then replace it with 2012, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) on today.',
      'Type 1974, choose "Prefer not to say", and open Totals again. Then press Clear and open Totals once more.',
    ],
    expected: [
      '85 shows "Enter a four-digit year, like 1985." and saves nothing (after a reload the year box is empty; the sex you chose stays). 2012 saves but says "Amounts are shown for ages 19 and over, so the adult range is used.", and Totals says "Amounts for your age are not shown. The adult range is used."',
      'With a year and "Prefer not to say", Totals says "Your own amounts need both a birth year and a sex, so the adult range is shown. You can change this in Settings." After Clear the year box is empty, "Prefer not to say" is the one selected (it is what no answer looks like), and Totals asks you to add them.',
    ],
  },
  {
    id: 'S-236', feature: 'Supplement portions', title: 'The seeded Night capsule is at half a serving', persona: 'vitamin-tracker', brief: 'supplement-portions',
    steps: [
      'Read the Night supplement on today, then press Manage, Supplements and library, find the one Magnesium glycinate row (Morning and Night both lit) and press Edit.',
    ],
    expected: [
      'The day shows "1 capsule" beside Night\'s Magnesium glycinate and nothing beside Morning\'s. In "When you take it" the total reads "3 capsules a day" with "Morning 2 · Night 1", and there is one set of nutrient rows (200 mg magnesium per serving of 2 capsules).',
    ],
  },
  {
    id: 'S-237', feature: 'Vitamin and mineral totals', title: 'Every account sees every vitamin and mineral part', persona: 'paid-monthly', brief: 'feature-map', edge: true,
    steps: [
      'Press Manage, Supplements and library, then + Add, then "Open the full form, with amounts", and look for "What is in one serving (optional)" and "How much you take each time".',
      'Open Settings > App and look for "Recommended amounts". On Nutrition press Add food, One-off food and look for "Vitamins and minerals (optional)". Open Recipes, press + New, Add a food by hand, and look for "Vitamins and minerals per serving (optional)".',
    ],
    expected: [
      'All four are there for an ordinary account: the vitamin and mineral features are open to everyone (released 2026-11-09), not only to admins.',
    ],
  },
  {
    id: 'S-238', feature: 'Food vitamins and minerals', title: 'A recipe built from a food adds up its vitamins and minerals, logged or planned', persona: 'vitamin-tracker', brief: 'recipes-vitamins-minerals',
    steps: [
      'Press Reset on the Vitamin tracker first, so today is the seeded day. In Recipes press + New, Recipe or meal, and name it "Cereal duo". Press + Food or meal, pick "Fortified cereal", then press the + beside "1 portion" once so it reads "1.5 portions". Press Save recipe.',
      'On the recipe\'s page press Ate this, then open Nutrition and open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
      'Close Totals. Tap tomorrow, press Add food, Recipes, choose Dinner under "Which meal?", press Plan beside "Cereal duo" and press Done. Open the planned card, press "Move to…" and choose today under Day (the card stays under Dinner: the Day buttons keep the meal, the Meal buttons stay on the same day). On today tick "Check Cereal duo as eaten", then press Totals again.',
    ],
    expected: [
      'The form and the saved page say "Per serving, from the parts: 180 kcal · 4.5 g protein · 39 g carbs · 1.5 g fat. 1 of 1 ingredient counted." and list "1.5 portions Fortified cereal".',
      'After the first log (1.5 portions of the cereal on top of the seeded day): Calcium 1,015 mg, Iron 9.25 mg, Vitamin D 128 mcg "Over the limit by 28 mcg", Zinc 37.8 mg "Close to the limit (95%)". The line reads "Food: 3 of 4 eaten foods had vitamin or mineral data."',
      'After the planned one is logged from the board: Calcium 1,210 mg, Iron 16 mg, Vitamin D 131 mcg, Zinc 39.6 mg "Close to the limit (99%)", and "Food: 4 of 5 eaten foods had vitamin or mineral data." Each log adds the same 195 mg of calcium, 6.75 mg of iron, 3 mcg of vitamin D and 1.8 mg of zinc.',
    ],
  },
  {
    id: 'S-239', feature: 'Supplement times', title: 'One supplement row with Morning, Noon and Night chips, no duplicate list', persona: 'supplement-stack', brief: 'supplement-merged-list',
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'Open Daily, Nutrition, Manage, then Supplements and library. Find Fish oil.',
      'Press the Noon chip on Fish oil, then press it again.',
      'Press Undo on the notice that follows the second press.',
    ],
    expected: [
      'Fish oil is one row, not two, with Morning and Night lit; Creatine monohydrate, Caffeine capsule and Multivitamin are one row each. No schedule list repeats the same names under Morning, Noon and Night.',
      'The first press lights Noon and adds a copy at one serving; the second press removes that time with an Undo notice, and Undo restores it.',
    ],
  },
  {
    id: 'S-240', feature: 'Supplement times', title: 'Turning off the last chip returns the supplement to Library only', persona: 'supplement-stack', brief: 'supplement-merged-list', edge: true,
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'In Manage, Supplements and library, find Creatine monohydrate (lit at Noon only) and press its Noon chip.',
      'Read the filter counts (All, Scheduled, Library only), then press Library only.',
    ],
    expected: [
      'Creatine has no chip lit and appears under Library only; the counts add up (Scheduled lost one, Library only gained one).',
      'Search and the Source filter narrow the list, and an empty result says so.',
    ],
  },
  {
    id: 'S-241', feature: 'Supplement times', title: 'Set each time and its amount in the supplement sheet', persona: 'supplement-stack', brief: 'supplement-split-times',
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'In Manage, press Edit on Fish oil. In the sheet find "When you take it". Light Noon as well, then set the amount at each time with the steppers and press Save.',
      'Open Daily, Nutrition and read Fish oil in the Supplements section.',
    ],
    expected: [
      'The sheet shows a total such as "4 softgels a day" with "Morning 2 · Night 2" and updates as chips or steppers change; a time cannot repeat and at least one stays on.',
      'After Save, each time is its own row and ticks separately; a row shows its amount (for example "2 softgels") only when the amount is not 1.',
    ],
  },
  {
    id: 'S-242', feature: 'Supplement times', title: 'The Add sheet picks several times, and Library only stands alone', persona: 'supplement-stack', brief: 'supplement-split-times',
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'In Manage press + Add. Search "Magnesium" and pick a result (or type a name if the catalog has none).',
      'Press Morning and Night, then press Library only, then Morning again.',
      'Press Add.',
    ],
    expected: [
      'Morning and Night both light; pressing Library only clears them; pressing Morning clears Library only.',
      'The supplement is added at Morning at one serving. With Morning and Night both lit it is added to both.',
    ],
  },
  {
    id: 'S-243', feature: 'Active ingredients', title: 'Ingredient rows on a supplement, and one with none behaves as before', persona: 'supplement-stack', brief: 'supplement-active-ingredients',
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'In Manage press Edit on Fish oil and look at its rows below the vitamin and mineral rows.',
      'Press Edit on Multivitamin.',
    ],
    expected: [
      'Fish oil lists Omega-3 1,000 mg, EPA 300 mg and DHA 200 mg per serving, and the nutrient picker offers all 28 nutrients grouped under headings.',
      'Multivitamin has no ingredient rows and saves and totals exactly as it did before.',
    ],
  },
  {
    id: 'S-244', feature: 'Active ingredients', title: 'Totals shows an Active ingredients section with your own cap and target', persona: 'supplement-stack', brief: 'supplement-active-ingredients',
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'Open Daily, Nutrition, find today, and open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line).',
      'Find the Active ingredients section. Read the Omega-3 and EPA rows. Press "Everything scheduled" and read the Creatine row.',
      'Press the limit button on Creatine, set a target of 5 g and save, then reopen the row and remove the limit.',
    ],
    expected: [
      'Omega-3 reads 2,000 mg against its 1,500 mg cap with words and a rust bar (over the cap, never colour alone); EPA 600 mg against a 500 mg target reads Met. Creatine, scheduled but unticked, shows its figure with "Set your limit".',
      'The limit sheet and the Totals sheet carry the not-medical-advice note and suggest no dose. A zero, negative or oversized amount is refused. Back closes the limit sheet.',
    ],
  },
  {
    id: 'S-245', feature: 'Active ingredients', title: 'What I took versus what is scheduled, and units', persona: 'supplement-stack', brief: 'supplement-active-ingredients', edge: true,
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'Close Totals and untick the Night Fish oil on the day\'s Supplements, then open Totals (the Vitamins and minerals line, then Open Totals; the Totals button under the ticks only when there is no such line) and read the Omega-3 row on What I took and on Everything scheduled.',
      'Add a typed ingredient "Vitamin A" in IU to Multivitamin and read its row.',
    ],
    expected: [
      'Omega-3 on What I took falls to 1,000 mg (under the cap) while Everything scheduled stays 2,000 mg; g, mg and mcg convert between rows.',
      'An IU row matches only an IU limit and is never converted to mg.',
    ],
  },
  {
    id: 'S-246', feature: 'Ingredient day line', title: 'A closed line under the Supplements meter names the two nearest their limits', persona: 'supplement-stack', brief: 'ingredient-day-bars',
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'Open Daily, Nutrition, today. Under the Supplements meter read the line that starts "Active ingredients:".',
      'Press the line, then press Open Totals.',
    ],
    expected: [
      'The line reads like "Active ingredients: Omega-3 over · EPA Met", naming the two nearest their limits; Creatine, with no limit, has no line.',
      'Pressing it opens thin bars (up to five), each carrying the Totals sentence, and Open Totals shows the same figures.',
    ],
  },
  {
    id: 'S-247', feature: 'Ingredient day line', title: 'Nothing ticked yet, a day with no record, and a phone', persona: 'supplement-stack', brief: 'ingredient-day-bars', edge: true,
    steps: [
      'Press Reset on Supplement stack first (switch to another account to do it), then switch back.',
      'On Nutrition open an earlier day with no ticks, then untick every supplement today.',
      'Resize to 375 px wide.',
    ],
    expected: [
      'With limits set, any day with nothing ticked (an earlier day, or today after unticking) reads "nothing ticked yet"; with no limits set there is no line.',
      'At 375 px there is no sideways scroll and the bars stay readable.',
    ],
  },
  {
    id: 'S-248', feature: 'Nutrition week', title: 'Week arrows run Sunday to Saturday, with This week', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Press Reset on Meal planner first (switch to another account to do it), then switch back.',
      'Open Daily, Nutrition. Press the previous-week arrow, then the next-week arrow twice, then This week.',
    ],
    expected: [
      'Each week runs Sunday to Saturday like the Board; the arrows step one week at a time and This week returns to the current one.',
      'No visible "Nutrition" heading sits above the switcher (the Daily tab already says it; screen readers still get one).',
    ],
  },
  {
    id: 'S-249', feature: 'Nutrition week', title: 'A planned food on today has a check box that logs it as eaten', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Press Reset on Meal planner first (switch to another account to do it), then switch back.',
      'On Nutrition, today, tick the check box on a planned food, read the meters and the eaten rows, then untick it.',
    ],
    expected: [
      'Ticking logs the food as eaten and the meters move; unticking removes that log.',
      'A separate eaten row appears only for food that was not planned.',
    ],
  },
  {
    id: 'S-250', feature: 'Nutrition week', title: 'The toolbar offers what the selected day can do', persona: 'meal-planner', brief: 'nutrition-board',
    steps: [
      'Press Reset on Meal planner first (switch to another account to do it), then switch back.',
      'Read the toolbar on today, then tap an earlier day and a day ahead and read it each time. On a window 1440 px or wider count the day columns.',
    ],
    expected: [
      'Today and an earlier day offer Scan and log, Quick add and One-off food (they log eaten food), with Add food as the last button; a day ahead offers Recipes and Saved meals (it plans, never logs).',
      'Seven columns show from 1440 px wide, and the selected day is clearly marked.',
    ],
  },
  {
    id: 'S-251', feature: 'Grocery purchase log', title: 'Ran out keeps the purchase in Spending', persona: 'grocery-shopper', brief: 'grocery-purchase-log',
    steps: [
      'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
      'On Shopping tick a priced item (bought). Open Inventory, note this month\'s Spending, then untick that item (there is no Ran out button).',
      'Open Bought and its Spending history switch, then, if a sharing group exists, the Who owes who button under This month. Then open Shopping.',
    ],
    expected: [
      'The item\'s cost stays in the month\'s Spending and in who owes who, and the item is back on Shopping, unticked.',
    ],
  },
  {
    id: 'S-252', feature: 'Grocery purchase log', title: 'Buy it again: a second purchase is its own line', persona: 'grocery-shopper', brief: 'grocery-purchase-log', edge: true,
    steps: [
      'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
      'Tick the same item as bought again on Shopping after you unticked it. Open Bought.',
    ],
    expected: [
      'Bought lists both purchases, newest first, each with date and time; the month total counts both. Unticking on Shopping or Bought removes only the open purchase, never a closed one.',
    ],
  },
  {
    id: 'S-253', feature: 'Receipts for everyone', title: 'An ordinary account sees saved receipts and Download all', persona: 'grocery-shopper', brief: 'receipts-everyone',
    steps: [
      'Press Reset on Grocery shopper first (switch to another account to do it), then switch back.',
      'Open Groceries, then Receipts (if it is empty, keep a receipt photo first: S-59). Press Download all.',
    ],
    expected: [
      'Receipts opens for this non-admin account; Download all gives one zip with receipts.csv and each photo, naming any photo that could not load. Another account never sees these rows.',
    ],
  },
  {
    id: 'S-254', feature: 'Ideas filters', title: 'Status and Muscle dropdowns appear above six ideas', persona: 'superset-builder', brief: 'ideas-card-filters-watch',
    steps: [
      'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
      'Open Workout, Ideas to try. Add ideas until there are seven (+ Add idea, a name and a muscle each). Pick a Status, then a Muscle, then type a search, then Clear.',
    ],
    expected: [
      'At six or fewer there are no filters; at seven the Status and Muscle dropdowns appear beside the search and the count reads "N of M"; choices combine with the search and Clear resets all three. A new idea added by manual + Add idea goes last.',
    ],
  },
  {
    id: 'S-255', feature: 'Ideas filters', title: 'The idea card and its Add sheet', persona: 'superset-builder', brief: 'ideas-card-filters-watch',
    steps: [
      'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
      'On an idea card read status, name, muscle chips, note and Add. Press Add and choose This week only plus a day, then Undo.',
    ],
    expected: [
      'The card shows status, name (opens Edit), up to two muscle chips, a short note, a large Watch tile only when there is a link, Add and a menu. Add opens "Add <name>" with day buttons in the Board\'s order; This week only shows "Added to Day N this week" with an Undo that removes it.',
    ],
  },
  {
    id: 'S-256', feature: 'Exercise notes', title: 'A note follows the exercise everywhere', persona: 'superset-builder', brief: 'exercise-notes-persist',
    steps: [
      'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
      'In Program, open a card\'s sheet and save a Note. Open the same exercise on the Board and in Ideas to try or Add to day.',
      'Edit the note in one place, then clear it.',
    ],
    expected: [
      'The note shows on every Board card and idea for that exercise, the field says it is shared, and editing or clearing it in one place changes it in all (200 characters at most).',
    ],
  },
  {
    id: 'S-257', feature: 'Skipped entry', title: 'Skipping writes a Skipped entry for the day', persona: 'superset-builder', brief: 'feature-map',
    steps: [
      'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
      'On the Board skip an exercise, then un-skip it, then skip it again and tick it instead. Open its log.',
    ],
    expected: [
      'Skipping adds a "Skipped" entry for that date with no numbers; un-skip removes it; ticking swaps it for the check-off entry. A real logged session is never overwritten, and stats ignore Skipped.',
    ],
  },
  {
    id: 'S-258', feature: 'Board day stamp', title: 'A day\'s date stamp is the date most of its cards were logged on', persona: 'superset-builder', brief: 'feature-map',
    steps: [
      'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
      'Tick a card on one day, move it into another day\'s column, and read both columns\' date stamps.',
      'Move a ticked card into a day that has nothing else done, read its stamp, then move the card back home.',
    ],
    expected: [
      'The receiving day shows the date most of its own cards were logged on, not the moved card\'s earlier date. A day that holds only moved-in work shows no date, and a day with nothing done shows none.',
      'Back home the card keeps what it was ticked for at home and drops what it was ticked for while away, so the home day\'s stamp returns and the other day\'s goes.',
    ],
  },
  {
    id: 'S-259', feature: 'Supplement add sheet', title: 'One add sheet with one search over your supplements and the catalog', persona: 'diet-fresh', brief: 'supplement-add-redesign',
    steps: [
      'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
      'Open Daily, Nutrition, Manage, then Supplements and library and press + Add. Type "fish oil" in the search.',
      'Pick a catalog result and read the amounts shown, then choose a time of day and a dose.',
    ],
    expected: [
      'One search lists your own supplements and the catalog together, each result showing brand, form and label year.',
      'The picked product shows its UPC and label amounts inline. (The "Open the full form, with amounts" link shows before a pick or for a typed name, not after a catalog pick.)',
    ],
  },
  {
    id: 'S-260', feature: 'Supplement label lookup', title: 'A catalog supplement arrives with its vitamins, minerals and ingredient rows', persona: 'diet-fresh', brief: 'supplement-label-amounts',
    steps: [
      'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
      'Pick a catalog fish oil in the add sheet (it needs the NIH database to answer from QA) and read the label preview before pressing Add.',
    ],
    expected: [
      'The sheet shows "In one serving" with its vitamin and mineral rows and "Also on the label" for the rest; omega-3, EPA and DHA (and creatine or caffeine on those labels) are saved as ingredient rows, not listed under Also on the label.',
      'If NIH does not answer, the add still works: the sheet says it could not load the product\'s amounts (with Try again) and you can type them.',
    ],
  },
  {
    id: 'S-261', feature: 'Supplement UPC', title: 'Type a UPC and the product fills the add sheet search', persona: 'diet-fresh', brief: 'supplement-barcode-search',
    steps: [
      'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
      'In the add sheet type the UPC of a Thorne or Sports Research bottle you have (it is found only if the crawl stored it), then type a number that is on no label.',
    ],
    expected: [
      'A stored UPC fills the search with the product name and its exact catalog listing; an unknown number says it was not found and offers the label scan.',
    ],
  },
  {
    id: 'S-262', feature: 'Supplement UPC', title: 'Scan a bottle label when the product is not in NIH', persona: 'diet-fresh', brief: 'supplement-label-scan', device: true,
    steps: [
      'Press Reset on Diet, fresh first (switch to another account to do it), then switch back.',
      'On a phone, press + Add, type a name the catalog lacks, press "Scan the bottle’s label" and photograph a label; read "Uses AI · N of 5 left today".',
    ],
    expected: [
      'The label is read into vitamin, mineral and ingredient rows to review before saving; the allowance line counts down (5 a day per person); at the cap it says so. On a typed supplement, "Scan label" shows the label beside its rows and "Replace with label amounts" changes the form only; nothing saves until Save.',
    ],
  },
  {
    id: 'S-263', feature: 'Supplement add sheet', title: 'All 28 nutrients are offered in grouped pickers', persona: 'vitamin-tracker', brief: 'supplement-more-nutrients',
    steps: [
      'Press Reset on Vitamin tracker first (switch to another account to do it), then switch back.',
      'Edit a supplement, press "+ Add a nutrient", and read the picker. Then open One-off food on Nutrition, "Vitamins and minerals (optional)" and its "+ Add a nutrient".',
    ],
    expected: [
      'Both pickers offer all 28 nutrients, grouped under headings. A new row starts on a nutrient the item does not have yet, and choosing one it already has says "X in mg is listed twice; only the first is kept." on the supplement form and "X is listed twice; only the first is kept." on the food form.',
    ],
  },
  {
    id: 'S-264', feature: 'Backup coverage', title: 'A backup keeps recipes and supplements and says what Replace does', persona: 'recipe-collector', brief: 'backup-coverage-followups',
    steps: [
      'Press Reset on Recipe collector first (switch to another account to do it), then switch back.',
      'In Settings, Data, export a backup, then open the import review for that file.',
    ],
    expected: [
      'The review counts 30 recipes (a Supplements row only for an account that has supplements) and its Replace note says plainly what is replaced; a copy that lost recipes does not look as full as one that kept them.',
    ],
  },
  {
    id: 'S-265', feature: 'Watch link', title: 'The video link looks the same on a recipe, the Board card, Stretches and the Stretch library', persona: 'recipe-collector', brief: 'ideas-card-filters-watch',
    steps: [
      'Press Reset on Recipe collector first (switch to another account to do it), then switch back.',
      'First add a video link to a recipe and to an exercise and a stretch (no QA account has any), then read the recipe\'s Watch link and open that Board card, Stretches and the Stretch library.',
    ],
    expected: [
      'Each shows the same "Watch on <site>" link with a play icon (a large tile on the recipe, compact on the Board card, Stretches and the Stretch library), at least 44 px tall; nothing else on the Board card moved (the Board is hands-off: compare it with before).',
    ],
  },
  {
    id: 'S-266', feature: 'Plan labels', title: 'Lifetime shows its plan and nothing to pay', persona: 'lifetime', brief: 'feature-map',
    steps: [
      'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
      'Read the plan line and the buttons under it.',
    ],
    expected: [
      'The panel says "Plan:" with the lifetime plan name and "Nothing to pay."; there is no Plus buy button.',
    ],
  },
  {
    id: 'S-267', feature: 'Plan labels', title: 'Founder shows its plan and nothing to pay', persona: 'founder', brief: 'feature-map',
    steps: [
      'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
      'Read the plan line and the buttons under it.',
    ],
    expected: [
      'The panel says "Plan:" with the founder plan name and "Nothing to pay."; there is no Plus buy button.',
    ],
  },
  {
    id: 'S-268', feature: 'Plan labels', title: 'Legacy beta says its plan is set by the owner', persona: 'legacy-beta', brief: 'feature-map',
    steps: [
      'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
      'Read the plan line.',
    ],
    expected: [
      'The panel says "Your plan is set by the owner." and offers no way to buy.',
    ],
  },
  {
    id: 'S-269', feature: 'Plan labels', title: 'A failed payment shows a warning and a way to fix it', persona: 'paid-past-due', brief: 'feature-map', edge: true,
    steps: [
      'Open Settings and find the Billing panel (it only shows when billing is on for the server; if it is missing, note that and stop).',
      'Read the plan line, then press Manage billing if it is there (do not complete anything in Stripe).',
    ],
    expected: [
      'The plan is still paid; the seeded plan comes from Stripe (seedPersona.ts), so the panel says "Plan: Plus", then "Payment failed. Update your card in Manage billing." and has no "Renews on" line. The seed has no Stripe customer, so the Manage billing button may be missing.',
    ],
  },
  {
    id: 'S-270', feature: 'Grocery list cap', title: 'The 501st item is refused', persona: 'grocery-at-cap', brief: 'feature-map',
    steps: [
      'Open Groceries, Shopping, and try to add one more item with Quick add (an item name no store has).',
      'Repeat from Inventory, Edit, if it has its own add box.',
    ],
    expected: [
      'The add is refused with "The list is full (500 items)." and the list stays at 500; Quick add and Inventory both say so; nothing is lost.',
    ],
  },
  {
    id: 'S-271', feature: 'Erased account', title: 'An erased account opens to empty screens', persona: 'erased-account', brief: 'feature-map',
    steps: [
      'Open the Board, the Program tab, Progress, Groceries and Daily, Nutrition in turn.',
      'Open Settings and read the Delete my data panel.',
    ],
    expected: [
      'Every screen shows its empty or first-run state with no program, no log and no groceries, and nothing errors; the Delete my data panel is still offered. The account is on a later data epoch, so another device that held old data resets rather than uploading it.',
    ],
  },
  {
    id: 'S-272', feature: 'Large history', title: 'Three years of history still opens and exports', persona: 'three-year-veteran', brief: 'feature-map',
    steps: [
      'Open Progress and move through its views and date ranges, then open History.',
      'In Settings, Data, press Export all data and wait for it to finish.',
    ],
    expected: [
      'Progress and History open within a few seconds and reach back about three years; the export completes and the file opens; the Board stays responsive after the large history loads.',
    ],
  },
  {
    id: 'S-273', feature: 'Issues filter', title: 'The Issues list filters by one Status dropdown', persona: 'new-user', brief: 'feature-map',
    steps: [
      'Sign in as an admin (the owner account). Open Settings, then Issues.',
      'Read the Status control: it is one dropdown, not a row of buttons. Open it and read the options, then pick each status in turn, then clear it with the x or All.',
    ],
    expected: [
      'Status is a single dropdown whose options carry their counts and which starts on Open; the list shows only that status; the x or All shows every issue. An account that is not an admin has no Issues panel.',
    ],
  },
  {
    id: 'S-274', feature: 'Scan keeps its day', title: 'A scanned food is logged to the day the scan began on', persona: 'meal-planner', brief: 'nutrition-board', device: true,
    steps: [
      'On a phone, open Nutrition and select yesterday (not today).',
      'Scan a food with the camera (a barcode or a label) and wait for the scanned-food panel. If the app lets you change the day while the panel is open, change it to today; if not, note that and carry on.',
      'Press Save and log it, then look at both yesterday and today.',
    ],
    expected: [
      'The food is logged to yesterday, the day the scan began on, not to whichever day was selected when Save and log it was pressed; today shows no new entry.',
    ],
  },
  {
    id: 'S-275', feature: 'Launcher shortcuts', title: 'Long-press the app icon: four shortcuts with their own icons', persona: 'new-user', brief: 'feature-map', device: true,
    steps: [
      'On an Android phone with Loadbearer installed (the Play app on wrapper version 6 or later, or the web app installed from Chrome), long-press the Loadbearer icon on the home screen.',
      'Read the menu, then open each shortcut in turn (Progress and Nutrition included), going back to the home screen between them.',
    ],
    expected: [
      'Four shortcuts are listed, each with its own icon (a barbell, a calendar tick, a rising line, a fork and knife); Progress opens the Progress tab and Nutrition opens the Nutrition screen inside Daily. An older Play wrapper shows fewer or no shortcuts: that is the old build, not a bug.',
    ],
  },
  {
    id: 'S-276', feature: 'Launcher shortcuts', title: 'Loadbearer is in the Android share list', persona: 'superset-builder', brief: 'share-target', device: true, edge: true,
    steps: [
      'On an Android phone with Loadbearer installed (the Play app or the web app installed from Chrome), open a YouTube video and choose Share.',
      'Look for Loadbearer in the share list and choose it.',
    ],
    expected: [
      'Loadbearer is listed in the share sheet for a plain-text link and opens "Save this link" over the board (S-30 covers saving it). A Play wrapper built before the share entry was added is missing from the list.',
    ],
  },
  {
    id: 'S-277', feature: 'Week to Shopping', title: 'Add missing to Shopping puts the week\'s missing ingredients on the list once', persona: 'meal-planner', brief: 'week-shopping',
    steps: [
      'Press Reset on Meal planner first (switch to another account to do it), then switch back. On Nutrition, plan two recipes that share an ingredient on days ahead (Add food, Recipes, pick the meal).',
      'Press Add missing to Shopping (in the toolbar on a wide screen; on a phone open Manage and press it there), then open Shopping.',
    ],
    expected: [
      'A notice reads "Added n to Shopping" (with "; m already there" when an ingredient was needed twice) and has an Undo button; on a phone the Manage sheet closes first so the notice shows on the board.',
      'Shopping lists each missing ingredient once; an ingredient already at home or already on the list is not added again.',
    ],
  },
  {
    id: 'S-278', feature: 'Week to Shopping', title: 'Undo takes back only what the tap added', persona: 'meal-planner', brief: 'week-shopping',
    steps: [
      'With a few Shopping items of your own and two planned recipes with missing ingredients, press Add missing to Shopping.',
      'Press Undo on the notice, check Shopping, then press Add missing to Shopping again.',
    ],
    expected: [
      'After Undo Shopping holds exactly the items it had before the tap, including yours, and the notice says Removed from Shopping.',
      'The second tap adds the same items again.',
    ],
  },
  {
    id: 'S-279', feature: 'Week to Shopping', title: 'The button is off when there is nothing to add, and last week adds nothing', persona: 'meal-planner', brief: 'week-shopping', edge: true,
    steps: [
      'On a day with nothing planned, read the button (toolbar on a wide screen, Manage on a phone). Then plan a recipe whose ingredients are all at home or already on Shopping and read it again.',
      'Pick a day in last week (the day dropdown on a phone, Last week on a wide screen) and read the button again.',
    ],
    expected: [
      'Add missing to Shopping is dimmed with nothing to add, and turns on when a planned recipe has an ingredient that is not at home or on the list.',
      'On last week the button is gone from a wide screen\'s toolbar and dimmed in a phone\'s Manage sheet (it adds nothing there).',
    ],
  },
  {
    id: 'S-280', feature: 'Week to Shopping', title: 'An item already eaten adds nothing', persona: 'meal-planner', brief: 'week-shopping', edge: true,
    steps: [
      'Plan a recipe with an ingredient you do not have for today (plan it for a day ahead and move it to today), then tick it as eaten.',
      'Read Add missing to Shopping.',
    ],
    expected: [
      'The ticked item is skipped: with nothing else planned the button is dimmed, and a tap with other planned recipes adds only their ingredients.',
    ],
  },
  {
    id: 'S-281', feature: 'Add food any day', title: 'Tap an earlier day and log what you ate on it', persona: 'diet-on-target', brief: 'nutrition-any-day-add',
    steps: [
      'Open Daily, Nutrition. On a phone use the day stepper; on a wide screen tap the name of an earlier day this week (or in last week). Read the line beside + Add food.',
      'Press + Add food, One-off food, enter "Toast", 120 kcal and 4 g protein, and press Add. Read the message and the day\'s column.',
      'Tap today\'s name, then reload the page.',
      'Tap the name of a day after today and press + Add food.',
    ],
    expected: [
      'The toolbar reads "Adding to <that day>" and offers + Add food, Scan and log, Quick add and One-off food, as it does on today.',
      'One sentence says "Added Toast." The food shows in that day\'s "Not in a meal" list and that day\'s Calories and Protein meters rise by 120 kcal and 4 g; today\'s meters do not move.',
      'Reload opens on today (the address is unchanged by the picked day).',
      'A day ahead lists only Recipes and Saved meals, which plan items (S-200).',
    ],
  },
  {
    id: 'S-282', feature: 'Move and copy eaten', title: 'Copy an eaten food to another day', persona: 'diet-on-target', brief: 'nutrition-move-copy-eaten',
    steps: [
      'In today\'s Also eaten list tap the Greek yogurt row and press Copy to…. Read the days offered.',
      'Pick an earlier day. Read the message, then that day\'s column and today\'s list.',
      'Tap the copy on that earlier day and read its sheet.',
    ],
    expected: [
      'Today and earlier days are offered, never the food\'s own day and never a day ahead.',
      'A sentence says "Added 1 from Greek yogurt." The original stays in today\'s list. The copy shows on the earlier day under "Not in a meal" with the same calories, protein, carbs and fat, and that day\'s meters rise by the same amount.',
      'The copy\'s sheet offers Edit, Delete, Move to… and Copy to… like any eaten row.',
    ],
  },
  {
    id: 'S-283', feature: 'Move and copy eaten', title: 'Move an eaten food to another day, undo it, and hit the daily limit', persona: 'diet-on-target', brief: 'nutrition-move-copy-eaten', edge: true,
    steps: [
      'Tap the Greek yogurt row on today, press Move to… and pick an earlier day. Read the notice, then both days\' lists.',
      'Press Undo on the notice and read both days\' lists again.',
      'Add one-off foods to an earlier day until it holds 20, then copy a food from today to that day.',
    ],
    expected: [
      'The notice reads "Moved Greek yogurt to <day>." with Undo. The food leaves today\'s list and appears on that day; both days\' meters follow.',
      'Undo puts the original back on today and takes the moved copy away: nothing is doubled and no other entry changes.',
      'The copy is refused with "You can log 20 things a day." and nothing is added.',
    ],
  },
  {
    id: 'S-284', feature: 'Usual portion', title: 'A changed portion becomes the food\'s usual, and Undo puts the old one back', persona: 'recipe-collector', brief: 'nutrition-usual-portion',
    steps: [
      'In Recipes press Log on a recipe, change the portion from the amount the sheet opened at and press Log it. Read the notice.',
      'Press Log on the same recipe again and read the portion the sheet opens at. Log it at that portion and read the notice area.',
      'Log a different amount, then press Undo on the notice. Open Log again.',
    ],
    expected: [
      'The notice reads "Usual portion saved: <amount>." and the entry is logged.',
      'The sheet opens on the saved portion. Logging at it shows no notice and rewrites nothing.',
      'Undo puts the previous usual (or none) back and keeps the logged entry. If the usual was changed after that log, Undo says "The usual portion was changed since, so it was left as it is." Planning a day ahead never changes the usual.',
    ],
  },
  {
    id: 'S-285', feature: 'Saved meals removal', title: 'Saved meals come from Recipes only, and a planned meal whose recipe is gone shows as removed', persona: 'meal-planner', brief: 'saved-meals-removal',
    steps: [
      'Open Recipes, Meals and rename "Chicken bowl" to "Chicken bowl 2". Open Nutrition, + Add food, Saved meals and read the list.',
      'Plan "Quick dinner" for a day ahead, then delete the Quick dinner meal in Recipes (More actions, Delete).',
      'Open that day on the Nutrition board and the planner.',
    ],
    expected: [
      'Saved meals lists the Recipes meals, with the new name; there is no separate old list or "waiting" note.',
      'The planned item is on the day ahead until the meal is deleted.',
      'After the delete the planned item shows the existing removed state, not a crash, and Remove clears it.',
    ],
  },
  {
    id: 'S-286', feature: 'Saved meals removal', title: 'With Recipes full, the old saved meals stay and a note says to make room', persona: 'recipes-full', brief: 'saved-meals-removal', edge: true,
    steps: [
      'Sign in to this account on QA, open Recipes and read the count, then open Nutrition, + Add food and Saved meals.',
      'Read the note on the list, then tap "Chicken bowl".',
      'Delete one recipe in Recipes, reload the app and open Saved meals again.',
    ],
    expected: [
      'Recipes holds 300 recipes, so the four saved meals could not move into it.',
      'The old list is still offered with a note: "Some saved meals are waiting because Recipes is full (300 recipes). Delete a recipe to make room in Recipes and they move in the next time the app opens." One tap logs the meal as before.',
      'After one delete and a reload exactly one saved meal (Usual breakfast, the first) has moved into Recipes, which is full again; Chicken bowl, Post-workout and Quick dinner stay listed with the note.',
    ],
  },
  {
    id: 'S-287', feature: 'Daily snacks', title: 'Save a daily snack list; it shows every day, and ticking or skipping changes one day', persona: 'meal-planner', brief: 'daily-snacks',
    steps: [
      'On Nutrition read today\'s Snack section, then press Set up daily snacks. Press Add snack, pick Overnight oats, press Back to the list, step its portion up once and press Done.',
      'Read Snack on today and on a day later in the week. Reload and read Snack again.',
      'Tick the Overnight oats snack on today. Read tomorrow\'s Snack.',
      'On a day later in the week press Skip today on the snack and press Tap again to skip. Read that day and the day after it.',
      'Open Daily snacks, press Remove beside the snack and press Tap again to remove.',
    ],
    expected: [
      'Before setup Snack sits between Lunch and Dinner and says "No daily snacks yet". The sheet says "No daily snacks yet. Add the ones you always buy and eat." and, once saved, lists the snack with its calories and "× 1.5".',
      'The snack shows in Snack on every day from today to two weeks ahead with nothing copied into each day, and it is still there after the reload.',
      'Today\'s snack is ticked and the day\'s Calories meter moves; tomorrow\'s copy is unticked.',
      'The snack is gone from that one day only; the day after still shows it and the list is unchanged.',
      'The snack leaves the list and no day shows it any more. Anything already ticked eaten stays in the log.',
    ],
  },
  {
    id: 'S-288', feature: 'Daily snacks', title: 'A daily snack can still be ticked on a day that holds 8 planned things', persona: 'meal-planner', brief: 'snacks-day-cap', edge: true,
    steps: [
      'Save one daily snack (S-287 step 1). On a day later in the week plan recipes and saved meals into Breakfast, Lunch and Dinner until the day holds 8 planned things outside Snack, then try a ninth.',
      'Tick the daily snack on today after filling today the same way, or move the snack\'s card to another day in Snack.',
      'Move a card from Snack into Dinner on that full day.',
    ],
    expected: [
      'The eighth planned thing is added and the ninth is refused with a notice; nothing extra is added. The listed snack still shows in Snack.',
      'The snack ticks (or moves) normally and is never refused for a full day; it does not count toward the 8.',
      'Moving it into Dinner counts it as planned there, so on a full day that move is refused and the snack stays in Snack.',
    ],
  },
  {
    id: 'S-289', feature: 'Daily snacks', title: 'Add missing to Shopping includes the listed daily snacks', persona: 'meal-planner', brief: 'snacks-into-shopping',
    steps: [
      'Press Reset on Meal planner first (switch to another account to do it), then switch back. Save one daily snack whose recipe has an ingredient that is not at home and not on Shopping, and plan nothing else that needs it.',
      'Press Add missing to Shopping (toolbar on a wide screen; on a phone open Manage and press it there). Open Shopping.',
      'Skip the snack on every day shown, and press Add missing to Shopping again. Then tick the snack on today and press it once more.',
    ],
    expected: [
      'The button is enabled although only a snack is missing something. The notice reads "Added n to Shopping" with Undo, and Shopping lists the snack\'s missing ingredient once, however many days show the snack.',
      'Shopping shows each ingredient once and nothing already at home or already on the list.',
      'With the snack skipped on every day the button adds nothing; a snack already ticked eaten on a day is not counted again from that day.',
    ],
  },
  {
    id: 'S-290', feature: 'Joined week and day tabs', title: 'Board on a phone: the week row and D1 to D7 are one pinned card under the filter row', persona: 'heavy-logger', brief: 'week-day-joined-tabs',
    steps: [
      'On a phone (375 px wide) open Board. Read the order from the top: Injury prevention and filter row, week arrows, D1 to D7, Body weight, then any notices.',
      'Scroll down through the exercise cards. Tap another day tab, then press the Right arrow and Home on the keyboard.',
      'Press Next week, then This week.',
    ],
    expected: [
      'One bordered card holds the week arrows on top and the seven day tabs under them, the selected day underlined; there is no separate week bar above the filter row. Body weight sits under the card.',
      'The whole card stays pinned at the top while the cards scroll. A tapped tab selects its day and the page returns to the top; the arrow keys, Home and End move between tabs.',
      'The week changes and the tabs show that week\'s counts, a Rest day tab keeps "Rest" and a finished day keeps its check.',
    ],
  },
  {
    id: 'S-291', feature: 'Joined week and day tabs', title: 'Stretches on a phone: Sun to Sat with counts in the same card, one-line week row', persona: 'heavy-logger', brief: 'week-day-joined-tabs',
    steps: [
      'On a phone (375 px wide) open Board, then Stretches. Read the card.',
      'Tick all of one day done, then read its tab.',
    ],
    expected: [
      'The card holds the week arrows with the dates on one line and seven tabs, Sun to Sat, each with its count; there is no "N of 7 days done" line and the card stays pinned while scrolling.',
      'That day\'s tab shows the check.',
    ],
  },
  {
    id: 'S-292', feature: 'Joined week and day tabs', title: 'Nutrition on a phone: week switcher and seven day tabs in the card, Manage at the right', persona: 'meal-planner', brief: 'week-day-joined-tabs',
    steps: [
      'On a phone (375 px wide) open Nutrition. Read the top, then tap Fri.',
      'Press Next week, read the selected day, then tap Sat. Press Previous week twice, then This week.',
      'Read the row under the add-food buttons.',
    ],
    expected: [
      'One card holds the week switcher and Sun to Sat with the date numbers, today marked and selected; there is no day dropdown and no Previous day or Next day buttons. Tapping Fri shows Fri and the toolbar says "Adding to Fri".',
      'Next week selects its first day; Last week selects its first day; This week goes back to today. Each week shows its own seven days.',
      'Manage is a text link at the right end of its row.',
    ],
  },
  {
    id: 'S-293', feature: 'Joined week and day tabs', title: 'The card on the smallest phone and at large text', persona: 'heavy-logger', brief: 'week-day-joined-tabs', edge: true,
    steps: [
      'Set the screen to 320 px wide and the text size to 200%. On Board, Stretches and Nutrition read the card.',
      'Scroll sideways.',
    ],
    expected: [
      'The week arrows, dates and all seven tabs are inside the card; a tab\'s text wraps inside its cell and every tab is still at least 44 px tall.',
      'Nothing scrolls sideways.',
    ],
  },
  {
    id: 'S-294', feature: 'Joined week and day tabs', title: 'Nutrition on a tablet or small desktop: the card with the days on screen shaded, no day dropdown', persona: 'meal-planner', brief: 'week-day-joined-tabs',
    steps: [
      'Make the window 1024 px wide and open Nutrition. Read the top, then tap the first day tab that is not shaded.',
      'Tap a shaded day tab, then press Next week and tap a day.',
      'Make the window 768 px wide, then 1280 px, then 1440 px.',
    ],
    expected: [
      'One card holds the week arrows, This week or its dates, Manage at the right end, Sun to Sat under them, and the add-food toolbar under a hairline; there is no day dropdown and no Previous day or Next day buttons. Three day tabs are lightly shaded, with a bar on their top edge, and match the three columns shown (a screen reader says "shown below").',
      'A tab outside the shade moves the columns to start at it (held inside the week) and the shade follows; a shaded tab keeps the columns where they are and moves the underline. The toolbar says "Adding to" the underlined day.',
      'At 768 px two tabs are shaded, at 1280 px three. At 1440 px the card stays but has no day tabs: the week switcher, dates, Manage and the add-food toolbar are in it above seven columns.',
    ],
  },
  {
    id: 'S-296', feature: 'Joined week and day tabs', title: 'Nutrition on a desktop: the week row and the add-food toolbar are one card', persona: 'meal-planner', brief: 'week-day-joined-tabs',
    steps: [
      'Make the window 1920 px wide and open Nutrition. Read the top of the page, then press Add food and close the sheet.',
      'Make the window 1000 px wide, then 700 px, and read the card again.',
      'Make the window 375 px wide.',
    ],
    expected: [
      'At 1920 px one bordered card holds the week arrows, This week and its dates at the left, Manage at the right end, and under a hairline "Adding to ..." at the left with Add missing to Shopping, Scan and log, Quick add, One-off food and Add food (last, highlighted) at the right end. The seven day columns start below the card. The buttons open what they opened before.',
      'At 1000 px and 700 px the seven day tabs sit between the week row and the toolbar, inside the same card; at 700 px the buttons wrap onto a second line inside the card and nothing runs past its border.',
      'At 375 px the layout is the phone one: the card has the week and the day tabs only, and the add buttons are in their own row below it.',
    ],
  },
  {
    id: 'S-295', feature: 'Desktop week card', title: 'Board on a desktop: one card with the week, mode, body weight and filters, notices under it', persona: 'heavy-logger', brief: 'feature-map',
    steps: [
      'On a desktop (1280 px wide) open Board. Read the top from the Workout and Stretches buttons down.',
      'In the card, change the week with the arrows, pick Mode 2 and flip A and B, type a body weight and press Save, pick a muscle in Sort by muscle, pick an equipment, press Clear, and flip Injury prevention.',
      'Narrow the window to 768 px, then 701 px, then widen to 1920 px.',
    ],
    expected: [
      'Under Workout and Stretches there is one bordered card. Its first row has the week arrows, date range and This week at the left and the program switch, the mode menu and Body weight with Save at the right. Under a hairline, its second row has Sort by muscle, Equipment (and Clear once one is set) at the left and Injury prevention at the right.',
      'Every control does what it did before. The notices (the local-save tip, the unchecked-exercises notice) sit under the card, above the seven day columns, which are unchanged.',
      'At the narrower widths the rows wrap onto more lines inside the card; nothing runs past the card or scrolls sideways. On a phone the card does not exist: Board keeps the joined week and day card, with Body weight and the notices under it.',
    ],
  },
];

export const scenarioById = (id: string): Scenario | undefined => SCENARIOS.find(s => s.id === id);
/** The scenarios a persona runs (retired ones left out), in id order. */
export const scenariosForPersona = (personaId: string): Scenario[] => SCENARIOS.filter(s => s.persona === personaId && !s.retired);
