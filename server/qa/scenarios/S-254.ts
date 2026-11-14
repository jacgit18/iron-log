import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-254', feature: 'Ideas filters', title: 'Status and Muscle dropdowns appear above six ideas', persona: 'superset-builder', brief: 'ideas-card-filters-watch',
  steps: [
    'Press Reset on Superset builder first (switch to another account to do it), then switch back.',
    'Open Workout, Ideas to try. Add ideas until there are seven (+ Add idea, a name and a muscle each). Pick a Status, then a Muscle, then type a search, then Clear.',
  ],
  expected: [
    'At six or fewer there are no filters; at seven the Status and Muscle dropdowns appear beside the search and the count reads "N of M"; choices combine with the search and Clear resets all three. A new idea added by manual + Add idea goes last.',
  ],
};

export default scenario;
