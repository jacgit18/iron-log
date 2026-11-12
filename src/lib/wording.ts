// The wording table (brief subnav-pill-row-and-wording-table, audit A7): the one way a button says what it does. The same table is in ux/DESIGN-SYSTEM.md; this file is what the unit test checks.

export interface WordRule { say: string; when: string; notThis: readonly string[] }

export const WORDING: readonly WordRule[] = [
  { say: 'Add', when: 'add to a list that is on screen, or put an existing thing somewhere: "Add food", "Add to Mine", "Add set"', notThis: ['+ Add', 'Create'] },
  { say: '+ New <thing>', when: 'open a form or sheet to make something: "+ New recipe", "+ New exercise" (the plus stays: COMPONENTS.md Button wording, audit 2026-10-20)', notThis: ['+ Add <thing>', 'Create <thing>'] },
  { say: 'Delete', when: 'gone for good; two taps (ArmedButton, ADR 023)', notThis: ['Remove'] },
  { say: 'Remove', when: 'take it off a list; the thing itself stays', notThis: ['Delete'] },
  { say: 'Done', when: 'a sheet that applies changes as you go', notThis: ['Close'] },
  { say: 'Close', when: 'a sheet that only shows something', notThis: ['Done'] },
  { say: 'Food', when: 'a packaged food in Recipes: the tab is "Foods", one is a "Food" (its pill and category), the forms are "New food" and "Edit food"; the + New entry stays "Add a food by hand"', notThis: ['Ready-made', 'ready-made food'] },
  { say: 'Scan to fill <form>', when: 'a scan whose result lands in a form you still save: Find food and the Recipes food form say "Scan to fill form", + New says "Scan to fill a food form". The supplement add sheet scan says it too. The camera sheet, the Scan label photo button and the Nutrition way "Scan barcode" (it scans, then saves the food and logs it, not a form) keep their names (owner, 2026-11-12)', notThis: ['Scan barcode', 'Scan a food'] },
  { say: 'Save and Cancel', when: 'a form', notThis: ['Done'] },
  { say: 'Scan and log', when: 'a scan that saves the food to Recipes and logs it on the day: the Nutrition toolbar button and the Add food row (owner, 2026-11-12)', notThis: ['Scan barcode'] },
];

/** Create is only for an account or a program. */
const CREATE_OK = /^Create (an? )?(account|program)\b/i;

/** The rule a button label breaks, or null when it is fine. "+ New <thing>" opens a form and keeps its plus; "+ Add <thing>" is the old way to say it. */
export function bannedLabel(label: string): string | null {
  const t = label.trim();
  if (/^\+\s*Add\b/i.test(t)) return '"+ Add ..." is the old way to open a form: say "+ New ..." to open one, or "Add ..." to add to a list on screen';
  if (/^Create\b/i.test(t) && !CREATE_OK.test(t)) return '"Create" is only for an account or a program: say "+ New ..." for a form or "Add ..." for a list';
  return null;
}
