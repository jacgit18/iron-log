import { useState, type DragEvent, type ReactNode } from 'react';
import ArmedButton from './ArmedButton.jsx';

/* One entry of an Experiments list, Workout board or Stretches: the name (and a tag), the note, what the list adds, then the
   Add to day row with Edit and the two-tap Delete. The two lists differ only in their days, their extra lines and buttons. */
type Props = {
  id: string;
  /** Prefix for the day select's id: `exp` or `sexp`. */
  prefix: string;
  name: string;
  tag?: string;
  note?: string;
  /** Lines between the note and the actions (last log, the days it is on, a video link). */
  detail?: ReactNode;
  days: { value: number; label: string }[];
  /** The day the select shows. */
  to: number;
  onTo: (day: number) => void;
  onAdd: () => void;
  /** Buttons between Add and Edit (To program, To my stretches). */
  extra?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  /** Dragging onto a board day (Workout only). */
  drag?: { onStart: (e: DragEvent) => void; onEnd: () => void };
};

export default function ExperimentCard({ id, prefix, name, tag, note, detail, days, to, onTo, onAdd, extra, onEdit, onDelete, drag }: Props) {
  const [armed, setArmed] = useState(false); // Delete was pressed once
  const label = days.find(d => d.value === to)?.label ?? '';
  return (
    <li className={`expcard${armed ? ' removing' : ''}`} {...(drag ? { draggable: true, onDragStart: drag.onStart, onDragEnd: drag.onEnd } : {})}>
      {armed && <span className="rmtag">Will be deleted · tap Delete again</span>}
      <div><b className="rmname">{name}</b>{tag && <> <span className="tag">{tag}</span></>}</div>
      {note && <div className="note">{note}</div>}
      {detail}
      <div className="actions">
        <label htmlFor={`${prefix}-to-${id}`}>Add to</label>
        <select id={`${prefix}-to-${id}`} aria-label={`Add to (${name})`} value={to} onChange={ev => onTo(Number(ev.target.value))}>
          {days.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <button type="button" className="btn sm" aria-label={`Add ${name} to ${label}`} onClick={onAdd}>Add</button>
        {extra}
        <button type="button" className="btn sm ghost" aria-label={`Edit ${name}`} onClick={onEdit}>Edit</button>
        <ArmedButton className={`btn sm ${armed ? 'danger' : 'ghost'}`} label="Delete" armedLabel="Tap again to delete" aria-label={`Delete ${name}`} onArmedChange={setArmed} onConfirm={() => { setArmed(false); onDelete(); }} />
      </div>
    </li>
  );
}
