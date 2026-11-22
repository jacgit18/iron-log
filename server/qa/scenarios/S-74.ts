import type { Scenario } from '../scenarios.ts';

// ---- Barcode scan ----
const scenario: Scenario = {
  id: 'S-74', feature: 'Barcode scan', title: 'Scan a packaged food\'s barcode into a ready-made food', persona: 'diet-on-target', brief: 'barcode-scan', device: true,
  steps: [
    'On a phone, sign in with any account (barcode scan is open to everyone). On Recipes press + New, then Add a food, then Scan to fill form and allow the camera.',
    'Point the camera at the barcode of a packaged US food (cereal, a can, frozen gnocchi) until the sheet closes by itself.',
    'Check the picked product and its grams (its own serving), press Use, then compare the calories and protein with the printed label and press Save food.',
    'Repeat on the diet day: open Nutrition, press Add food, Find food and Scan to fill form, and scan a second product.',
  ],
  expected: [
    'The sheet reads the code within a few seconds, closes, and shows the product name (with brand) and its calories per 100 g; the grams start at the product\'s serving.',
    'Use fills the name, calories and protein (carbs and fat when USDA has them) for that serving; they match the label, and nothing is saved until Save food.',
    'The camera light goes off when the sheet closes. On the diet day the sheet comes back on Find food with the product picked, and Use fills the One-off food form the same way.',
  ],
};

export default scenario;
