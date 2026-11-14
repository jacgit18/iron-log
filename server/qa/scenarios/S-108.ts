import type { Scenario } from '../scenarios.ts';

const scenario: Scenario = {
  id: 'S-108', feature: 'Ideas to try', title: 'The Board section for exercises you saw online is called Ideas to try, and adding one works as before', persona: 'superset-builder', brief: 'ideas-to-try-rename',
  steps: [
    'Open the Board, Workout, and scroll under the days. Read the heading and the button next to it.',
    'Press "+ Add idea", read the sheet\'s title, type Face Pull in Exercise, pick it from the list, add a note and press Save.',
    'On the new idea press the pencil (Edit) and read the sheet\'s title, then Cancel. Press "+ Add idea" again and add Face Pull a second time.',
    'On the idea press Add (the sheet opens with "This week only" chosen), press Day 3, and look at the card that appears on that day.',
  ],
  expected: [
    'The heading reads "Ideas to try" and the button "+ Add idea"; the word "Experiments" is nowhere on the page.',
    'The add sheet is titled "Add an exercise to try"; after Save the idea is listed under the heading with its note and an Add button.',
    'The edit sheet is titled "Edit idea". Adding Face Pull again is refused with "Face Pull is already on the Ideas to try list." and the sheet stays open.',
    'The notice reads "Added Face Pull to Day 3 this week" and the card on that day is tagged "To try"; the idea stays listed.',
  ],
};

export default scenario;
