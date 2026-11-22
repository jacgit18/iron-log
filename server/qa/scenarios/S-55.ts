import type { Scenario } from '../scenarios.ts';

// ---- Usual amount ----
const scenario: Scenario = {
  id: 'S-55', feature: 'Usual amount', title: 'Log 4 eggs in two taps', persona: 'diet-on-target', brief: 'usual-amount-and-unit',
  steps: [
    'On Recipes press + New, then Add a food, name it Egg (large), type 72 calories and 6 protein, set Usual amount to 4 and One serving is called to egg, and press Save food.',
    'Look at the food\'s page: the Usual line, the Per line and the stepper. Press More once, then Less once.',
    'Press Ate this, look at today\'s eaten rows on Nutrition, then press Undo.',
  ],
  expected: [
    'The page says "Usual: 4 eggs", "Per egg: 72 kcal · 6 g protein" and the stepper opens at "4 eggs"; More shows "4.5 eggs".',
    'Ate this says "Logged 4 eggs of Egg (large) to today." and adds 288 calories to the day; Undo removes it. A food saved with neither box still opens at "1 portion".',
  ],
};

export default scenario;
