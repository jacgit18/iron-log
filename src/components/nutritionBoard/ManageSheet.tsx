import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { leaveSheet } from '../../lib/backNav.js';
import { weekDays, weekOf } from '../../lib/nutritionBoard.js';
import { dayToShow, usePickedDay } from '../../lib/nutritionDayPick.js';
import { ymd } from '../../shared/dates.js';
import { navigate } from '../useRoute.js';
import Sheet from '../Sheet.js';
import SupplementLibrary from '../supplements/SupplementLibrary.jsx';
import ShoppingButton from './ShoppingButton.js';
import { usePhoneHeader } from './useWideBoard.js';
import '../supplements/Supplements.css';

// The Manage sheet (brief nutrition-board, PR 2): the places the old page scattered. Supplements and library opens the one supplement list here (brief supplement-merged-list);
// Meals and foods (opens Recipes) opens the existing Recipes screen (the sheet closes first). The Water reminder row moved to Targets and goal (brief nutrition-manage-cleanup).
export default function ManageSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  const modal = useAppStore(s => s.modal);
  const today = ymd(useToday(t => t.today)), phone = usePhoneHeader(), kept = usePickedDay();
  const [note, setNote] = useState('');
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
      <ul className="nb-manage">
        <li><button type="button" className="btn" id="sched-edit" onClick={() => setEditing(true)}>Supplements and library</button><span className="note">Edit what you take and when, and your whole supplement list.</span></li>
        <li><button type="button" className="btn" id="nb-manage-meals" onClick={() => leave(() => { useAppStore.getState().setTab('daily'); navigate('daily/recipes', 'push'); })}>Meals and foods (opens Recipes)</button><span className="note">Open Recipes: your meals, foods and recipes.</span></li>
        {phone && <li><ShoppingButton week={weekDays(today, weekOf(today, dayToShow(kept, today)))} today={today} onMsg={setNote} onAdded={closeModal} /><span className="note">Put what this week's planned recipes are missing on Shopping.</span></li>}
      </ul>
      {note && <p className="note" role="status">{note}</p>}
      <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Done</button></div>
    </Sheet>
  );
}
