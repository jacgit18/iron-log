import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
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
};

export default scenario;
