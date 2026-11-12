import { useState } from 'react';
import { addSnack, removeSnack, setSnackPortion, snackPortion } from '../../lib/dailySnacks.js';
import { servingNumbers } from '../../lib/dietLog.js';
import { findMatches, MAX_FIND_MATCHES } from '../../lib/dietPlan.js';
import { macroLine } from '../../lib/macroLine.js';
import { MAX_DAILY_SNACKS } from '../../shared/diet.js';
import type { DailySnack } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import ArmedButton from '../ArmedButton.js';
import Sheet from '../Sheet.js';
import './DailySnacks.css';

// The Daily snacks sheet (brief daily-snacks): the snacks you always buy and eat, up to six, each a recipe or food with a portion. They show in Snack on today and the next two weeks;
// ticking or skipping one on a day only changes that day. Add snack opens a search of your recipes and foods with numbers.
export default function DailySnacksSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  const list = useAppStore(s => s.cfg.diet?.snacks) ?? NONE;
  const recipes = useAppStore(s => s.recipes);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const st = () => useAppStore.getState();
  const byId = (id: string) => recipes.find(r => r.id === id);
  const save = (next: typeof list) => { st().saveDailySnacks(next); setMsg(''); };
  const choices = findMatches(recipes.filter(r => r.kcal !== undefined && r.p !== undefined && !list.some(s => s.id === r.id)), q);
  const pick = (id: string) => { const r = addSnack(list, id); if (r.list === null) { setMsg(r.error); return; } save(r.list); setPicking(false); setQ(''); };

  return (
    <Sheet className="nbsheet" aria-label="Daily snacks">
      <h2 className="cond">Daily snacks</h2>
      {picking ? (
        <>
          <label className="field">Search your recipes and foods
            <input id="ds-search" type="search" autoComplete="off" value={q} onChange={e => setQ(e.target.value)} />
          </label>
          {choices.length > 0
            ? <ul className="nb-snacklist" aria-label="Recipes and foods">
              {choices.map(r => <li key={r.id} className="nb-snackrow"><span className="nb-snackname"><b>{r.n}</b><small>{macroLine({ kcal: servingNumbers(r, 1)?.kcal ?? 0, p: r.p ?? 0 })}</small></span><button type="button" className="btn sm" aria-label={`Add ${r.n} to daily snacks`} onClick={() => pick(r.id)}>Add</button></li>)}
            </ul>
            : <p className="note">{q.trim() ? 'No recipe or food with numbers matches that.' : 'Every recipe and food with numbers is already a daily snack.'}</p>}
          {choices.length >= MAX_FIND_MATCHES && <p className="note">Showing the first {MAX_FIND_MATCHES}. Type to narrow the list.</p>}
          {msg && <p className="note" role="status">{msg}</p>}
          <div className="actions"><button type="button" className="btn primary" onClick={() => { setPicking(false); setQ(''); setMsg(''); }}>Back to the list</button></div>
        </>
      ) : (
        <>
          <p className="note">These show in Snack on today and the next two weeks. Ticking or skipping one on a day only changes that day.</p>
          {list.length === 0 && <p className="note">No daily snacks yet. Add the ones you always buy and eat.</p>}
          {list.length > 0 && (
            <ul className="nb-snacklist" aria-label="Daily snacks">
              {list.map(s => {
                const r = byId(s.id), portion = snackPortion(s), name = r ? r.n : 'Removed recipe', nums = r ? servingNumbers(r, portion) : null;
                return (
                  <li key={s.id} className="nb-snackrow">
                    <span className="nb-snackname"><b>{name}</b><small>{nums ? `${Math.round(nums.kcal)} kcal` : 'Needs numbers'}{portion !== 1 ? ` · × ${portion}` : ''}</small></span>
                    {r && <span className="nb-snackstep">
                      <button type="button" className="btn sm" aria-label={`Less ${name}`} disabled={portion <= 0.5} onClick={() => save(setSnackPortion(list, s.id, portion - 0.5))}>Less</button>
                      <button type="button" className="btn sm" aria-label={`More ${name}`} disabled={portion >= 10} onClick={() => save(setSnackPortion(list, s.id, portion + 0.5))}>More</button>
                    </span>}
                    <ArmedButton className="btn sm" aria-label={`Remove ${name} from daily snacks`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => save(removeSnack(list, s.id))} />
                  </li>
                );
              })}
            </ul>
          )}
          {msg && <p className="note" role="status">{msg}</p>}
          <div className="actions">
            <button type="button" className="btn" disabled={list.length >= MAX_DAILY_SNACKS} onClick={() => setPicking(true)}>Add snack</button>
            {list.length >= MAX_DAILY_SNACKS && <span className="note">You can keep {MAX_DAILY_SNACKS} daily snacks.</span>}
            <button type="button" className="btn primary" onClick={closeModal}>Done</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

const NONE: DailySnack[] = [];
