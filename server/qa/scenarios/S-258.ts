import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-258', feature: 'Board day stamp', title: 'A day\'s date stamp is the date most of its cards were logged on', persona: 'superset-builder', brief: 'feature-map',
  steps: [
    'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
    'Tick two cards on Day 1 and read the stamps of Day 1 and Day 2. A ticked card moves into the collapsed Finished group, which has no More actions menu, so a card cannot be moved after it is ticked: move first, then tick.',
    'Move an unticked Day 1 card into Day 2 (card menu, Move), tick it there, and read both columns\' date stamps. Move it into a day that has nothing else done and tick it there, read that stamp, then Put it back (Finished group) and move the card back home.',
  ],
  expected: [
    'The receiving day shows the date most of its own cards were logged on, not the moved card\'s earlier date. A day that holds only moved-in work shows no date, and a day with nothing done shows none.',
    'Back home the card keeps what it was ticked for at home and drops what it was ticked for while away, so the home day\'s stamp returns and the other day\'s goes.',
  ],
};

export default scenario;
