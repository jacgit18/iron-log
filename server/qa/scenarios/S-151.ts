import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
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
};

export default scenario;
