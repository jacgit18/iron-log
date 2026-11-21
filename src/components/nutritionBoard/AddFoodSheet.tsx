import { useMemo, useState } from 'react';
import { foodMarks } from '../../lib/boardStock.js';
import { onwardDays, plannedText } from '../../lib/dayPicker.js';
import { entriesOn, entryFromFood, fmtNum, hasMacros, roomOn } from '../../lib/dietLog.js';
import type { Food } from '../../lib/foodMacros.js';
import { plannedWaitingNote } from '../../lib/haveOnly.js';
import { withMicro } from '../../shared/foodMicro.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { findMatches } from '../../lib/dietPlan.js';
import { logRecipeAtUsual } from '../../lib/logAtUsual.js';
import { quickItems } from '../../lib/dietRecent.js';
import { suggestNow } from '../../lib/dietSuggest.js';
import { mealLine } from '../../lib/dietMeals.js';
import { quickRows, savedMealsNote } from '../../lib/quickMeals.js';
import { ADD_FLOWS, addFlows, addGroups, addMode, addingTo, shortDay, startMeal, type AddFlow } from '../../lib/nutritionBoard.js';
import { planMealFor, storedMealFor } from '../../lib/usualMeal.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { PLAN_SLOTS } from '../../shared/diet.js';
import { ymd } from '../../shared/dates.js';
import type { FoodHit } from '../../shared/foods.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useLegacyMeals } from '../../store/useLegacyMeals.js';
import { useToday } from '../../store/useToday.js';
import type { PlanSlot, Recipe } from '../../types.ts';
import CopyDay from '../diet/CopyDay.js';
import EntryForm from '../diet/EntryForm.js';
import FindFood from '../diet/FindFood.js';
import SaveMeal from '../diet/SaveMeal.js';
import SavedMeals from '../diet/SavedMeals.js';
import type { FoodFill, ScanResume } from '../diet/FoodSearch.js';
import Icon, { type IconName } from '../Icon.jsx';
import StockPill from '../recipes/StockPill.js';
import { openRecipesForm } from '../openRecipesForm.js';
import Sheet from '../Sheet.js';
import UndoButton from '../UndoButton.js';
import type { Say } from '../../lib/eatenStep.js';
import DayPicker from './DayPicker.js';

type Scope = 'one' | 'onward' | 'pick';
const SCOPES: readonly { id: Scope; label: string }[] = [{ id: 'one', label: 'Just this day' }, { id: 'onward', label: 'This day on' }, { id: 'pick', label: 'Pick days' }];
const FLOW_ICON: Record<AddFlow, IconName> = { quick: 'spark', barcode: 'scan', oneoff: 'edit', find: 'search', meals: 'star', recipes: 'book', copy: 'undo', savemeal: 'plus' };
const KEY = 'nb-last-meal';
const lastMeal = (): PlanSlot | null => { try { const v = localStorage.getItem(KEY); return PLAN_SLOTS.find(s => s === v) ?? null; } catch { return null; } };
const remember = (s: PlanSlot) => { try { localStorage.setItem(KEY, s); } catch { /* private window: the pick just is not remembered */ } };

// The add sheet (brief nutrition-board): the ways of adding that exist today. A day ahead asks which meal (pre-picked from the time of day, remembering the last pick) and plans recipes and saved meals into it; today logs what was eaten, which has no meal, so it asks nothing (owner, 2026-11-10: no Plan on today).
// `modal.day` is the day it adds to, `modal.meal` the meal to start on (an empty meal's Add control), `modal.flow` opens one way straight away, `modal.onScan` and `modal.onMsg` hand a scanned product and a status line back to the board (this sheet closes when the camera opens; the toolbar's Scan and log opens the camera itself).
export default function AddFoodSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const today = ymd(useToday(s => s.today));
  const day = typeof modal?.day === 'string' ? modal.day : today;
  const eaten = useAppStore(st => entriesOn(st.diet, day).length);
  const flows = addFlows(day, today, eaten);
  const first = typeof modal?.flow === 'string' && (flows as readonly string[]).includes(modal.flow) ? (modal.flow as AddFlow) : null;
  const [picked, setFlow] = useState<AddFlow | null>(first);
  const flow = picked && (flows as readonly string[]).includes(picked) ? picked : null; // a way that stops being offered (the day's last food went) falls back to the list
  const [meal, setMeal] = useState<PlanSlot>(() => { const n = new Date(); return PLAN_SLOTS.find(s => s === modal?.meal) ?? startMeal(lastMeal(), n.getHours() * 60 + n.getMinutes()); }); // `modal.meal`: the empty meal's Add control picked it
  const [explicit, setExplicit] = useState(() => PLAN_SLOTS.some(s => s === modal?.meal)); // true once the person pressed a meal (or opened the sheet from an empty meal's Add): then every recipe goes there; until then a recipe goes to its usual meal (brief nutrition-meal-labels-year-repeat)
  const [msg, setMsg] = useState('');
  const [undo, setUndo] = useState<(() => void) | null>(null); // Undo for the last log in this sheet: removes exactly that entry
  const [scope, setScope] = useState<Scope>('one');
  const [ticked, setTicked] = useState<string[]>([]);
  const targets = scope === 'onward' ? onwardDays(day, today) : scope === 'pick' ? ticked : [day]; // the days a planned recipe or meal goes to
  const [fill, setFill] = useState<{ key: number; food?: FoodFill }>({ key: 0 });
  const scan = () => {
    const onScan = modal?.onScan as ((h: FoodHit) => void) | undefined;
    useAppStore.getState().openModal({ type: 'barcode', onFound: (h: FoodHit) => onScan?.(h) });
  };
  const pick = (s: PlanSlot) => { setMeal(s); setExplicit(true); remember(s); };
  const choose = (f: AddFlow) => { if (f === 'barcode') { scan(); return; } setFlow(f); setMsg(''); setUndo(null); };
  const said: Say = (t, u) => { setMsg(t); setUndo(u ? () => u : null); (modal?.onMsg as Say | undefined)?.(t, u); };
  const resume = modal?.resume as ScanResume | undefined;
  const reopen = (r: ScanResume) => useAppStore.getState().openModal({ ...(modal ?? { type: 'nbadd' }), type: 'nbadd', day, flow: 'find', resume: r });
  const body = flow && <FlowBody flow={flow} day={day} today={today} meal={meal} explicit={explicit} scope={scope} targets={targets} fill={fill} reopen={reopen} {...(resume ? { resume } : {})} onFill={f => { setFill(o => ({ key: o.key + 1, food: f })); setFlow('oneoff'); }} onMsg={said} />;
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
          <p className="note">{explicit ? `Recipes and saved meals you add go into ${SLOT_LABEL[meal]}.` : `A recipe goes into its usual meal; one without goes into ${SLOT_LABEL[meal]}. Press a meal to put everything there.`}</p>
        </div>
      )}
      {addMode(day, today) === 'plan' && (!flow || flow === 'recipes' || flow === 'meals') && ( // the choice only applies to planning a recipe or a saved meal
        <div role="group" aria-label="Add to">
          <p className="note" id="nb-scope-h">Add to</p>
          <div className="seg" role="group" aria-labelledby="nb-scope-h">
            {SCOPES.map(c => <button key={c.id} type="button" aria-pressed={scope === c.id} onClick={() => setScope(c.id)}>{c.label}</button>)}
          </div>
          {scope === 'onward' && <p className="note">Adds to {shortDay(day)} and every day after it, to {shortDay(onwardDays(day, today).at(-1) ?? day)}: one plan card per day.</p>}
          {scope === 'pick' && <DayPicker source={{ kind: 'plan', day: '' }} today={today} picked={ticked} onPick={setTicked} start={day} label="Pick days" />}
        </div>
      )}
      {!flow && (
        <div className="nb-menu" aria-label="Ways to add food" role="group">
          {addGroups(day, today, eaten).map(g => (
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
      <p className="note" role="status">{msg}{undo && <UndoButton onUndo={() => { undo(); said('Undone.'); }} />}</p>
      <div className="actions">
        {flow && <button type="button" className="btn" onClick={() => { setFlow(null); setMsg(''); setUndo(null); }}>Back to ways of adding</button>}
        <button type="button" className="btn primary" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}

function FlowBody({ flow, day, today, meal, explicit, scope, targets, fill, onFill, onMsg, reopen, resume }: { flow: AddFlow; day: string; today: string; meal: PlanSlot; explicit: boolean; scope: Scope; targets: string[]; fill: { key: number; food?: FoodFill }; onFill: (f: FoodFill) => void; onMsg: Say; reopen: (r: ScanResume) => void; resume?: ScanResume }) {
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const { held } = useLegacyMeals();
  const [q, setQ] = useState('');
  const grocery = useAppStore(s => s.grocery), groceryMonths = useAppStore(s => s.groceryMonths);
  const marks = useMemo(() => foodMarks(recipes, today, grocery, groceryMonths), [recipes, today, grocery, groceryMonths]); // a ready-made food's Have / Need pill
  const newRecipe = () => openRecipesForm({ kind: 'new' });
  const [hour] = useState(() => new Date().getHours()); // read once on opening, not on each render
  const eat = addMode(day, today) === 'log';
  const st = () => useAppStore.getState();
  const planned = (kind: 'r' | 'm', id: string): PlanSlot => (kind === 'r' ? planMealFor(recipes.find(r => r.id === id), meal, explicit) : meal); // a recipe's usual meal unless a meal was pressed
  const plan = (kind: 'r' | 'm', id: string, name: string) => {
    const slot = planned(kind, id); // the meal named to the person
    const stored = kind === 'r' ? storedMealFor(recipes.find(r => r.id === id), meal, explicit) : slot; // a recipe following its usual meal is stored with no meal of its own
    const waits = (days: readonly string[]) => (kind === 'r' ? plannedWaitingNote(recipes.find(r => r.id === id), days, today, grocery, groceryMonths, recipes) : ''); // a food the board will tuck behind the chip says so
    if (scope === 'one') { const e = st().addPlanItem(day, kind, id, stored); onMsg(e ?? `Planned ${name} for ${SLOT_LABEL[slot]}.${waits([day])}`); return; }
    if (!targets.length) { onMsg('Pick a day first.'); return; }
    const r = st().addPlanItemToDays(kind, id, targets, stored);
    onMsg(r.error ?? plannedText(name, SLOT_LABEL[slot], r.done, r.skipped, r.done.length ? waits(r.done) : ''));
  };
  const addFood = (f: Food) => {
    const run = runInstantLog(st().addDietEntry, [entryFromFood(day, f)], { from: f.n });
    onMsg(run.error ?? run.text); // a refusal shows the store's words alone, never 'Added 0 from ...'
  };
  const logNow = (r: Recipe) => { if (!hasMacros(r)) { st().openModal({ type: 'portion', id: r.id, day }); return; } const m = logRecipeAtUsual(st(), r, day, today); if (m.ok) onMsg(m.text, m.undo); else onMsg(m.error); }; // one tap logs at the usual portion and the sheet stays open; a day ahead plans through the portion sheet (below)
  if (flow === 'quick') {
    const items = quickItems(diet, recipes);
    const suggested = day === today ? suggestNow(diet, hour, today) : []; // 'now' means today's clock: an earlier day gets no suggestions built from it
    return !roomOn(diet, day) ? <p className="note">That’s 20 things for the day. Delete one to add another.</p> : (
      <div>
        {suggested.length > 0 && (<><p className="note" id="nb-sugg-h">Suggested now</p><ul className="dt-recents" aria-labelledby="nb-sugg-h">{suggested.map(f => <li key={f.n}><button type="button" className="btn sm" onClick={() => addFood(f)}>{f.n} · {fmtNum(f.kcal)} kcal</button></li>)}</ul></>)}
        {items.length > 0 && (<><p className="note" id="nb-quick-h">Recent and favorites</p><ul className="dt-recents" aria-labelledby="nb-quick-h">{items.map(i => <li key={i.id}><button type="button" className={i.fav ? 'btn sm dt-fav' : 'btn sm'} aria-label={i.fav ? `${i.n}, favorite` : undefined} onClick={() => { const r = recipes.find(x => x.id === i.id); if (eat && r) logNow(r); else st().openModal({ type: 'portion', id: i.id, day }); }}>{i.n}</button></li>)}</ul></>)}
        {suggested.length === 0 && items.length === 0 && <p className="note">Nothing here yet. Log a few foods and the ones you use most appear.</p>}
      </div>
    );
  }
  if (flow === 'oneoff') {
    return <EntryForm key={fill.key} idp="dt-add" start={fill.food} submitLabel="Add"
      amounts={{ ...(fill.food?.micro ? { micro: fill.food.micro } : {}), ...(fill.food ? { kcal: fill.food.kcal } : {}) }}
      onSubmit={v => { const r = st().addDietEntry({ d: day, n: v.n, kcal: v.kcal, p: v.p, ...(v.c !== null ? { c: v.c } : {}), ...(v.f !== null ? { f: v.f } : {}), ...withMicro(v.micro ?? undefined) }); if (!r.error) onMsg(`Added ${v.n.trim()}.`); return r.error; }} />;
  }
  if (flow === 'find') return <FindFood day={day} today={today} onFood={onFill} onMsg={onMsg} reopen={reopen} {...(resume ? { resume } : {})} />;
  if (flow === 'copy') return <CopyDay key={day} day={day} onAdded={onMsg} />;
  if (flow === 'savemeal') return <SaveMeal key={day} day={day} onSaved={onMsg} />;
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
              <StockPill stock={marks.get(r.id)} />
              {eat && <button type="button" className="btn sm" aria-label={`Log ${r.n}`} onClick={() => logNow(r)}>Log</button>}
              {!eat && <button type="button" className="btn sm" aria-label={`Plan ${r.n} for ${SLOT_LABEL[planned('r', r.id)]}`} onClick={() => plan('r', r.id, r.n)}>Plan</button>}
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
