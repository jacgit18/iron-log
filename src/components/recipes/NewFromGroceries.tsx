import { useMemo, useState } from 'react';
import { pillText, sweepFoods, TYPE_CHOICES, typeLabel, waitingFoods } from '../../lib/newFromGroceries.js';
import { useAppStore } from '../../store/useAppStore.js';
import { MAX_RECIPES } from '../../shared/recipes.js';
import Icon from '../Icon.js';
import './NewFromGroceries.css';

const DISMISS_KEY = 'ironlog:nfg-sweep-dismissed'; // this device: the sweep's own pill stays hidden after Not now (the waiting Foods always show)
const dismissedBefore = (): boolean => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };

// "N new from groceries" (brief groceries-make-foods): a collapsed row at the top of Foods > Store-bought. The Foods a grocery add made wait here for a look: a type chip,
// Looks right, and (when there are no numbers yet) a way into the Food's form to scan or type them. The opt-in sweep for list items that have no Food sits under them.
// Logic: lib/newFromGroceries.ts; the store actions are in recipesSlice.
export default function NewFromGroceries({ onAddNutrition }: { onAddNutrition: (id: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const items = useAppStore(s => s.grocery.items);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set()); // items unticked in the preview (dish soap is not a food)
  const [dismissed, setDismissed] = useState(dismissedBefore);
  const waiting = waitingFoods(recipes);
  const sweep = useMemo(() => sweepFoods(items, recipes), [items, recipes]);
  const label = pillText(waiting.length) ?? (sweep.candidates.length && !dismissed ? `${sweep.candidates.length} list ${sweep.candidates.length === 1 ? 'item has' : 'items have'} no Food` : null);
  if (!label) return note ? <p className="note nfg-note" role="status">{note}</p> : null;
  const act = useAppStore.getState;
  const makeAll = () => {
    const r = act().makeFoodsFromItems(sweep.candidates.filter(c => !skip.has(c.item.id)).map(c => c.item.id));
    setNote(`${r.made ? `Made ${r.made} ${r.made === 1 ? 'Food' : 'Foods'}.` : 'Nothing to make.'}${r.waiting ? ` Foods is full (${MAX_RECIPES}): ${r.waiting} ${r.waiting === 1 ? 'item is' : 'items are'} waiting.` : ''}`);
  };
  const ticked = sweep.candidates.filter(c => !skip.has(c.item.id)).length;
  const notNow = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* not stored: hidden until the page reloads */ } setDismissed(true); setOpen(false); };
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
                    <button type="button" className="btn sm" aria-label={`Looks right for ${f.n}`} onClick={() => act().confirmGroceryFoods([f.id])}>Looks right</button>
                  </li>
                ))}
              </ul>
              {waiting.length > 1 && <div className="rc-actions"><button type="button" className="btn primary" id="nfg-all" onClick={() => act().confirmGroceryFoods()}>Looks right for all</button></div>}
            </>
          )}
          {sweep.candidates.length > 0 && (
            <div className="nfg-sweep">
              <h3 className="nfg-h">Make Foods from my existing items</h3>
              <p className="note">These list items match no Food. Untick what is not a food (dish soap, batteries). Nothing is made until you tap the button.</p>
              <ul className="nfg-preview">
                {sweep.candidates.map(c => (
                  <li key={c.item.id}>
                    <label className="nfg-tick"><input type="checkbox" checked={!skip.has(c.item.id)} onChange={e => setSkip(prev => { const n = new Set(prev); if (e.target.checked) n.delete(c.item.id); else n.add(c.item.id); return n; })} /> {c.item.n} <span className="nfg-guess">{typeLabel(c.type)}</span></label>
                  </li>
                ))}
              </ul>
              <div className="rc-actions">
                <button type="button" className="btn" id="nfg-sweep" disabled={!ticked} onClick={makeAll}>Make {ticked} {ticked === 1 ? 'Food' : 'Foods'}</button>
                {!waiting.length && <button type="button" className="btn ghost" id="nfg-notnow" onClick={notNow}>Not now</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
