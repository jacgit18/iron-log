import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-265', feature: 'Watch link', title: 'The video link looks the same on a recipe, the Board card, Stretches and the Stretch library', persona: 'recipe-collector', brief: 'ideas-card-filters-watch',
  steps: [
    'Press Reset on Recipe collector first (switch to another account to do it), then switch back. It is seeded with three video links: the first recipe (Egg and spinach scramble), the first exercise of Program A (Sled push → lateral pull, the first card on the Board\'s Day 1) and a stretch (Hamstring stretch, in Stretches and the Stretch library). The three links go to placeholder videos, so tapping one opens a YouTube error page: that is expected, only how the link looks is checked.',
    'Read the recipe\'s Watch link, then open that Board card, Stretches and Program > Stretches > the Stretch library.',
  ],
  expected: [
    'Each shows the same "Watch on <site>" link with a play icon (a large tile on the recipe, compact on the Board card, Stretches and the Stretch library), at least 44 px tall; nothing else on the Board card moved (the Board is hands-off: compare it with before).',
  ],
};

export default scenario;
