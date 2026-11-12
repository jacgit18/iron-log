import { useState } from 'react';
import { hasMacros } from '../../lib/dietLog.js';
import { dayRange } from '../../lib/logOrPlan.js';
import { amountText } from '../../lib/foodUnit.js';
import { pastFoodAsRecipe, pastFoodOf } from '../../lib/logPastFood.js';
import { undoUsual, usualChange, withUsual, type UsualChange } from '../../lib/usualPortion.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { openRecipesForm } from '../openRecipesForm.js';
import Sheet from '../Sheet.js';
import LogControl from './LogControl.js';
import './Diet.css';

// The portion sheet (brief nutrition-quick-log): a food's name and the shared LogControl (brief log-or-plan-control), which holds the portion, the day, Log or Plan and Undo.
// `modal.id` is the recipe, `modal.day` the day the screen shows (the control opens on it when it is a day it offers).
export default function PortionSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const recipe = useAppStore(s => s.recipes.find(r => r.id === modal?.id));
  const today = ymd(useToday(s => s.today));
  const [done, setDone] = useState(false);
  const [usualNote, setUsualNote] = useState<{ text: string; change: UsualChange; id: string; stale?: true } | null>(null); // "Usual portion saved" with its Undo
  const editInRecipes = () => { if (recipe) openRecipesForm({ kind: 'edit', id: recipe.id }); };
  const past = recipe ? null : pastFoodOf(modal?.food); // a food logged before with no recipe behind it (Find food): the same sheet and control, log only
  if (past) {
    const pastDay = typeof modal?.day === 'string' && modal.day >= dayRange(today).min && modal.day <= today ? modal.day : today;
    return (
      <Sheet className="portionsheet">
        <h2 className="cond">{past.n}</h2>
        {typeof modal?.day === 'string' && modal.day > today && <p className="note" role="status">A food you logged before can be logged for today or earlier, not planned. The day is set to today.</p>}
        <LogControl bare recipe={pastFoodAsRecipe(past)} day={pastDay} onChange={setDone} />
        <div className="actions">
          <button type="button" className="btn" onClick={closeModal}>{done ? 'Done' : 'Cancel'}</button>
        </div>
      </Sheet>
    );
  }
  if (!recipe) return <Sheet className="portionsheet"><h2 className="cond">Log a food</h2><p className="note">That food is gone.</p><div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Close</button></div></Sheet>;
  if (!hasMacros(recipe)) {
    return <Sheet className="portionsheet"><h2 className="cond">{recipe.n}</h2><p className="note">Add calories and protein per serving to log this.</p><div className="actions"><button type="button" className="btn" id="portion-edit" onClick={editInRecipes}>Edit in Recipes</button><button type="button" className="btn primary" onClick={closeModal}>Close</button></div></Sheet>;
  }
  // A portion that differs from where the sheet opened becomes this food's usual (brief nutrition-usual-portion); the rule is `usualChange`, the write is the same saveRecipe the Recipes form uses.
  const rememberUsual = (logged: number) => {
    const st = useAppStore.getState();
    const now = st.recipes.find(r => r.id === recipe.id);
    const change = now ? usualChange(now, logged) : null;
    if (!now || !change) return;
    if (st.saveRecipe(withUsual(now, change.next))) return; // refused: keep the old usual and say nothing
    setUsualNote({ text: `Usual portion saved: ${amountText(logged, now)}.`, change, id: now.id });
  };
  const undoUsualNote = () => {
    if (!usualNote) return;
    const st = useAppStore.getState();
    const now = st.recipes.find(r => r.id === usualNote.id);
    const back = now ? undoUsual(now.usual, usualNote.change) : null;
    if (now && back && !st.saveRecipe(withUsual(now, back.usual))) setUsualNote(null);
    else setUsualNote({ ...usualNote, text: 'The usual portion was changed since, so it was left as it is.', stale: true });
  };
  const { min, max } = dayRange(today);
  const day = typeof modal?.day === 'string' && modal.day >= min && modal.day <= max ? modal.day : today;
  return (
    <Sheet className="portionsheet">
      <h2 className="cond">{recipe.n}</h2>
      <LogControl recipe={recipe} day={day} onChange={setDone} onLogged={rememberUsual} />
      {usualNote && <p className="note" role="status">{usualNote.text} {!usualNote.stale && <button type="button" className="btn sm ghost" onClick={undoUsualNote}>Undo</button>}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={closeModal}>{done ? 'Done' : 'Cancel'}</button>
      </div>
    </Sheet>
  );
}
