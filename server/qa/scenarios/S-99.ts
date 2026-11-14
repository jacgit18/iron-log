import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-99', feature: 'Link previews', title: 'Pasting the app address into a chat app shows a title, description and picture', persona: 'new-user', brief: 'share-preview-sitemap', device: true,
  steps: [
    'On a phone, paste the production address (https://loadbearer.app/; the QA page points its card picture and address at production, so production is the one to try) into a chat message to yourself in a chat app (Messages, WhatsApp or similar) and read the card it shows.',
    'Read the title, the description and the picture on the card.',
  ],
  expected: [
    'The card is titled "Loadbearer: a weekly training board that remembers your lifts" with the description "A weekly workout board with A/B program rotation, phase-based targets, timers and a muscle map. Works offline."',
    'A wide picture (the Loadbearer logo beside the title line) shows on the card. A chat app that cached the address earlier may show an old card; try a different app or add ?x=1 to the address.',
  ],
};

export default scenario;
