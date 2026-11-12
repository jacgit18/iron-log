import { useMemo, useState } from 'react';
import { bwSorted, goalStatus } from '../../lib/body.js';
import { entryFromFood } from '../../lib/dietLog.js';
import { planLog, type Plan, type Resolved } from '../../lib/dietPlan.js';
import { recommend, targetsFor } from '../../lib/dietTarget.js';
import { ADD_FLOWS, addingTo, dayView, foodEditable, longDay, toolbarFlows, weekDays, weekLabel, weekOf, windowDays, WEEK_NAME, WEEK_OFFSETS, type WeekOffset } from '../../lib/nutritionBoard.js';
import { dayToShow, setPickedDay, usePickedDay } from '../../lib/nutritionDayPick.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { FoodHit } from '../../shared/foods.js';
import type { PlanSlot, SavedMeal } from '../../types.ts';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import ScanFood from '../diet/ScanFood.js';
import DayColumn from './DayColumn.js';
import DayStepper from './DayStepper.js';
import { useDaysShown } from './useWideBoard.js';
import '../diet/board/WeekBoard.css';
import './NutritionBoard.css';

const NO_PLAN: Plan = {};
const NO_MEALS: SavedMeal[] = [];

// Nutrition as one week board (brief nutrition-board): a week switcher (previous and next arrows like the Board's, This week to come back), an add-food toolbar naming the day it adds to, and day columns: seven from 1440 px, three from 1000, two from 768, else one day, with a stepper under seven.
// Each day holds six meters (calories, protein, carbs when there is a target or data, fat, supplements, water), its meals with the food eaten in them, Supplements and Hydration. Meters count eaten food for last week and today, the plan for days ahead (ADR 105).
export default function NutritionBoard() {
  const now = useToday(s => s.today);
  const today = ymd(now);
  const shown = useDaysShown();
  const cfg = useAppStore(s => s.cfg);
  const body = useAppStore(s => s.body);
  const supp = useAppStore(s => s.supp);
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const kept = usePickedDay(); // the picked day lives outside this component so leaving for Recipes and coming back keeps it (lib/nutritionDayPick.ts); a reload shows today
  const setPicked = setPickedDay;
  const [anchor, setAnchor] = useState(today); // the first day of the 1 to 3 day window; tapping a column inside it keeps the window still, only the stepper moves it
  const [msg, setMsg] = useState('');
  const [scanned, setScanned] = useState<{ hit: FoodHit; day: string } | null>(null); // the day is the one the scan began on, so picking another day before Save and log it does not move the entry
  const day = dayToShow(kept, today);
  const offset = weekOf(today, day);
  const days = useMemo(() => weekDays(today, offset), [today, offset]);
  const shownDays = windowDays(days, windowDays(days, anchor, shown).includes(day) ? anchor : day, shown);
  const plan = cfg.diet?.plan ?? NO_PLAN;
  const meals = cfg.diet?.meals ?? NO_MEALS;
  const targets = useMemo(() => {
    const weights = bwSorted(body);
    const latest = weights.length ? Number(weights[weights.length - 1]!.w) : null;
    const goalLb = cfg.bwGoal ? Number(cfg.bwGoal.w) : null;
    const g = goalStatus(cfg.bwGoal, body, now);
    const weeksLeft = g && 'weeksLeft' in g && typeof g.weeksLeft === 'number' ? g.weeksLeft : null;
    const t = targetsFor(cfg.diet, recommend(goalLb, latest, weeksLeft, cfg.diet));
    return { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs };
  }, [cfg, body, now]);
  const views = useMemo(() => days.map(d => dayView(d, today, { plan, recipes, meals, diet, supp, body, targets })), [days, today, plan, recipes, meals, diet, supp, body, targets]);
  const moveTargets = days.map(d => ({ id: d, label: longDay(d) }));
  const st = () => useAppStore.getState();
  const goWeek = (o: WeekOffset) => { setPicked(o === 0 ? today : weekDays(today, o)[0]!); setMsg(''); };
  const log = (r: Resolved, index: number) => {
    const out = planLog(r, st().diet, today);
    if ('error' in out) { setMsg(out.error); return; }
    let done = 0, stopped: string | null = null;
    const ids: string[] = [];
    for (const f of out.add) {
      const added = st().addDietEntry(entryFromFood(today, f));
      stopped = added.error;
      if (stopped) break;
      if (added.id) ids.push(added.id);
      done++;
    }
    if (ids.length) st().setPlanEaten(today, index, ids); // the planned item shows a check
    const left = out.left + (out.add.length - done - (stopped ? 1 : 0));
    setMsg(`Logged ${done} from ${r.name}.${stopped ? ` ${stopped}` : left > 0 ? ` ${left} left out: 20 a day is the limit.` : ''}`);
  };
  const scan = () => st().openModal({ type: 'barcode', onFound: (h: FoodHit) => setScanned({ hit: h, day }) });
  const open = (flow?: string, forDay = day, meal?: PlanSlot) => st().openModal({ type: 'nbadd', day: forDay, ...(flow ? { flow } : {}), ...(meal ? { meal } : {}), onScan: (h: FoodHit) => setScanned({ hit: h, day: forDay }), onMsg: setMsg });
  const editable = foodEditable(day, today);
  const target = addingTo(day, today);
  return (
    <section className="wb nb" aria-labelledby="nb-h">
      <div className="nb-head">
        <h2 id="nb-h" className="cond vh">Nutrition</h2>
        <div className="weeknav nb-weeksw" role="group" aria-label="Week">
          <button type="button" className="btn sm" aria-label="Previous week" aria-disabled={offset === WEEK_OFFSETS[0]} onClick={() => { if (offset > WEEK_OFFSETS[0]!) goWeek((offset - 1) as WeekOffset); }}><Icon name="chevron-left" /></button>
          <span className="nb-weekname cond">{WEEK_NAME[offset]}</span>
          <button type="button" className="btn sm" aria-label="Next week" aria-disabled={offset === WEEK_OFFSETS[WEEK_OFFSETS.length - 1]} onClick={() => { if (offset < WEEK_OFFSETS[WEEK_OFFSETS.length - 1]!) goWeek((offset + 1) as WeekOffset); }}><Icon name="chevron-right" /></button>
          {offset !== 0 && <button type="button" className="btn sm ghost" onClick={() => goWeek(0)}>This week</button>}
        </div>
        <div className="nb-headbtns">
          <button type="button" className="btn sm" id="nb-targets" aria-label="Targets and goal" onClick={() => st().openModal({ type: 'nbtargets' })}><span className="nb-short">Targets</span><span className="nb-long">Targets and goal</span></button>
          <button type="button" className="btn sm" id="nb-manage" onClick={() => st().openModal({ type: 'nbmanage' })}>Manage</button>
        </div>
      </div>
      <p className="nb-weeklab" role="status">{weekLabel(today, offset)}</p>
      <div className="nb-toolbar" role="group" aria-label="Add food">
        <span className="nb-target">{editable ? target : `${target.replace('Adding to', '')} · food is read-only`}</span>
        {editable ? (
          <div className="nb-tbtns">
            <button type="button" className="btn primary" id="nb-add" onClick={() => open()}>Add food</button>
            {toolbarFlows(day, today).map(f => <button key={f} type="button" className="btn" onClick={() => (f === 'barcode' ? scan() : open(f))}>{ADD_FLOWS[f].label}</button>)}
          </div>
        ) : <span className="note">Last week&apos;s food cannot be changed. Supplements and water can.</span>}
      </div>
      <RemovedNotice scope="diet" expires />
      {scanned && <div className="nb-scan"><ScanFood key={scanned.hit.id} hit={scanned.hit} day={scanned.day} onDone={setMsg} onCancel={() => setScanned(null)} /></div>}
      <p className="note nb-msg" role="status">{msg}</p>
      <div className="wb-legend" aria-hidden="true"><span><i className="kcal" />Calories</span><span><i className="prot" />Protein</span>{views.some(v => v.meters.some(m => m.key === 'carbs' && !m.hidden)) && <span><i className="nbc" />Carbs</span>}<span><i className="fat" />Fat</span><span><i className="nbs" />Supplements</span><span><i className="nbw" />Water</span><span><i className="over" />Over the target</span></div>
      {shown === 7 ? (
        <div className="wb-board nb-board">{views.map(v => <DayColumn key={v.day} v={v} today={today} selected={v.day === day} days={moveTargets} onPick={() => setPicked(v.day)} onLog={log} onMsg={setMsg} onAdd={meal => open(undefined, v.day, meal)} />)}</div>
      ) : (
        <>
          <DayStepper today={today} day={day} onPick={d => { setPicked(d); setAnchor(shownDays.includes(d) ? shownDays[0]! : d); setMsg(''); }} />
          <div className={`wb-board nb-board nb-board-${shown}`}>{shownDays.map(d => <DayColumn key={d} v={views[days.indexOf(d)]!} today={today} selected={d === day} days={moveTargets} onPick={() => setPicked(d)} onLog={log} onMsg={setMsg} onAdd={meal => open(undefined, d, meal)} />)}</div>
        </>
      )}
    </section>
  );
}
