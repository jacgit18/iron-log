import { useState } from 'react';
import { entriesOn, entryFromFood, fmtNum, roomOn } from '../../lib/dietLog.js';
import type { Food } from '../../lib/foodMacros.js';
import { withMicro } from '../../shared/foodMicro.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { findMatches } from '../../lib/dietPlan.js';
import { quickItems } from '../../lib/dietRecent.js';
import { suggestNow } from '../../lib/dietSuggest.js';
import { mealLine } from '../../lib/dietMeals.js';
import { quickRows, savedMealsNote } from '../../lib/quickMeals.js';
import { ADD_FLOWS, addFlows, addGroups, addMode, addingTo, startMeal, type AddFlow } from '../../lib/nutritionBoard.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { PLAN_SLOTS } from '../../shared/diet.js';
import { ymd } from '../../shared/dates.js';
import type { FoodHit } from '../../shared/foods.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useLegacyMeals } from '../../store/useLegacyMeals.js';
import { useToday } from '../../store/useToday.js';
import type { PlanSlot } from '../../types.ts';
import CopyDay from '../diet/CopyDay.js';
import EntryForm from '../diet/EntryForm.js';
import FindFood from '../diet/FindFood.js';
import SaveMeal from '../diet/SaveMeal.js';
import SavedMeals from '../diet/SavedMeals.js';
import type { FoodFill, ScanResume } from '../diet/FoodSearch.js';
import Icon, { type IconName } from '../Icon.jsx';
import { openRecipesForm } from '../openRecipesForm.js';
import Sheet from '../Sheet.js';

const FLOW_ICON: Record<AddFlow, IconName> = { quick: 'spark', barcode: 'scan', oneoff: 'edit', find: 'search', meals: 'star', recipes: 'book', copy: 'undo', savemeal: 'plus' };
const KEY = 'nb-last-meal';
const lastMeal = (): PlanSlot | null => { try { const v = localStorage.getItem(KEY); return PLAN_SLOTS.find(s => s === v) ?? null; } catch { return null; } };
const remember = (s: PlanSlot) => { try { localStorage.setItem(KEY, s); } catch { /* private window: the pick just is not remembered */ } };

// The add sheet (brief nutrition-board): the ways of adding that exist today. A day ahead asks which meal (pre-picked from the time of day, remembering the last pick) and plans recipes and saved meals into it; today logs what was eaten, which has no meal, so it asks nothing (owner, 2026-11-10: no Plan on today).
// `modal.day` is the day it adds to, `modal.meal` the meal to start on (an empty meal's Add control), `modal.flow` opens one way straight away, `modal.onScan` and `modal.onMsg` hand a scanned product and a status line back to the board (this sheet closes when the camera opens; the toolbar's Scan barcode opens the camera itself).
export default function AddFoodSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const today = ymd(useToday(s => s.today));
  const day = typeof modal?.day === 'string' ? modal.day : today;
  const flows = addFlows(day, today);
  const first = typeof modal?.flow === 'string' && (flows as readonly string[]).includes(modal.flow) ? (modal.flow as AddFlow) : null;
  const [flow, setFlow] = useState<AddFlow | null>(first);
  const [meal, setMeal] = useState<PlanSlot>(() => { const n = new Date(); return PLAN_SLOTS.find(s => s === modal?.meal) ?? startMeal(lastMeal(), n.getHours() * 60 + n.getMinutes()); }); // `modal.meal`: the empty meal's Add control picked it
  const [msg, setMsg] = useState('');
  const [fill, setFill] = useState<{ key: number; food?: FoodFill }>({ key: 0 });
  const scan = () => {
    const onScan = modal?.onScan as ((h: FoodHit) => void) | undefined;
    useAppStore.getState().openModal({ type: 'barcode', onFound: (h: FoodHit) => onScan?.(h) });
  };
  const pick = (s: PlanSlot) => { setMeal(s); remember(s); };
  const choose = (f: AddFlow) => { if (f === 'barcode') { scan(); return; } setFlow(f); setMsg(''); };
  const said = (t: string) => { setMsg(t); (modal?.onMsg as ((t: string) => void) | undefined)?.(t); };
  const resume = modal?.resume as ScanResume | undefined;
  const reopen = (r: ScanResume) => useAppStore.getState().openModal({ ...(modal ?? { type: 'nbadd' }), type: 'nbadd', day, flow: 'find', resume: r });
  const body = flow && <FlowBody flow={flow} day={day} today={today} meal={meal} fill={fill} reopen={reopen} {...(resume ? { resume } : {})} onFill={f => { setFill(o => ({ key: o.key + 1, food: f })); setFlow('oneoff'); }} onMsg={said} />;
  return (
    <Sheet className="nbsheet sheet-wide" aria-label={`Add food, ${addingTo(day, today)}`}>
      <h2 className="cond">{flow ? ADD_FLOWS[flow].label : 'Add food'}</h2>
      <p className="note">{addingTo(day, today)}{day < today && ' · logs food you ate that day'}</p>
      {addMode(day, today) === 'plan' && (
        <div role="group" aria-label="Which meal">
          <p className="note" id="nb-meal-h">Which meal?</p>
          <div className="seg" role="group" aria-labelledby="nb-meal-h">
            {PLAN_SLOTS.map(s => <button key={s} type="button" aria-pressed={meal === s} onClick={() => pick(s)}>{SLOT_LABEL[s]}</button>)}
          </div>
          <p className="note">Recipes and saved meals you add go into {SLOT_LABEL[meal]}.</p>
        </div>
      )}
      {!flow && (
        <div className="nb-menu" aria-label="Ways to add food" role="group">
          {addGroups(day, today).map(g => (
            <section key={g.label} aria-labelledby={`nb-grp-${g.label.replace(/\W+/g, '-')}`}>
              <h3 className="nb-grouph" id={`nb-grp-${g.label.replace(/\W+/g, '-')}`}>{g.label}</h3>
              <ul>
                {g.flows.map(f => <li key={f}><button type="button" className="btn" onClick={() => choose(f)}><Icon name={FLOW_ICON[f]} /><b>{ADD_FLOWS[f].label}</b><span>{ADD_FLOWS[f].hint}</span></button></li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
      {body}
      <p className="note" role="status">{msg}</p>
      <div className="actions">
        {flow && <button type="button" className="btn" onClick={() => { setFlow(null); setMsg(''); }}>Back to ways of adding</button>}
        <button type="button" className="btn primary" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}

function FlowBody({ flow, day, today, meal, fill, onFill, onMsg, reopen, resume }: { flow: AddFlow; day: string; today: string; meal: PlanSlot; fill: { key: number; food?: FoodFill }; onFill: (f: FoodFill) => void; onMsg: (t: string) => void; reopen: (r: ScanResume) => void; resume?: ScanResume }) {
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const { held } = useLegacyMeals();
  const [q, setQ] = useState('');
  const newRecipe = () => openRecipesForm({ kind: 'new' });
  const [hour] = useState(() => new Date().getHours()); // read once on opening, not on each render
  const eat = addMode(day, today) === 'log';
  const st = () => useAppStore.getState();
  const plan = (kind: 'r' | 'm', id: string, name: string) => { const e = st().addPlanItem(day, kind, id, meal); onMsg(e ?? `Planned ${name} for ${SLOT_LABEL[meal]}.`); };
  const addFood = (f: Food) => {
    const run = runInstantLog(st().addDietEntry, [entryFromFood(day, f)], { from: f.n });
    onMsg(run.error ?? run.text); // a refusal shows the store's words alone, never 'Added 0 from ...'
  };
  if (flow === 'quick') {
    const items = quickItems(diet, recipes);
    const suggested = day === today ? suggestNow(diet, hour, today) : []; // 'now' means today's clock: an earlier day gets no suggestions built from it
    return !roomOn(diet, day) ? <p className="note">That’s 20 things for the day. Delete one to add another.</p> : (
      <div>
        {suggested.length > 0 && (<><p className="note" id="nb-sugg-h">Suggested now</p><ul className="dt-recents" aria-labelledby="nb-sugg-h">{suggested.map(f => <li key={f.n}><button type="button" className="btn sm" onClick={() => addFood(f)}>{f.n} · {fmtNum(f.kcal)} kcal</button></li>)}</ul></>)}
        {items.length > 0 && (<><p className="note" id="nb-quick-h">Recent and favorites</p><ul className="dt-recents" aria-labelledby="nb-quick-h">{items.map(i => <li key={i.id}><button type="button" className={i.fav ? 'btn sm dt-fav' : 'btn sm'} aria-label={i.fav ? `${i.n}, favorite` : undefined} onClick={() => st().openModal({ type: 'portion', id: i.id, day })}>{i.n}</button></li>)}</ul></>)}
        {suggested.length === 0 && items.length === 0 && <p className="note">Nothing here yet. Log a few foods and the ones you use most appear.</p>}
      </div>
    );
  }
  if (flow === 'oneoff') {
    return <EntryForm key={fill.key} idp="dt-add" start={fill.food} submitLabel="Add"
      amounts={{ ...(fill.food?.micro ? { micro: fill.food.micro } : {}), ...(fill.food ? { kcal: fill.food.kcal } : {}) }}
      onSubmit={v => { const r = st().addDietEntry({ d: day, n: v.n, kcal: v.kcal, p: v.p, ...(v.c !== null ? { c: v.c } : {}), ...(v.f !== null ? { f: v.f } : {}), ...withMicro(v.micro ?? undefined) }); if (!r.error) onMsg(`Added ${v.n.trim()}.`); return r.error; }} />;
  }
  if (flow === 'find') return <FindFood day={day} onFood={onFill} reopen={reopen} {...(resume ? { resume } : {})} />;
  if (flow === 'copy') return <CopyDay key={day} day={day} onAdded={onMsg} />;
  if (flow === 'savemeal') return entriesOn(diet, day).length === 0 ? <p className="note">Nothing eaten yet to save.</p> : <SaveMeal key={day} day={day} onSaved={onMsg} />;
  if (flow === 'meals') {
    if (eat) return <SavedMeals day={day} full={!roomOn(diet, day)} onAdded={onMsg} />;
    const rows = quickRows(recipes, held);
    return rows.length === 0 ? <p className="note">No saved meals yet.</p> : (
      <div>
        <ul className="dt-recents" aria-label="Saved meals to plan">
          {rows.map(m => <li key={m.id}><button type="button" className="btn sm" onClick={() => plan(m.id.startsWith('s:') ? 'm' : 'r', m.id.slice(2), m.n)}>{mealLine(m)}</button></li>)}
        </ul>
        {held.length > 0 && <p className="note">{savedMealsNote(held, recipes.length)}</p>}
      </div>
    );
  }
  if (flow === 'recipes') {
    const list = findMatches(recipes, q);
    return (
      <div>
        <label className="field" htmlFor="nb-recipe-q">Find a recipe
          <input id="nb-recipe-q" type="search" value={q} maxLength={80} autoComplete="off" onChange={e => setQ(e.target.value)} />
        </label>
        <ul className="nb-recipes" aria-label="Recipes">
          {list.map(r => (
            <li key={r.id}>
              <span className="nb-eatn">{r.n}</span>
              {eat && <button type="button" className="btn sm" aria-label={`Log ${r.n}`} onClick={() => st().openModal({ type: 'portion', id: r.id, day })}>Log</button>}
              {!eat && <button type="button" className="btn sm" aria-label={`Plan ${r.n} for ${SLOT_LABEL[meal]}`} onClick={() => plan('r', r.id, r.n)}>Plan</button>}
            </li>
          ))}
        </ul>
        {list.length === 0 && recipes.length > 0 && <p className="note">No match.</p>}
        {recipes.length === 0 && <><p className="note">No recipes yet.</p><button type="button" className="btn" id="nb-new-recipe" onClick={newRecipe}>+ New recipe</button></>}
      </div>
    );
  }
  return null;
}
