import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { restDateCap, restDatesOf } from '../../lib/logic.js';
import { addDays, fmtDayDate, ymd } from '../../shared/dates.js';
import Sheet from '../Sheet.jsx';
import './RestDateSheet.css';

// Change the date of one rest day: this week's seven days as chips. Days after today (or after the week's end for a week still
// to come) are dimmed and cannot be picked. Save changes only this rest day; Cancel changes nothing.
export default function RestDateSheet({ day }: { day: number }) {
  const weekStart = useAppStore(s => s.weekStart);
  const week = useAppStore(s => s.week);
  const dates = restDatesOf(week);
  const cap = restDateCap(weekStart);
  const [pick, setPick] = useState<string>(dates[day] || cap);
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(weekStart, i)));
  const st = useAppStore.getState();
  const save = () => { st.setRestDate(day, pick); st.closeModal(); };
  return (
    <Sheet>
      <h2 className="cond">Rest date, Day {day}</h2>
      <p className="note">Which day did you rest? Days that have not come yet cannot be picked.</p>
      <div className="restdate-chips" role="group" aria-label="Days of this week">
        {days.map(d => {
          const [name, md] = fmtDayDate(d).split(' ');
          const later = d > cap;
          return (
            <button key={d} type="button" className={`btn restdate-chip${d === pick ? ' on' : ''}`} aria-pressed={d === pick} disabled={later} onClick={() => setPick(d)}>
              <span>{name.slice(0, 3)}</span><span>{md}</span>
            </button>
          );
        })}
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Save date</button>
      </div>
    </Sheet>
  );
}
