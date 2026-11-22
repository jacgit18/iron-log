import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-89', feature: 'Barcode scan', title: 'A code in neither database offers a photo of the label', persona: 'diet-fresh', brief: 'barcode-coverage', device: true, edge: true,
  steps: [
    'On a phone, open + New, then Add a food, press Scan to fill form and scan something neither source knows (a book, a local product with no entry).',
    'Read the sheet, then press Photo the label.',
    'Take a photo of the product\'s nutrition label and check the form fills; close without saving.',
  ],
  expected: [
    'The sheet lists USDA and Open Food Facts as not found, with Type the name as the main button and Photo the label second (see S-93).',
    'Photo the label closes the sheet and opens the same camera as Scan label; the photo fills the form like any label scan.',
    'Nothing is saved until Save food.',
  ],
};

export default scenario;
