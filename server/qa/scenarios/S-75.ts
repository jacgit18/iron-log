import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-75', feature: 'Barcode scan', title: 'A code that is not found, and no camera (retired 2026-11-13: needs a real camera, which the QA pane cannot supply; the miss ladder is covered by e2e/barcodeMissLadder.spec.js)', persona: 'diet-fresh', brief: 'barcode-scan', retired: true, edge: true,
  steps: [
    'Open + New, then Add a food, press Scan to fill form and scan something that is not in USDA (a book\'s barcode, a store-brand item, a local product).',
    'Close the sheet. In your browser settings block the camera for the site, press Scan to fill form again, and press Photo instead with a saved photo of a barcode (or of a table).',
  ],
  expected: [
    'The sheet says "That barcode is not in USDA or Open Food Facts." with a Tried list (USDA: not found, Open Food Facts: not found), makes Type the name the main choice and offers Photo the label; scanning stops (no repeated lookups) and Close leaves the form empty and usable.',
    'With the camera blocked the sheet says "The camera is not available. Choose a photo of the barcode instead." and offers Photo instead; a photo with a readable barcode works, a table photo says it could not read one.',
  ],
};

export default scenario;
