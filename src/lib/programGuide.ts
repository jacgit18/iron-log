import { LS } from './storage.js';

// The first-time guide card on the Program tab (brief: briefs/program-tab-clarity). "Got it" hides it for good on this device, the same pattern as
// the plan-on-a-computer tip (`programOnComputer.ts`). Nothing in the copy says how Program A and B run on the Board: it only says to pick one to edit.
const KEY = 'hideprogramguide';

export const GUIDE_TITLE = 'New here? Four things to know';
export const GUIDE_STEPS = [
  { title: 'Pick a program', text: 'Program A and B are two programs you can edit. Use the switch to choose which one.' },
  { title: 'Pick a day, then edit it', text: 'Choose a day, then tap Edit on an exercise or + Add exercise.' },
  { title: 'Edits reach every week', text: 'Changes apply to every week that uses the program. Your logged sets never change.' },
  { title: 'Easier on a computer', text: 'A bigger screen makes planning easier. Open loadbearer.app there, then train with your phone.' },
] as const;

export const programGuideDismissed = (): boolean => LS.get(KEY) === 1;
export const dismissProgramGuide = () => { LS.set(KEY, 1); };
