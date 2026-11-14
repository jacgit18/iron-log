import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-106', feature: 'Program compare', title: 'All days lists every day under its own heading, and the filters apply to all of them', persona: 'superset-builder', brief: 'program-compare',
  steps: [
    'On a phone, open Program, Compare programs. In the Day strip the first button is "All days"; press it.',
    'Scroll down the list. Then press Filter, choose Same, and look at the headings and at the Filter button.',
    'Press the Day 3 button, then press All days again.',
  ],
  expected: [
    'Every day that has exercises is listed one after the other under its own heading ("Day 1", "Day 2" and so on); a day with no exercises has no heading. The All days button carries a count such as "· 42 differ", the total over the days, and each exercise is still one row with Program A over Program B.',
    'With Same chosen the headings stay and only the rows that match are left (fewer rows than before); the Filter button reads "Filter · 1 on".',
    'Day 3 alone shows only that day\'s rows with no day heading; All days brings the whole list back.',
  ],
};

export default scenario;
