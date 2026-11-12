import { useState } from 'react';
import { entriesOn, entryFromFood, entryText, shiftDay } from '../../lib/dietLog.js';
import { planCopy } from '../../lib/dietSuggest.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { fmtDayDate, ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import './Diet.css';

// "Copy yesterday" (brief diet-suggest-and-copy): the day before the one shown, as a checklist with everything ticked; untick what you skip, then add the rest. The caller keys it by day, so an open checklist never outlives the day it was opened on.
export default function CopyDay({ day, onAdded }: { day: string; onAdded: (text: string) => void }) {
  const diet = useAppStore(s => s.diet);
  const today = ymd(useToday(s => s.today));
  const src = shiftDay(day, -1);
  const was = src === shiftDay(today, -1) ? 'yesterday' : fmtDayDate(src);
  const list = entriesOn(diet, src);
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const show = () => { setTicked(new Set(list.map(e => e.id))); setOpen(true); };
  const flip = (id: string) => setTicked(t => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = () => {
    const plan = planCopy(diet, src, day, ticked);
    onAdded(runInstantLog(useAppStore.getState().addDietEntry, plan.add.map(f => entryFromFood(day, f)), { left: plan.left }).text);
    setOpen(false);
  };
  if (!open) {
    return (
      <div className="dt-copy">
        <button type="button" className="btn sm" disabled={list.length === 0} onClick={show}>Copy {was}</button>
        {list.length === 0 && <span className="note"> Nothing logged {was}.</span>}
      </div>
    );
  }
  return (
    <fieldset className="dt-copy">
      <legend>Copy {was}</legend>
      <ul className="dt-copylist">
        {list.map(e => (
          <li key={e.id}>
            <label className="dt-copyrow"><input type="checkbox" checked={ticked.has(e.id)} onChange={() => flip(e.id)} /><span>{e.n} · {entryText(e)}</span></label>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="btn sm primary" disabled={ticked.size === 0} onClick={add}>Add selected</button>
      </div>
    </fieldset>
  );
}
