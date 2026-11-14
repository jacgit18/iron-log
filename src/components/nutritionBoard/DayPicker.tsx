import { useState } from 'react';
import { pickerWeek, quickPicks, type PickerSource } from '../../lib/dayPicker.js';
import { parseDate } from '../../shared/dates.js';
import Icon from '../Icon.js';
import './DayPicker.css';

// The multi-day picker (brief nutrition-multi-day-picker, option C): quick picks, a week strip with arrows over every day the food can reach, tick several days. It only holds the strip's week; the ticked days (`picked`) belong to the sheet, which draws its own button ("Copy to 5 days"). `single` is Move: one day at a time, no quick picks. The rules (greyed days and why, quick-pick day sets, the week rows) are `src/lib/dayPicker.ts`.
export default function DayPicker({ source, today, picked, onPick, single = false, start, label }: {
  source: PickerSource; today: string; picked: readonly string[]; onPick: (days: string[]) => void; single?: boolean; /** The day whose week opens first (default: today). */ start?: string; label: string;
}) {
  const [from, setFrom] = useState(start ?? today);
  const week = pickerWeek(source, today, from);
  const quick = single ? [] : quickPicks(source, today);
  const tick = (id: string) => onPick(single ? (picked[0] === id ? [] : [id]) : picked.includes(id) ? picked.filter(d => d !== id) : [...picked, id].sort());
  const first = parseDate(week.start), last = parseDate(week.days[6]!.id);
  const month = (d: Date, long = false) => d.toLocaleDateString('en-US', { month: long ? 'long' : 'short' });
  const range = `${month(first)} ${first.getDate()} to ${first.getMonth() === last.getMonth() ? '' : `${month(last)} `}${last.getDate()}`;
  const reasons = [...new Set(week.days.filter(d => d.reason && d.id !== (source.kind === 'eaten' ? source.entry.d : source.day)).map(d => d.reason!))];
  return (
    <div className="dpick" role="group" aria-label={label}>
      {quick.length > 0 && (
        <div className="dpick-quick" role="group" aria-label="Quick picks">
          {quick.map(q => <button key={q.id} type="button" className="btn sm" onClick={() => onPick(q.days)}>{q.label}</button>)}
          <button type="button" className="btn sm" disabled={!picked.length} onClick={() => onPick([])}>Clear</button>
        </div>
      )}
      <div className="dpick-head">
        <button type="button" className="btn dpick-arrow" aria-label="Earlier week" disabled={!week.prev} onClick={() => week.prev && setFrom(week.prev)}><Icon name="chevron-left" /></button>
        <b className="dpick-range" aria-live="polite">{range}</b>
        <button type="button" className="btn dpick-arrow" aria-label="Later week" disabled={!week.next} onClick={() => week.next && setFrom(week.next)}><Icon name="chevron-right" /></button>
      </div>
      <div className="dpick-days">
        {week.days.map(d => {
          const dt = parseDate(d.id), on = picked.includes(d.id), name = dt.toLocaleDateString('en-US', { weekday: 'short' });
          return (
            <button key={d.id} type="button" className={`btn dpick-day${d.id === today ? ' today' : ''}`} aria-pressed={on} disabled={d.reason !== null} data-day={d.id} onClick={() => tick(d.id)}
              aria-label={`${name} ${dt.getDate()}${d.id === today ? ' · today' : ''}${d.reason ? `, ${d.reason}` : ''}`}>
              <small aria-hidden="true">{name}</small><span aria-hidden="true">{dt.getDate()}</span>
            </button>
          );
        })}
      </div>
      {reasons.length > 0 && <p className="note dpick-why">{reasons.join(' ')}</p>}
      <p className="note dpick-chosen">Chosen: {picked.length ? picked.map(d => { const dt = parseDate(d); return `${dt.toLocaleDateString('en-US', { weekday: 'short' })} ${dt.getDate()}`; }).join(', ') : 'none yet'}</p>
    </div>
  );
}
