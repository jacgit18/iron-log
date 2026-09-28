import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { monday, ymd, parseDate, fmtShort } from '../../lib/dates.js';
import { bwSorted, fmtLb, signed } from '../../lib/body.js';

export default function BodyWeightRow() {
  const body = useAppStore(s => s.body);
  const weekStart = useAppStore(s => s.weekStart);
  const saveBodyWeight = useAppStore(s => s.saveBodyWeight);
  const today = useToday(s => s.today);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const wk = ymd(weekStart);
  const cur = body.find(e => e.wk === wk);
  const prevList = bwSorted(body).filter(e => e.wk < wk); const prev = prevList[prevList.length - 1] || null;
  const label = wk === ymd(monday(today)) ? 'Body weight this week' : `Body weight, week of ${fmtShort(weekStart)}`;

  if (cur && !editing) {
    const diff = prev ? Number(cur.w) - Number(prev.w) : null;
    return (
      <div className="bwrow">
        <span className="bwl">{label}</span>
        <b>{fmtLb(cur.w)} lb</b>
        {diff != null && <span className="note">{diff === 0 ? 'same as' : `${signed(diff, 1)} lb vs`} {fmtShort(parseDate(prev.d))}</span>}
        <button type="button" className="btn sm ghost" onClick={() => { setValue(fmtLb(cur.w)); setEditing(true); }}>Edit</button>
      </div>
    );
  }
  return (
    <form className="bwrow" noValidate onSubmit={e => { e.preventDefault(); if (saveBodyWeight(value)) { setEditing(false); setValue(''); } }}>
      <label className="bwl" htmlFor="bw-in">{label}</label>
      <span className="bwin">
        <input id="bw-in" type="number" inputMode="decimal" step="any" min="0" value={value} autoFocus={editing}
          onChange={e => setValue(e.target.value)} placeholder={prev ? fmtLb(prev.w) : 'lb'} aria-label={`${label} in pounds`} /> lb
      </span>
      <button type="submit" className="btn sm primary">Save</button>
      {cur && <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>}
    </form>
  );
}
