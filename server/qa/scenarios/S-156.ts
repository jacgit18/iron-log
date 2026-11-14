import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-156', feature: 'Nutrition quick log', title: 'The sheet refuses a day ahead and a day too far back, and a full day says so', persona: 'recipe-collector', brief: 'nutrition-quick-log', edge: true,
  steps: [
    'Open the portion sheet from a Recipes row (the Log button), set Day to tomorrow and press Log it, then set a day more than 400 days back and press Log it. Then fill one day with 20 entries and open the sheet again.',
  ],
  expected: [
    'A day ahead says Pick today or an earlier day, and a day too far back says entries are kept for 400 days. A day with 20 entries says that is the limit and logs nothing more.',
  ],
};

export default scenario;
