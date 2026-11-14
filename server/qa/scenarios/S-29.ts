import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
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
};

export default scenario;
