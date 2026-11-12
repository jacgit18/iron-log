import { useId, useState } from 'react';
import { ateMax, packServings, servingNumbers } from '../../lib/dietLog.js';
import { macroLine, macroWords, type MacroParts } from '../../lib/macroLine.js';
import { amountText, unitWord } from '../../lib/foodUnit.js';
import { actionWord, dayRange, isAhead, logOrPlan, startAmount, type Ports } from '../../lib/logOrPlan.js';
import { startMeal } from '../../lib/nutritionBoard.js';
import { SLOT_LABEL } from '../../lib/weekBoard.js';
import { PLAN_SLOTS } from '../../shared/diet.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { PlanSlot, Recipe } from '../../types.ts';
import '../Pill.css';
import PairSuggestion from './PairSuggestion.js';
import './LogControl.css';

// The one control for logging a recipe or planning it (brief log-or-plan-control): the portion stepper with live numbers, the day, Which meal? when the day is ahead, Log or Plan, Undo, and what goes with it.
// The rule is `logOrPlan` (src/lib); this only holds state and draws. The meal is remembered under the same key as the Nutrition add sheet.
const KEY = 'nb-last-meal';
const lastMeal = (): PlanSlot | null => { try { const v = localStorage.getItem(KEY); return PLAN_SLOTS.find(s => s === v) ?? null; } catch { return null; } };
const remember = (s: PlanSlot) => { try { localStorage.setItem(KEY, s); } catch { /* private window: the pick just is not remembered */ } };

/** The macro line for the eye; a screen reader gets the same numbers in words ("P 22" would be read as a letter). */
const Macros = ({ m }: { m: MacroParts }) => <><span aria-hidden="true">{macroLine(m)}</span><span className="vh">{macroWords(m)}</span></>;

const ports = (): Ports => {
  const st = useAppStore.getState();
  return { addDietEntry: st.addDietEntry, removeDietEntry: st.removeDietEntry, addPlanItem: st.addPlanItem, setPlanPortion: st.setPlanPortion, removePlanItem: st.removePlanItem, plan: () => useAppStore.getState().cfg.diet?.plan ?? {} };
};

/** `day` (the day the screen shows) when it is one the control offers, else today. */
export default function LogControl({ recipe, day: from, onChange }: { recipe: Recipe; day?: string; onChange?: (done: boolean) => void }) {
  const uid = useId();
  const today = ymd(useToday(s => s.today)); // the shared "today" (it moves at midnight), not a Date read during render
  const { min, max } = dayRange(today);
  const [day, setDay] = useState(typeof from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(from) && from >= min && from <= max ? from : today);
  const [servings, setServings] = useState(() => startAmount(recipe));
  const [meal, setMeal] = useState<PlanSlot>(() => { const n = new Date(); return startMeal(lastMeal(), n.getHours() * 60 + n.getMinutes()); });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ text: string; undo: () => void; key: number } | null>(null);
  const ahead = isAhead(day, today);
  const word = actionWord(day, today);
  const top = ahead ? Math.min(10, ateMax(recipe)) : ateMax(recipe); // the planner holds up to 10 portions
  const pack = packServings(recipe);
  const shown = Math.min(servings, top);
  const nums = servingNumbers(recipe, shown);
  const set = (d: boolean) => onChange?.(d);
  const go = () => {
    if (done) return; // a second tap never logs twice; Undo then Log again is a new log
    const made = logOrPlan(ports(), recipe, shown, day, today, ahead ? meal : null);
    if (!made.ok) { setErr(made.error); return; }
    setErr(''); setDone({ text: made.text, undo: made.undo, key: Date.now() }); set(true);
  };
  const lock = !!done;
  return (
    <div className="lc">
      <p className="note" role="status">{nums ? <Macros m={nums} /> : 'Those numbers are out of range.'} for {amountText(shown, recipe)}</p>
      <div className="lc-step">
        <button type="button" className="btn sm" disabled={shown <= 0.5 || lock} onClick={() => setServings(Math.max(0.5, shown - 0.5))}>Less</button>
        <span role="status">{amountText(shown, recipe)}</span>
        <button type="button" className="btn sm" disabled={shown >= top || lock} onClick={() => setServings(Math.min(top, shown + 0.5))}>More</button>
        {pack !== null && pack <= top && <button type="button" className="btn sm" disabled={shown === pack || lock} onClick={() => setServings(pack)}>Whole pack ({pack})</button>}
      </div>
      <p className="note">Per {unitWord(1, recipe)}: <Macros m={{ kcal: recipe.kcal!, p: recipe.p!, c: recipe.c, f: recipe.f }} /></p>
      <label className="field" htmlFor={`${uid}-day`}>Day
        <input id={`${uid}-day`} type="date" value={day} min={min} max={max} disabled={lock} onChange={e => { if (e.target.value) setDay(e.target.value); setErr(''); }} />
      </label>
      {ahead && (
        <div>
          <p className="note" id={`${uid}-meal`}>Which meal?</p>
          <div className="lc-meals" role="group" aria-labelledby={`${uid}-meal`}>
            {PLAN_SLOTS.map(s => <button key={s} type="button" className="pillbtn" aria-pressed={meal === s} disabled={lock} onClick={() => { setMeal(s); remember(s); }}>{SLOT_LABEL[s]}</button>)}
          </div>
        </div>
      )}
      {pack !== null && pack > top && <p className="note">A whole pack ({pack} servings) is more than one {ahead ? 'plan item' : 'entry'} can hold. {ahead ? 'Plan' : 'Log'} it in parts, up to {top} portions at a time.</p>}
      {err && <p className="note" role="alert">{err}</p>}
      {done ? (
        <p className="note" role="status">{done.text} <button type="button" className="btn sm ghost" onClick={() => { done.undo(); setDone(null); set(false); }}>Undo</button> <button type="button" className="btn sm ghost" onClick={() => { setDone(null); set(false); }}>{word} another</button></p>
      ) : (
        <div className="lc-go"><button type="button" className="btn primary" onClick={go}>{word}</button></div>
      )}
      {done && !ahead && <PairSuggestion key={done.key} recipe={recipe} day={day} today={today} />}
    </div>
  );
}
