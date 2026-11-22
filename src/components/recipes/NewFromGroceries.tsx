import { useMemo, useState } from 'react';
import { pillText, sweepFoods, TYPE_CHOICES, typeLabel, waitingFoods } from '../../lib/newFromGroceries.js';
import { useAppStore } from '../../store/useAppStore.js';
import { MAX_RECIPES } from '../../shared/recipes.js';
import Icon from '../Icon.js';
import './NewFromGroceries.css';

const PREVIEW_ROWS = 8;

// "N new from groceries" (brief groceries-make-foods): a collapsed row at the top of Foods > Store-bought. The Foods a grocery add made wait here for a look: a type chip,
// Looks right, and (when there are no numbers yet) a way into the Food's form to scan or type them. The opt-in sweep for list items that have no Food sits under them.
// Logic: lib/newFromGroceries.ts; the store actions are in recipesSlice.
export default function NewFromGroceries({ onAddNutrition }: { onAddNutrition: (id: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const items = useAppStore(s => s.grocery.items);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const waiting = waitingFoods(recipes);
  const sweep = useMemo(() => sweepFoods(items, recipes), [items, recipes]);
  const label = pillText(waiting.length) ?? (sweep.candidates.length ? `${sweep.candidates.length} list ${sweep.candidates.length === 1 ? 'item has' : 'items have'} no Food` : null);
  if (!label) return note ? <p className="note nfg-note" role="status">{note}</p> : null;
  const act = useAppStore.getState;
  const makeAll = () => {
    const r = act().makeFoodsFromItems();
    setNote(`${r.made ? `Made ${r.made} ${r.made === 1 ? 'Food' : 'Foods'}.` : 'Nothing to make.'}${r.waiting ? ` Foods is full (${MAX_RECIPES}): ${r.waiting} ${r.waiting === 1 ? 'item is' : 'items are'} waiting.` : ''}`);
  };
  return (
    <section className="nfg" aria-label="New from groceries">
      <button type="button" className="nfg-pill" id="nfg-pill" aria-expanded={open} aria-controls="nfg-panel" onClick={() => setOpen(!open)}>
        <span>{label}{waiting.length ? ' · Check' : ''}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} />
      </button>
      {note && <p className="note nfg-note" role="status">{note}</p>}
      {open && (
        <div className="nfg-panel" id="nfg-panel">
          {waiting.length > 0 && (
            <>
              <p className="note">Made when you added these to your grocery list. They work as they are; check the type.</p>
              <ul className="nfg-list">
                {waiting.map(f => (
                  <li key={f.id} className="nfg-row">
                    <b className="nfg-name">{f.n}</b>
                    <div className="nfg-chips" role="group" aria-label={`Type of ${f.n}`}>
                      {TYPE_CHOICES.map(c => <button type="button" key={c.key} className="pillbtn" aria-pressed={(f.type ?? 'ready') === c.key} aria-label={`Set ${f.n} to ${c.label}`} onClick={() => act().setGroceryFoodType(f.id, c.key)}>{c.label}</button>)}
                    </div>
                    {f.kcal === undefined && <span className="nfg-nonut">No nutrition yet <button type="button" className="btn sm ghost" aria-label={`Scan or type nutrition for ${f.n}`} onClick={() => onAddNutrition(f.id)}>Scan or type</button></span>}
                    <button type="button" className="btn sm" aria-label={`Confirm ${f.n}`} onClick={() => act().confirmGroceryFoods([f.id])}>Looks right</button>
                  </li>
                ))}
              </ul>
              {waiting.length > 1 && <div className="rc-actions"><button type="button" className="btn primary" id="nfg-all" onClick={() => act().confirmGroceryFoods()}>Looks right for all</button></div>}
            </>
          )}
          {sweep.candidates.length > 0 && (
            <div className="nfg-sweep">
              <h3 className="nfg-h">Make Foods from my existing items</h3>
              <p className="note">These list items match no Food. Nothing is made until you tap the button.</p>
              <ul className="nfg-preview">
                {sweep.candidates.slice(0, PREVIEW_ROWS).map(c => <li key={c.item.id}>{c.item.n} <span className="nfg-guess">{typeLabel(c.type)}</span></li>)}
                {sweep.candidates.length > PREVIEW_ROWS && <li className="nfg-guess">and {sweep.candidates.length - PREVIEW_ROWS} more</li>}
              </ul>
              <button type="button" className="btn" id="nfg-sweep" onClick={makeAll}>Make {Math.min(sweep.make.length, sweep.candidates.length)} {sweep.make.length === 1 ? 'Food' : 'Foods'}</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
