import { useState } from 'react';
import { amountText } from '../../lib/foodUnit.js';
import { undoUsual, usualChange, type UsualChange } from '../../lib/usualPortion.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';
import LogControl from './LogControl.js';

type Note = { text: string; change: UsualChange; id: string; stale?: true };

/** LogControl plus the usual-portion rule (brief nutrition-usual-portion), so every screen that logs a recipe behaves the same: a portion that differs from where the control opened becomes the food's usual,
 *  with a notice and its Undo, and the entry's own Undo takes the usual back too. The rule is `usualChange`; the write is `setRecipeUsual`, which touches nothing else on the recipe. */
export default function UsualLogControl({ recipe, day, onChange }: { recipe: Recipe; day?: string; onChange?: (done: boolean) => void }) {
  const [note, setNote] = useState<Note | null>(null);
  const remember = (logged: number) => {
    const st = useAppStore.getState();
    const now = st.recipes.find(r => r.id === recipe.id);
    const change = now ? usualChange(now, logged) : null;
    if (!now || !change) return;
    if (st.setRecipeUsual(now.id, change.next)) return; // refused: keep the old usual and say nothing
    setNote({ text: `Usual portion saved: ${amountText(logged, now)}.`, change, id: now.id });
  };
  const undo = () => {
    if (!note) return;
    const st = useAppStore.getState();
    const now = st.recipes.find(r => r.id === note.id);
    if (!now) { setNote({ ...note, text: 'This food was removed, so there is no usual to restore.', stale: true }); return; }
    const back = undoUsual(now.usual, note.change);
    if (!back) { setNote({ ...note, text: 'The usual portion was changed since, so it was left as it is.', stale: true }); return; }
    const err = st.setRecipeUsual(now.id, back.usual);
    if (err) setNote({ ...note, text: `${err} The usual was left as it is.` }); // keeps its Undo: the user can try again
    else setNote(null);
  };
  return (
    <>
      <LogControl recipe={recipe} {...(day !== undefined ? { day } : {})} {...(onChange ? { onChange } : {})} onLogged={remember} onUndone={() => { if (note && !note.stale) undo(); }} />
      {note && <p className="note" role="status">{note.text} {!note.stale && <button type="button" className="btn sm ghost" onClick={undo}>Undo</button>}</p>}
    </>
  );
}
