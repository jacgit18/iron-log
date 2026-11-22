import { eatenMax, type Say } from '../../lib/eatenStep.js';
import { amountText } from '../../lib/foodUnit.js';
import { ALREADY_USUAL, nudgeSentence, offerNow, saveUsualLabel, STALE_OFFER, undoUsualOutcome, usualAfterStep, type UsualChange } from '../../lib/usualPortion.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { DietEntry, Recipe } from '../../types.ts';

/** One tap of Less or More on an eaten row (brief nutrition-log-first-portion-row): the entry takes `to` portions through `setDietPortion`; a food logged today from a recipe whose usual differs is offered a "Save N as my usual" button on the status line (button review N3: the nudge itself changes this entry only); the button saves `to` as that recipe's usual, said with an Undo that puts the usual back. The decisions are pure in `src/lib` (`stepEntryCount`, `usualAfterStep`, `undoUsualOutcome`); this only makes the store writes and says the sentence. */
export function stepEatenRow(e: DietEntry, to: number, recipe: Recipe | undefined, today: string, say: Say): void {
  const st = useAppStore.getState();
  const err = st.setDietPortion(e.id, to, eatenMax(recipe));
  if (err) { say(err); return; }
  const now = recipe ? useAppStore.getState().recipes.find(r => r.id === recipe.id) : undefined; // the recipe as it is now
  const change = usualAfterStep(e.d, today, now, to);
  if (!now || !change) return; // nothing to offer; the status line is left alone (an Undo or a message there still matters), and a Save offered earlier checks itself when pressed
  say(nudgeSentence(now.n, amountText(to, now)), undefined, { label: saveUsualLabel(amountText(to, now)), run: () => saveUsual(e.id, now.id, to, today, say) });
}

/** The offered button. It reads the entry and the recipe as they are now, not as they were at the nudge: if the entry no longer has `to` portions (nudged again, deleted) or the offer no longer applies, it saves nothing and says so; else it writes the usual, with an Undo that restores the usual as it stood now. A refusal says the store's words (the person pressed it, so silence would read as nothing happening). */
export function saveUsual(entryId: string, recipeId: string, to: number, today: string, say: Say): void {
  const st = useAppStore.getState();
  const entry = st.diet.find(x => x.id === entryId);
  const now = st.recipes.find(r => r.id === recipeId);
  const o = offerNow(entry, now, today, to);
  if (o.kind !== 'holds' || !now) { say(o.kind === 'already' ? ALREADY_USUAL : STALE_OFFER); return; }
  const change = o.change;
  const err = st.setRecipeUsual(now.id, change.next);
  if (err) { say(err); return; }
  say(`Usual portion saved: ${now.n}, ${amountText(to, now)}.`, () => undoStep(now.id, change, say));
}

export function undoStep(id: string, change: UsualChange, say: Say): void {
  const st = useAppStore.getState();
  const out = undoUsualOutcome(st.recipes.find(r => r.id === id), change);
  if (out.kind === 'gone') { say('This food was removed, so there is no usual to restore.'); return; }
  if (out.kind === 'changed') { say('The usual portion was changed since, so it was left as it is.'); return; }
  const err = st.setRecipeUsual(id, out.usual);
  say(err ? `${err} The usual was left as it is.` : 'Usual portion restored.');
}
