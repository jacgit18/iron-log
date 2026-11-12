import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { leaveSheet } from '../../lib/backNav.js';
import { recommend } from '../../lib/dietTarget.js';
import { goalLine, recommendInputs, weightLine } from '../../lib/manageTargets.js';
import { weekDays, weekOf } from '../../lib/nutritionBoard.js';
import { dayToShow, usePickedDay } from '../../lib/nutritionDayPick.js';
import { requestSettingsJump } from '../../lib/settingsJump.js';
import { ymd } from '../../shared/dates.js';
import { navigate } from '../useRoute.js';
import DietTargets from '../diet/DietTargets.js';
import Sheet from '../Sheet.js';
import SupplementLibrary from '../supplements/SupplementLibrary.jsx';
import ShoppingButton from './ShoppingButton.js';
import { usePhoneHeader } from './useWideBoard.js';
import WaterGoal from './WaterGoal.js';
import '../diet/Diet.css';
import '../supplements/Supplements.css';

// The Manage sheet (brief nutrition-board, PR 2; brief targets-into-manage): daily targets, weight and goal (read-only: weight is typed on the Board, the goal is edited in Progress), the base water goal with its reminder link, and the places the old page scattered. Supplements and library opens the one supplement list here (brief supplement-merged-list);
// Meals and foods (opens Recipes) opens the existing Recipes screen (the sheet closes first).
export default function ManageSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  const modal = useAppStore(s => s.modal);
  const cfg = useAppStore(s => s.cfg);
  const body = useAppStore(s => s.body);
  const now = useToday(s => s.today);
  const { latest, goalLb, weeksLeft } = recommendInputs(cfg.bwGoal, body, now);
  const rec = recommend(goalLb, latest, weeksLeft, cfg.diet);
  const today = ymd(now), phone = usePhoneHeader(), kept = usePickedDay();
  const [note, setNote] = useState('');
  const waterRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (modal?.section === 'water') waterRef.current?.scrollIntoView({ block: 'start' }); }, [modal?.section]); // the drink sheet's Change base goal lands on Water, not at the top
  const shownDay = dayToShow(kept, today), week = useMemo(() => weekDays(today, weekOf(today, shownDay)), [today, shownDay]); // one array per day shown, so the button's memos hold
  const [editing, setEditing] = useState(modal?.view === 'editor'); // reopened here after a library item was saved from its own sheet
  const leave = (go: () => void) => leaveSheet(window.history, window, go, closeModal); // a page opened at once would be undone by the sheet's own Back step (lib/backNav.ts)
  if (editing) {
    return (
      <Sheet className="nbsheet" aria-label="Manage supplements">
        <h2 className="cond" id="sched-h">Supplements and library</h2>
        <SupplementLibrary />
        <div className="actions">
          <button type="button" className="btn" id="sched-back" onClick={() => setEditing(false)}>Back to Manage</button>
          <button type="button" className="btn primary" id="sched-done" onClick={closeModal}>Done</button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet className="nbsheet" aria-label="Manage">
      <h2 className="cond">Manage</h2>
      <div className="sect nb-sect-first">Daily targets</div>
      <div className="dt"><DietTargets typed={cfg.diet} rec={rec} goalLb={goalLb} hasDate={weeksLeft !== null && weeksLeft > 0} /></div>
      <div className="sect">Weight and goal</div>
      <p className="nb-ro" id="nb-manage-weight">{weightLine(body)} <button type="button" className="nb-inlink" id="nb-manage-weight-edit" onClick={() => leave(() => useAppStore.getState().setTab('board'))}>{latest !== null ? 'Weigh in on the Board' : 'Add one on the Board'}</button></p>
      <p className="nb-ro" id="nb-manage-goal">{goalLine(cfg.bwGoal)} <button type="button" className="nb-inlink" id="nb-manage-goal-edit" onClick={() => leave(() => { useAppStore.getState().setTab('progress'); navigate('progress/trends', 'push'); })}>Edit in Progress</button></p>
      <div className="sect" id="nb-manage-water-h" ref={waterRef}>Water</div>
      <WaterGoal day={today} />
      <ul className="nb-manage">
        <li><button type="button" className="btn" id="nb-manage-water" onClick={() => leave(() => { requestSettingsJump('alerts'); useAppStore.getState().setTab('settings'); })}>Water reminder</button><span className="note">Open Settings: the reminder is under Alerts.</span></li>
      </ul>
      <div className="sect">Library</div>
      <ul className="nb-manage">
        <li><button type="button" className="btn" id="sched-edit" onClick={() => setEditing(true)}>Supplements and library</button><span className="note">Edit what you take and when, and your whole supplement list.</span></li>
        <li><button type="button" className="btn" id="nb-manage-meals" onClick={() => leave(() => { useAppStore.getState().setTab('daily'); navigate('daily/recipes', 'push'); })}>Meals and foods (opens Recipes)</button><span className="note">Open Recipes: your meals, foods and recipes.</span></li>
        {phone && <li><ShoppingButton week={week} today={today} onMsg={setNote} onAdded={closeModal} /><span className="note">Put what this week's planned recipes are missing on Shopping.</span></li>}
      </ul>
      {note && <p className="note" role="status">{note}</p>}
      <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Done</button></div>
    </Sheet>
  );
}
