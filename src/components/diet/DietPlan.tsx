import { useState } from 'react';
import { fmtNum, shiftDay } from '../../lib/dietLog.js';
import { dayTotals, daysFrom, inWindow, planLog, recipeIdsFor, resolve, totalsText, type Resolved } from '../../lib/dietPlan.js';
import type { Targets } from '../../lib/dietTarget.js';
import { addMissingMessage } from '../../lib/recipePantry.js';
import { MAX_PLAN_ITEMS } from '../../shared/diet.js';
import { parseDate, ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import './Diet.css';

const dayName = (d: string) => parseDate(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// The meal planner (brief diet-meal-planner): a week strip, the open day's list of recipes and saved meals with what it adds up to, a Log button on today's items, and one step that sends the shown week's missing ingredients to To get.
export default function DietPlan({ targets }: { targets: Targets }) {
  const today = ymd(useToday(s => s.today));
  const plan = useAppStore(s => s.cfg.diet?.plan) ?? {};
  const meals = useAppStore(s => s.cfg.diet?.meals) ?? [];
  const recipes = useAppStore(s => s.recipes);
  const [week, setWeek] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const days = daysFrom(shiftDay(today, week * 7));
  const day = picked && days.includes(picked) && inWindow(picked, today) ? picked : days[0]!;
  const items = plan[day] ?? [];
  const rows = items.map(it => resolve(it, recipes, meals));
  const tot = dayTotals(items, recipes, meals);
  const need = recipeIdsFor(plan, days, recipes).length;
  const st = () => useAppStore.getState();
  const go = (w: number) => { setWeek(w); setPicked(null); setAdding(false); setMsg(''); };
  const add = (kind: 'r' | 'm', id: string) => { const e = st().addPlanItem(day, kind, id); setMsg(e ?? ''); if (!e) { setAdding(false); setQ(''); } };
  const log = (r: Resolved) => {
    const out = planLog(r, st().diet, today);
    if ('error' in out) { setMsg(out.error); return; }
    let done = 0, stopped: string | null = null;
    for (const f of out.add) {
      stopped = st().addDietEntry({ d: today, n: f.n, kcal: f.kcal, p: f.p, ...(f.c !== undefined ? { c: f.c } : {}), ...(f.f !== undefined ? { f: f.f } : {}), ...(f.from ? { from: f.from } : {}) }).error;
      if (stopped) break;
      done++;
    }
    const left = out.left + (out.add.length - done - (stopped ? 1 : 0));
    setMsg(`Logged ${done} from ${r.name}.${stopped ? ` ${stopped}` : left > 0 ? ` ${left} left out: 20 a day is the limit.` : ''}`);
  };
  const needle = q.trim().toLowerCase();
  const rMatch = recipes.filter(r => !needle || r.n.toLowerCase().includes(needle)).slice(0, 8);
  const mMatch = meals.filter(m => !needle || m.n.toLowerCase().includes(needle)).slice(0, 8);
  return (
    <div className="dt-plan">
      <h3 id="dt-plan-h">Plan</h3>
      <div className="dt-weeknav">
        <button type="button" className="btn sm" disabled={week === 0} onClick={() => go(0)}>This week</button>
        <button type="button" className="btn sm" disabled={week === 1} onClick={() => go(1)}>Next week</button>
      </div>
      <ul className="dt-strip" aria-labelledby="dt-plan-h">
        {days.map(d => {
          const n = (plan[d] ?? []).length;
          const shown = `${parseDate(d).toLocaleDateString('en-US', { weekday: 'short' })} ${parseDate(d).getDate()}`; // the accessible name starts with the visible text
          return (
            <li key={d}>
              <button type="button" className="btn sm" aria-pressed={d === day} aria-label={`${shown}${n ? ` · ${n}` : ''}, ${dayName(d)}${n ? `, ${n} planned` : ''}`} onClick={() => { setPicked(d); setAdding(false); setMsg(''); }}>
                {shown}{n > 0 && ` · ${n}`}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="note">{items.length ? totalsText(tot, targets.kcal, targets.protein) : 'Nothing planned.'}</p>
      <ul className="dt-planlist" aria-label={`Planned for ${dayName(day)}`}>
        {rows.map((r, i) => (
          <li key={r.item.k + r.item.id} className="dt-planrow">
            <span className="dt-name">{r.name}{r.item.k === 'm' ? ' (meal)' : ''}</span>
            {r.gone ? <span className="note">Removed</span> : <span className="note">{r.kcal !== undefined ? `${fmtNum(r.kcal)} kcal` : 'No calories'}</span>}
            {r.item.k === 'r' && !r.gone && (
              <>
                <button type="button" className="btn sm" aria-label={`Less ${r.name}`} disabled={r.portion <= 0.5} onClick={() => st().setPlanPortion(day, i, r.portion - 0.5)}>Less</button>
                <span>{r.portion} {r.portion === 1 ? 'portion' : 'portions'}</span>
                <button type="button" className="btn sm" aria-label={`More ${r.name}`} disabled={r.portion >= 10} onClick={() => st().setPlanPortion(day, i, r.portion + 0.5)}>More</button>
              </>
            )}
            {day === today && !r.gone && <button type="button" className="btn sm primary" aria-label={`Log ${r.name}`} onClick={() => log(r)}>Log</button>}
            <button type="button" className="btn sm" aria-label={`Remove ${r.name}`} onClick={() => st().removePlanItem(day, i)}>Remove</button>
          </li>
        ))}
      </ul>
      {!adding ? (
        <button type="button" className="btn sm" disabled={items.length >= MAX_PLAN_ITEMS} onClick={() => { setAdding(true); setMsg(''); }}>Add to plan</button>
      ) : recipes.length === 0 && meals.length === 0 ? (
        <p className="note">Add a recipe or save a meal first.</p>
      ) : (
        <div className="dt-planadd">
          <label className="field" htmlFor="dt-plan-q">Find a recipe or meal
            <input id="dt-plan-q" type="search" value={q} maxLength={80} autoComplete="off" onChange={e => setQ(e.target.value)} />
          </label>
          <ul className="dt-recents" aria-label="Recipes and meals to plan">
            {rMatch.map(r => <li key={`r${r.id}`}><button type="button" className="btn sm" onClick={() => add('r', r.id)}>{r.n} (recipe)</button></li>)}
            {mMatch.map(m => <li key={`m${m.id}`}><button type="button" className="btn sm" onClick={() => add('m', m.id)}>{m.n} (meal)</button></li>)}
          </ul>
          {rMatch.length + mMatch.length === 0 && <p className="note">No match.</p>}
          <button type="button" className="btn sm" onClick={() => { setAdding(false); setQ(''); }}>Cancel</button>
        </div>
      )}
      <div className="dt-planshop">
        <button type="button" className="btn sm" disabled={need === 0} onClick={() => setMsg(addMissingMessage(st().planToGroceries(days)))}>Add missing ingredients to To get</button>
      </div>
      <p className="note" role="status">{msg}</p>
    </div>
  );
}
