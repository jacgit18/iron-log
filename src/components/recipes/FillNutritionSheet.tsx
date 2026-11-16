import { useEffect, useMemo, useState } from 'react';
import { macroLine } from '../../lib/macroLine.js';
import { resolveLines, type Resolve } from '../../lib/ingredientsClient.js';
import { applyFill, breakdownFor, countedLines, countedText, couldCount, failureText, fillLines, fillNumbers, fillRows, fillWrites, hasNumbers, savedText, unsentCount, validServings, type FillMode, type RowState } from '../../lib/recipeFill.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import MealMicroBars from './MealMicroBars.js';
import './FillNutritionSheet.css';

const STATE_TEXT: Record<RowState, string> = { sure: 'Sure', check: 'Check', none: 'No match', retry: 'Try again', skip: 'Left out' };
const GRAMS_FROM = { text: 'from the text', converted: 'converted', guess: 'a guess' } as const;

// Fill nutrition (brief recipe-auto-nutrition, preview flow A): the recipe's ingredient lines go to the server, the matched USDA foods come back as one row per line, and Save writes the numbers per serving.
// `modal.id` is the recipe; `modal.onSaved(text, undo)` tells the recipe page what to say and what Undo does. Nothing is saved until Save.
export default function FillNutritionSheet({ id }: { id: string }) {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const recipe = useAppStore(s => s.recipes.find(r => r.id === id));
  const lines = useMemo(() => (recipe ? fillLines(recipe) : []), [recipe]);
  const unsent = recipe ? unsentCount(recipe) : 0;
  const [answer, setAnswer] = useState<Resolve | null>(null);
  const [off, setOff] = useState<ReadonlySet<number>>(new Set());
  const [servingsText, setServingsText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!lines.length) return;
    const ctl = new AbortController();
    void resolveLines(lines, ctl.signal).then(r => { if (!ctl.signal.aborted) setAnswer(r); });
    return () => ctl.abort(); // Cancel (or any close) ends the request; nothing is saved
  }, [lines.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps -- the request is for the lines the sheet opened with
  if (!recipe) return <Sheet className="fillsheet"><h2 className="cond">Fill nutrition</h2><p className="note">That recipe is gone.</p><div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Close</button></div></Sheet>;

  const needServings = !recipe.servings;
  const typed = Number(servingsText.trim());
  const servings = recipe.servings ?? (validServings(typed) ? typed : 0);
  const got = answer?.ok ? answer.lines : null;
  const rows = got ? fillRows(got) : [];
  const filled = got ? fillNumbers(got, off, servings) : null;
  const bars = got && servings ? breakdownFor(got, off, servings) : null;
  const counted = got ? countedLines(got, off).length : 0;
  const total = got ? couldCount(got) + unsent : 0;
  const anyCountable = rows.some(r => r.countable);
  const choose = hasNumbers(recipe);
  const blanksWrite = !!filled && fillWrites(recipe, filled, 'blanks'); // false: every number is already typed, so "blanks" would change nothing
  const toggle = (i: number) => setOff(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const save = (mode: FillMode) => {
    if (!filled) return;
    const r = useAppStore.getState().fillRecipeNumbers(recipe.id, applyFill(recipe, filled, mode, servings));
    if (typeof r === 'string') { setError(r); return; }
    const onSaved = modal?.onSaved;
    if (typeof onSaved === 'function') (onSaved as (text: string, undo: () => boolean) => void)(savedText(filled.est.of, filled.est.n), r.undo);
    closeModal();
  };

  return (
    <Sheet className="fillsheet">
      <h2 className="cond">{recipe.est ? 'Fill again' : 'Fill nutrition'}: {recipe.n}</h2>
      {!answer && <p className="note" role="status">Working out {lines.length} ingredient{lines.length === 1 ? '' : 's'}…</p>}
      {answer && unsent > 0 && <p className="note">Only the first {lines.length} of {lines.length + unsent} ingredients were looked at; the other {unsent} count as not matched.</p>}
      {answer && !answer.ok && <p className="note" role="alert">{failureText(answer.reason, answer.reason === 'cap' ? answer.retryAfterSec : null)}</p>}
      {got && !anyCountable && <p className="note" role="status">None of the ingredients matched a food. Use Calculate from ingredients in the form.</p>}
      {got && (
        <>
          <p className="note">{servings ? `Per serving (÷ ${servings}), from ${counted} of ${total} ingredients.` : 'Enter the servings to see the numbers per serving.'} The foods and amounts are USDA data; the match and the grams are estimates.</p>
          {needServings && (
            <label className="fill-servings">Servings this makes
              <input type="number" inputMode="numeric" min={1} max={99} step={1} value={servingsText} onChange={e => setServingsText(e.target.value)} aria-describedby="fill-servings-note" />
              <span className="note" id="fill-servings-note">Needed to give numbers per serving.</span>
            </label>
          )}
          {filled && <p className="fill-macros">{macroLine(filled)} <span className="fill-flag">Estimated · {countedText(filled.est.of, filled.est.n)}</span></p>}
          <ul className="fill-rows" aria-label="Ingredients">
            {rows.map((r, i) => (
              <li key={i} className={`fill-row fill-${r.state}`}>
                {r.countable
                  ? <input type="checkbox" checked={!off.has(i)} onChange={() => toggle(i)} aria-label={`Count ${r.line}`} />
                  : <span className="fill-nobox" aria-hidden="true" />}
                <span className="fill-text">
                  <span className="fill-line">{r.line}</span>
                  {r.food && <span className="fill-food">{r.food}{r.grams !== undefined && <> · {r.grams} g{r.gramsFrom && ` (${GRAMS_FROM[r.gramsFrom]})`}</>}</span>}
                </span>
                <span className={`fill-state fill-s-${r.state}`}>{STATE_TEXT[r.state]}</span>
              </li>
            ))}
          </ul>
          {bars && <MealMicroBars breakdown={bars} />}
          {answer?.ok && answer.left !== null && <p className="note">{answer.left} fill{answer.left === 1 ? '' : 's'} left today.</p>}
        </>
      )}
      {got && anyCountable && choose && filled && <p className="note">Replace all changes the numbers the fill found; a number it could not find stays as you typed it.</p>}
      {got && anyCountable && choose && filled && !blanksWrite && <p className="note" role="status">Every number is already filled in, so there are no blanks. Replace all would change them.</p>}
      {error && <p className="note" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={closeModal}>{answer && !answer.ok ? 'Close' : 'Cancel'}</button>
        {got && anyCountable && choose && <button type="button" className="btn" disabled={!filled} onClick={() => save('replace')}>Replace all</button>}
        {got && anyCountable && choose && <button type="button" className="btn primary" disabled={!blanksWrite} onClick={() => save('blanks')}>Fill only the blanks</button>}
        {got && anyCountable && !choose && <button type="button" className="btn primary" disabled={!filled} onClick={() => save('blanks')}>Save</button>}
      </div>
    </Sheet>
  );
}
