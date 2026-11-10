import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { exInfo } from '../../lib/data.js';
import { ideaDayChoices } from '../../lib/ideaDays.js';
import { todayCol } from '../../lib/logic.js';
import { ymd, weekStartOf } from '../../shared/dates.js';
import Sheet from '../Sheet.jsx';
import './MoveSheet.css';
import '../program/RowMenuSheet.css';
import './IdeaAddSheet.css';

// Board > Ideas to try > Add: choose "This week only" or "Every week (program)", then the day. This week adds a card to the viewed week with Undo;
// Every week opens the add-to-program sheet for that day.
export default function IdeaAddSheet({ id }: { id: string }) {
  const cfg = useAppStore(s => s.cfg);
  const idea = useAppStore(s => s.experiments.find(x => x.id === id));
  const week = useAppStore(s => s.week);
  const weekStart = useAppStore(s => s.weekStart);
  const today = useToday(s => s.today);
  const [mode, setMode] = useState<'week' | 'program'>('week');
  if (!idea) return null;
  const name = exInfo(cfg, idea.ex).n;
  const days = ideaDayChoices(week, idea.ex, ymd(weekStartOf(today)) === ymd(weekStart) ? todayCol(today) : null);
  const pick = (col: number) => {
    const st = useAppStore.getState();
    if (mode === 'program') { st.openAddToProgram(col, id); return; }
    const before = new Set((st.week.extra || []).map(x => x.id));
    const ok = st.addToDay(id, col); st.closeModal();
    const added = ok ? (useAppStore.getState().week.extra || []).find(x => !before.has(x.id)) : null;
    if (!added) return;
    // Undo takes out only the card just added; if it is already gone it does nothing. It returns false so the "Put back" flag stays quiet.
    st.noteRemoved('experiments', `${name} to Day ${col} this week`, () => { const s = useAppStore.getState(); if ((s.week.extra || []).some(x => x.id === added.id)) { s.removeExtra(added.id); s.dismissRemoved(); } return false; }, 'Added');
  };
  return (
    <Sheet>
      <h2 className="cond">Add {name}</h2>
      <div className="iaseg" role="group" aria-label="When to add it">
        <button type="button" className="btn" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>This week only</button>
        <button type="button" className="btn" aria-pressed={mode === 'program'} onClick={() => setMode('program')}>Every week (program)</button>
      </div>
      <p className="note iahelp">{mode === 'week' ? 'Adds a card to the week you are viewing. Next week it is gone.' : 'Adds it to your program, so it comes back every week.'}</p>
      <div className="mvs-label" id="ia-day">Day</div>
      {days.length ? (
        <div className="mvs-chips rowdays" role="group" aria-labelledby="ia-day">
          {days.map(d => (
            <button key={d.col} type="button" className={`btn mvs-chip mvs-day iaday${d.on ? ' on' : ''}${d.today ? ' today' : ''}`} aria-label={`Day ${d.col}`} onClick={() => pick(d.col)}>
              <span>{d.col}</span>{d.on ? <small>On</small> : d.today ? <small>Today</small> : null}
            </button>
          ))}
        </div>
      ) : <p className="note">No days to add to.</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={() => useAppStore.getState().closeModal()}>Close</button>
      </div>
    </Sheet>
  );
}
