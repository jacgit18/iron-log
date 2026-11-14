import type { Scenario } from '../scenarios.ts';

// ---- Receipt photos ----
const scenario: Scenario = {
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
};

export default scenario;
