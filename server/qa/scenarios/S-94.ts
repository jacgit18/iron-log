import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-94', feature: 'Barcode scan', title: 'The label count shows after a read, and a used-up day switches the label button off', persona: 'diet-fresh', brief: 'barcode-miss-ladder', edge: true,
  steps: [
    'As an admin, miss a scan and read the note under Photo the label; read a label; then miss another scan and read the note again.',
    'When the daily label cap is used up (a test server with SCAN_DAILY_MAX set to 1 is the quick way), miss a scan again and try the buttons.',
  ],
  expected: [
    'Before any label has been read in this session the note says only "Uses AI"; after one it says how many are left today, for example "Uses AI · 29 of 30 left today". The count is shared by the whole server, not by you.',
    'With none left, Photo the label is switched off with "Label photos are used up for today. Type the name instead."; Type the name still works.',
  ],
};

export default scenario;
