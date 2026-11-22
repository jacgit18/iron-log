import { useMemo, useState } from 'react';
import { effectivePlan } from '../../lib/dailySnacks.js';
import { entryFromFood } from '../../lib/dietLog.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { recommendInputs } from '../../lib/manageTargets.js';
import { planLog, type Resolved } from '../../lib/dietPlan.js';
import { recommend, targetsFor } from '../../lib/dietTarget.js';
import { ADD_FLOWS, addingTo, dayOnArrival, dayView, foodEditable, oldestLogged, stepWeek, toolbarFlows, weekDates, weekDays, weekLabel, weekOf, weekRange, windowDays, type WeekOffset } from '../../lib/nutritionBoard.js';
import { nutritionTabs, shadeTabs } from '../../lib/weekDayTabs.js';
import { dayToShow, setPickedDay, usePickedDay } from '../../lib/nutritionDayPick.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useLegacyMeals } from '../../store/useLegacyMeals.js';
import { useToday } from '../../store/useToday.js';
import type { FoodHit } from '../../shared/foods.js';
import type { PlanSlot } from '../../types.ts';
import Icon from '../Icon.jsx';
import UndoButton from '../UndoButton.js';
import WeekDayCard from '../WeekDayCard.js';
import RemovedNotice from '../RemovedNotice.jsx';
import ScanFood from '../diet/ScanFood.js';
import DayColumn from './DayColumn.js';
import type { Say } from '../../lib/eatenStep.js';
import ShoppingButton from './ShoppingButton.js';
import WeekPicker from './WeekPicker.js';
import { useDaysShown, usePhoneHeader } from './useWideBoard.js';
import '../diet/board/WeekBoard.css';
import './NutritionBoard.css';


// Nutrition as one week board (brief nutrition-board): a week switcher (previous and next arrows like the Board's, This week to come back) in one joined card: the week row with the dates and Manage, under 1440 px the seven day tabs (the days drawn as columns shaded), and from 700 px the add-food toolbar naming the day it adds to (on a phone the toolbar is below the card), and day columns: seven from 1440 px, three from 1000, two from 768, else one day.
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
  const grocery = useAppStore(s => s.grocery), groceryMonths = useAppStore(s => s.groceryMonths);
  const kept = usePickedDay(); // the picked day lives outside this component so leaving for Recipes and coming back keeps it (lib/nutritionDayPick.ts); a reload shows today
  const setPicked = setPickedDay;
  const [anchor, setAnchor] = useState(today); // the first day of the 1 to 3 day window; tapping a column inside it keeps the window still, only the stepper moves it
  const [msg, setMsgText] = useState('');
  const [undo, setUndo] = useState<(() => void) | null>(null); // the status line's Undo (a log, a saved usual portion); any new sentence without one clears it
  const setMsg: Say = (t, u) => { setMsgText(t); setUndo(u ? () => u : null); };
  const [scanned, setScanned] = useState<{ hit: FoodHit; day: string } | null>(null); // the day is the one the scan began on, so picking another day before Save and log it does not move the entry
  const oldest = useMemo(() => oldestLogged(diet), [diet]); // the oldest logged day sets how far back the weeks reach
  const range = useMemo(() => weekRange(today, oldest), [today, oldest]);
  const day = dayToShow(kept, today, oldest);
  const offset = weekOf(today, day);
  const days = useMemo(() => weekDays(today, offset), [today, offset]);
  const shownDays = windowDays(days, windowDays(days, anchor, shown).includes(day) ? anchor : day, shown);
  const plan = useMemo(() => effectivePlan(cfg.diet, days, today, recipes), [cfg.diet, days, today, recipes]); // the stored plan plus the saved daily snacks shown on each day (brief daily-snacks)
  const legacy = useLegacyMeals();
  const targets = useMemo(() => {
    const { latest, goalLb, weeksLeft } = recommendInputs(cfg.bwGoal, body, now);
    const t = targetsFor(cfg.diet, recommend(goalLb, latest, weeksLeft, cfg.diet));
    return { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs };
  }, [cfg.bwGoal, cfg.diet, body, now]);
  const gate = useMemo(() => ({ today, g: grocery, months: groceryMonths, diet }), [today, grocery, groceryMonths, diet]); // what hides a ready-made food that is Need (lib/haveOnly.ts)
  const views = useMemo(() => days.map(d => dayView(d, today, { gate, plan, recipes, meals: legacy.held, moved: legacy.moved, diet, supp, body, targets, hintsOff: cfg.diet?.hintsOff, hintSkips: cfg.diet?.hintSkips })), [days, today, gate, plan, recipes, legacy, diet, supp, body, targets, cfg.diet?.hintsOff, cfg.diet?.hintSkips]);
  const st = () => useAppStore.getState();
  const goWeek = (o: WeekOffset) => { setPicked(dayOnArrival(today, o)); setMsg(''); };
  const prevWeek = stepWeek(offset, -1, range), nextWeek = stepWeek(offset, 1, range); // null at an end: the arrow stops
  const log = (r: Resolved, index: number) => {
    const out = planLog(r, st().diet, today, recipes);
    if ('error' in out) { setMsg(out.error); return; }
    const run = runInstantLog(st().addDietEntry, out.add.map(f => entryFromFood(today, f)), { from: r.name, left: out.left });
    if (run.ids.length) st().setPlanEaten(today, index, run.ids); // the planned item shows a check
    setMsg(run.text);
  };
  const scan = () => st().openModal({ type: 'barcode', onFound: (h: FoodHit) => setScanned({ hit: h, day }), onType: () => setTimeout(() => open('find', day, undefined, true), 0) }); // a miss: Type the name opens Find food, after the barcode sheet has closed itself
  const open = (flow?: string, forDay = day, meal?: PlanSlot, typing = false) => st().openModal({ type: 'nbadd', day: forDay, ...(flow ? { flow } : {}), ...(meal ? { meal } : {}), ...(typing ? { resume: {} } : {}), onScan: (h: FoodHit) => setScanned({ hit: h, day: forDay }), onMsg: setMsg }); // `typing`: arriving from a scan miss, so Find food puts the cursor in its search box
  const target = addingTo(day, today);
  const weekSwitch = (
    <div className="weeknav nb-weeksw" role="group" aria-label="Week">
      <button type="button" className="btn sm" aria-label="Previous week" aria-disabled={prevWeek === null} onClick={() => { if (prevWeek !== null) goWeek(prevWeek); }}><Icon name="chevron-left" /></button>
      <WeekPicker today={today} offset={offset} range={range} phone={phone} dates={weekDates(today, offset)} onPick={goWeek} />
      <button type="button" className="btn sm" aria-label="Next week" aria-disabled={nextWeek === null} onClick={() => { if (nextWeek !== null) goWeek(nextWeek); }}><Icon name="chevron-right" /></button>
      {offset !== 0 && <button type="button" className="btn sm ghost" onClick={() => goWeek(0)}>This week</button>}
    </div>
  );
  const joined = phone || shown !== 7; // the day tabs are in the card wherever there are fewer than seven columns (brief week-day-joined-tabs); at 1440 px the seven columns are the day control, so the card has the week row and the add-food toolbar only (brief week-day-joined-tabs)
  const tabs = joined ? (phone ? nutritionTabs(today, offset) : shadeTabs(nutritionTabs(today, offset), shownDays)) : [];
  const pickDay = (d: string) => { setPicked(d); setAnchor(shownDays.includes(d) ? shownDays[0]! : d); setMsg(''); };
  const dates = <p className="nb-weeklab" role="status">{weekLabel(today, offset)}</p>;
  const toolbar = (
    <div className="nb-toolbar" role="group" aria-label="Add food">
      <span className="nb-target nb-target-quiet">{target}</span>
      <div className="nb-tbtns">
        {!phone && foodEditable(day, today) && <ShoppingButton week={days} today={today} onMsg={setMsg} />}
        {toolbarFlows(day, today).map(f => <button key={f} type="button" className="btn" onClick={() => (f === 'barcode' ? scan() : open(f))}>{ADD_FLOWS[f].label}</button>)}
        <button type="button" className="btn primary" id="nb-add" onClick={() => open()}>Add food</button>
      </div>
    </div>
  );
  return (
    <section className="wb nb" aria-labelledby="nb-h">
      <div className="nb-head">
        <h2 id="nb-h" className="cond vh">Nutrition</h2>
      </div>
      <WeekDayCard tabs={tabs} selected={day} onPick={pickDay} idPrefix="nbdaytab-" controls={() => 'nb-day-panel'} footer={phone ? undefined : toolbar}>
        {weekSwitch}
        {!phone && dates}
        <button type="button" className="btn sm nb-cardmanage" id="nb-manage" onClick={() => st().openModal({ type: 'nbmanage' })}>Manage</button>
      </WeekDayCard>
      {phone && dates}
      {phone && toolbar}
      {phone && <ShoppingButton bar week={days} today={today} onMsg={setMsg} />}
      <RemovedNotice scope="diet" expires />
      {scanned && <div className="nb-scan"><ScanFood key={scanned.hit.id} hit={scanned.hit} day={scanned.day} onDone={setMsg} onCancel={() => setScanned(null)} /></div>}
      <p className="note nb-msg" role="status">{msg}{undo && <UndoButton onUndo={() => { setMsg('Undone.'); undo(); }} />}</p>
      {shown === 7 ? (
        <div className="wb-board nb-board">{views.map(v => <DayColumn key={v.day} v={v} today={today} selected={v.day === day} onPick={() => setPicked(v.day)} onLog={log} onMsg={setMsg} onAdd={meal => open(undefined, v.day, meal)} />)}</div>
      ) : (
        <>
          <div id="nb-day-panel" className={`wb-board nb-board nb-board-${shown}`}>{shownDays.map(d => <DayColumn key={d} v={views[days.indexOf(d)]!} today={today} selected={d === day} onPick={() => setPicked(d)} onLog={log} onMsg={setMsg} onAdd={meal => open(undefined, d, meal)} />)}</div>
        </>
      )}
    </section>
  );
}
