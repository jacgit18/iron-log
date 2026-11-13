import { useMemo, useState } from 'react';
import { effectivePlan } from '../../lib/dailySnacks.js';
import { entryFromFood } from '../../lib/dietLog.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { recommendInputs } from '../../lib/manageTargets.js';
import { planLog, type Resolved } from '../../lib/dietPlan.js';
import { recommend, targetsFor } from '../../lib/dietTarget.js';
import { ADD_FLOWS, addingTo, dayView, foodEditable, longDay, toolbarFlows, weekDates, weekDays, weekLabel, weekOf, windowDays, WEEK_NAME, WEEK_OFFSETS, type WeekOffset } from '../../lib/nutritionBoard.js';
import { nutritionTabs } from '../../lib/weekDayTabs.js';
import { dayToShow, setPickedDay, usePickedDay } from '../../lib/nutritionDayPick.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useLegacyMeals } from '../../store/useLegacyMeals.js';
import { useToday } from '../../store/useToday.js';
import type { FoodHit } from '../../shared/foods.js';
import type { PlanSlot } from '../../types.ts';
import Icon from '../Icon.jsx';
import WeekDayCard from '../WeekDayCard.js';
import RemovedNotice from '../RemovedNotice.jsx';
import ScanFood from '../diet/ScanFood.js';
import DayColumn from './DayColumn.js';
import DayStepper from './DayStepper.js';
import ShoppingButton from './ShoppingButton.js';
import { useDaysShown, usePhoneHeader } from './useWideBoard.js';
import '../diet/board/WeekBoard.css';
import './NutritionBoard.css';


// Nutrition as one week board (brief nutrition-board): a week switcher (previous and next arrows like the Board's, This week to come back), an add-food toolbar naming the day it adds to, and day columns: seven from 1440 px, three from 1000, two from 768, else one day, with a stepper under seven.
// Each day holds six meters (calories, protein, carbs when there is a target or data, fat, supplements, water), its meals with the food eaten in them, Supplements and Hydration. Meters count eaten food for last week and today, the plan for days ahead (ADR 105).
export default function NutritionBoard() {
  const now = useToday(s => s.today);
  const today = ymd(now);
  const shown = useDaysShown();
  const phone = usePhoneHeader();
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
  const plan = useMemo(() => effectivePlan(cfg.diet, days, today), [cfg.diet, days, today]); // the stored plan plus the saved daily snacks shown on each day (brief daily-snacks)
  const legacy = useLegacyMeals();
  const targets = useMemo(() => {
    const { latest, goalLb, weeksLeft } = recommendInputs(cfg.bwGoal, body, now);
    const t = targetsFor(cfg.diet, recommend(goalLb, latest, weeksLeft, cfg.diet));
    return { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs };
  }, [cfg.bwGoal, cfg.diet, body, now]);
  const views = useMemo(() => days.map(d => dayView(d, today, { plan, recipes, meals: legacy.held, moved: legacy.moved, diet, supp, body, targets })), [days, today, plan, recipes, legacy, diet, supp, body, targets]);
  const moveTargets = days.map(d => ({ id: d, label: longDay(d) }));
  const st = () => useAppStore.getState();
  const goWeek = (o: WeekOffset) => { setPicked(o === 0 ? today : weekDays(today, o)[0]!); setMsg(''); };
  const log = (r: Resolved, index: number) => {
    const out = planLog(r, st().diet, today, recipes);
    if ('error' in out) { setMsg(out.error); return; }
    const run = runInstantLog(st().addDietEntry, out.add.map(f => entryFromFood(today, f)), { from: r.name, left: out.left });
    if (run.ids.length) st().setPlanEaten(today, index, run.ids); // the planned item shows a check
    setMsg(run.text);
  };
  const scan = () => st().openModal({ type: 'barcode', onFound: (h: FoodHit) => setScanned({ hit: h, day }) });
  const open = (flow?: string, forDay = day, meal?: PlanSlot) => st().openModal({ type: 'nbadd', day: forDay, ...(flow ? { flow } : {}), ...(meal ? { meal } : {}), onScan: (h: FoodHit) => setScanned({ hit: h, day: forDay }), onMsg: setMsg });
  const target = addingTo(day, today);
  const weekSwitch = (
    <div className="weeknav nb-weeksw" role="group" aria-label="Week">
      <button type="button" className="btn sm" aria-label="Previous week" aria-disabled={offset === WEEK_OFFSETS[0]} onClick={() => { if (offset > WEEK_OFFSETS[0]!) goWeek((offset - 1) as WeekOffset); }}><Icon name="chevron-left" /></button>
      <span className="nb-weekname cond" data-dates={weekDates(today, offset)}>{WEEK_NAME[offset]}</span>
      <button type="button" className="btn sm" aria-label="Next week" aria-disabled={offset === WEEK_OFFSETS[WEEK_OFFSETS.length - 1]} onClick={() => { if (offset < WEEK_OFFSETS[WEEK_OFFSETS.length - 1]!) goWeek((offset + 1) as WeekOffset); }}><Icon name="chevron-right" /></button>
      {offset !== 0 && <button type="button" className="btn sm ghost" onClick={() => goWeek(0)}>This week</button>}
    </div>
  );
  const pickDay = (d: string) => { setPicked(d); setAnchor(shownDays.includes(d) ? shownDays[0]! : d); setMsg(''); };
  return (
    <section className="wb nb" aria-labelledby="nb-h">
      {phone && <WeekDayCard tabs={nutritionTabs(today, offset)} selected={day} onPick={pickDay} idPrefix="nbdaytab-">{weekSwitch}</WeekDayCard>}
      <div className="nb-head">
        <h2 id="nb-h" className="cond vh">Nutrition</h2>
        {!phone && weekSwitch}
        {!phone && (
          <div className="nb-headbtns">
            <button type="button" className="btn sm" id="nb-manage" onClick={() => st().openModal({ type: 'nbmanage' })}>Manage</button>
          </div>
        )}
      </div>
      <p className="nb-weeklab" role="status">{weekLabel(today, offset)}</p>
      <div className="nb-toolbar" role="group" aria-label="Add food">
        <span className="nb-target nb-target-quiet">{target}</span>
        <div className="nb-tbtns">
          {!phone && foodEditable(day, today) && <ShoppingButton week={days} today={today} onMsg={setMsg} />}
          {toolbarFlows(day, today).map(f => <button key={f} type="button" className="btn" onClick={() => (f === 'barcode' ? scan() : open(f))}>{ADD_FLOWS[f].label}</button>)}
          <button type="button" className="btn primary" id="nb-add" onClick={() => open()}>Add food</button>
        </div>
      </div>
      <RemovedNotice scope="diet" expires />
      {scanned && <div className="nb-scan"><ScanFood key={scanned.hit.id} hit={scanned.hit} day={scanned.day} onDone={setMsg} onCancel={() => setScanned(null)} /></div>}
      <p className="note nb-msg" role="status">{msg}</p>
      {shown === 7 ? (
        <div className="wb-board nb-board">{views.map(v => <DayColumn key={v.day} v={v} today={today} selected={v.day === day} days={moveTargets} onPick={() => setPicked(v.day)} onLog={log} onMsg={setMsg} onAdd={meal => open(undefined, v.day, meal)} />)}</div>
      ) : (
        <>
          {!phone && <DayStepper today={today} day={day} onPick={pickDay} />}
          {phone && (
            <div className="nb-links" role="group" aria-label="Nutrition settings">
              <button type="button" className="nb-link" id="nb-manage" onClick={() => st().openModal({ type: 'nbmanage' })}>Manage</button>
            </div>
          )}
          <div className={`wb-board nb-board nb-board-${shown}`}>{shownDays.map(d => <DayColumn key={d} v={views[days.indexOf(d)]!} today={today} selected={d === day} days={moveTargets} onPick={() => setPicked(d)} onLog={log} onMsg={setMsg} onAdd={meal => open(undefined, d, meal)} />)}</div>
        </>
      )}
    </section>
  );
}
