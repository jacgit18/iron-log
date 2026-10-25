import type { BodyEntry, BodyGoal } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { weekStartOf, ymd, parseDate, fmtShort } from '../../shared/dates.js';
import { bwSorted, fmtLb, signed, goalStatus } from '../../lib/body.js';
import './BodyWeightRow.css';

function GoalNote({ goal, body, today }: { goal: BodyGoal; body: BodyEntry[]; today: Date }) {
  const g = goalStatus(goal, body, today);
  if (!g || !g.last) return null;
  return <span className="note">Goal {fmtLb(g.target)} lb · {g.reached ? 'reached' : `${fmtLb(Math.abs(g.left))} lb to go`}</span>;
}

/**
 * The row's form state (editing, and the typed number). It lives in BoardTab, above both places the row can be drawn (next to the mode menu on a
 * wide screen, under the notices on a phone), so turning a phone to landscape in the middle of an edit moves the row without losing what was typed.
 * It starts empty again when the week changes.
 */
export interface BodyWeightDraft { editing: boolean; value: string; setEditing: (v: boolean) => void; setValue: (v: string) => void }
export function useBodyWeightDraft(wk: string): BodyWeightDraft {
  const [s, setS] = useState({ wk, editing: false, value: '' });
  const now = s.wk === wk ? s : { wk, editing: false, value: '' };
  const next = (prev: typeof s, patch: Partial<typeof s>) => ({ ...(prev.wk === wk ? prev : { wk, editing: false, value: '' }), ...patch });
  return { editing: now.editing, value: now.value, setEditing: editing => setS(p => next(p, { editing })), setValue: value => setS(p => next(p, { value })) };
}

export default function BodyWeightRow({ draft }: { draft: BodyWeightDraft }) {
  const body = useAppStore(s => s.body);
  const weekStart = useAppStore(s => s.weekStart);
  const saveBodyWeight = useAppStore(s => s.saveBodyWeight);
  const goal = useAppStore(s => s.cfg.bwGoal);
  const today = useToday(s => s.today);
  const { editing, value, setEditing, setValue } = draft;

  const wk = ymd(weekStart);
  const cur = body.find(e => e.wk === wk);
  const prevList = bwSorted(body).filter(e => e.wk < wk); const prev = prevList[prevList.length - 1] || null;
  // The week part is dropped on phones (the week bar above already says which week it is).
  const sub = wk === ymd(weekStartOf(today)) ? ' this week' : `, week of ${fmtShort(weekStart)}`;
  const label = `Body weight${sub}`;
  const lead = <>Body weight<span className="bwsub">{sub}</span></>;

  if (cur && !editing) {
    const diff = prev ? Number(cur.w) - Number(prev.w) : null;
    return (
      <div className="bwrow">
        <span className="bwl">{lead}</span>
        <b>{fmtLb(cur.w)} lb</b>
        {diff != null && <span className="note">{diff === 0 ? 'same as' : `${signed(diff, 1)} lb vs`} {fmtShort(parseDate(prev.d))}</span>}
        {goal && <GoalNote goal={goal} body={body} today={today} />}
        <button type="button" className="btn sm ghost" onClick={() => { setValue(fmtLb(cur.w)); setEditing(true); }}>Edit</button>
      </div>
    );
  }
  return (
    <form className="bwrow" noValidate onSubmit={e => { e.preventDefault(); if (saveBodyWeight(value)) { setEditing(false); setValue(''); } }}>
      <label className="bwl" htmlFor="bw-in">{lead}</label>
      <span className="bwin">
        <input id="bw-in" type="number" inputMode="decimal" step="any" min="0" value={value} autoFocus={editing}
          onChange={e => setValue(e.target.value)} placeholder={prev ? fmtLb(prev.w) : 'lb'} aria-label={`${label} in pounds`} /> lb
      </span>
      <button type="submit" className="btn sm primary">Save</button>
      {cur && <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>}
    </form>
  );
}
