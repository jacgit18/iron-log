import { useState } from 'react';
import type { FlatSlot } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { exInfo } from '../../lib/data.js';
import { isItemDone } from '../../lib/logic.js';
import { logButtonLabel } from '../../lib/loggedEntry.js';
import { finishedPills, finishedRows, type FinishedRow } from '../../lib/finishedGroup.js';
import Icon from '../Icon.jsx';
import './FinishedGroup.css';

// A day's done and skipped cards, folded into one bar below the open cards (brief finished-group-fold). Closed on first view; the open state is
// local, so it forgets on reload. The buttons are the card's own actions (Edit opens the Log sheet, Untick and Undo skip are the checkbox and
// the Undo skip button), so the same notices and announcements fire.
type Props = { day: number; cards: FlatSlot[]; tally: { done: number; skipped: number } };

export default function FinishedGroup({ day, cards, tally }: Props) {
  const [open, setOpen] = useState(false);
  const cfg = useAppStore(s => s.cfg);
  const week = useAppStore(s => s.week);
  const logs = useAppStore(s => s.logs);
  const wk = useAppStore(s => s.weekKey());
  const rows = open ? finishedRows(cards, week) : [];
  const barId = `finished-bar-${day}`; const listId = `finished-list-${day}`;
  const nameOf = (r: FinishedRow) => r.exs.map(ex => exInfo(cfg, ex).n).join(r.join);
  const card = (r: FinishedRow) => cards.find(c => c.id === r.slotId)!;

  // The row that had focus goes away when its action runs: hand focus to the bar, or to the day's title when the bar goes too.
  const refocus = () => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => (document.getElementById(barId) ?? document.getElementById(`colh-${day}`))?.focus()); };
  const untick = (r: FinishedRow) => { const st = useAppStore.getState(); if (r.whole) st.checkCard(r.slotId, false); else st.checkItem(r.slotId, r.idx, false); refocus(); };
  const undoSkip = (r: FinishedRow) => { const st = useAppStore.getState(); if (r.whole) st.skipCard(r.slotId); else st.skipItem(r.slotId, r.idx); refocus(); };

  return (
    <div className="finished">
      <button type="button" className="finishedbar" id={barId} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(o => !o)}>
        <span className="finishedchev" aria-hidden="true"><Icon name="chevron-right" /></span>
        <span className="finishedtitle">Finished ({cards.length})</span>
        {finishedPills(tally).map(p => <span key={p.kind} className={`finishedpill ${p.kind}`}>{p.text}</span>)}
      </button>
      {open && (
        <ul className="finishedrows" id={listId} aria-label="Finished exercises">
          {rows.map(r => {
            const name = nameOf(r);
            const c = card(r);
            const done = r.kind === 'done';
            const label = done && logButtonLabel(logs[r.exs[0]!], r.slotId, wk, isItemDone(c, r.idx, week), false) === 'Edit' ? 'Edit' : 'Log';
            return (
              <li key={r.key} className={`finishedrow ${r.kind}`}>
                <span className="finishedmark" aria-hidden="true">{done ? <Icon name="check" /> : '–'}</span>
                <span className="finishedname">{name}</span>
                <span className="finishedacts">
                {done && <button type="button" className="btn sm ghost" id={`fin-log-${r.key}`} aria-label={`${label} ${name}`} onClick={() => useAppStore.getState().openModal({ type: 'log', slotId: r.slotId, idx: r.idx })}>{label}</button>}
                {done
                  ? <button type="button" className="btn sm ghost" id={`fin-undo-${r.key}`} aria-label={`Untick ${name}`} onClick={() => untick(r)}>Untick</button>
                  : <button type="button" className="btn sm ghost" id={`fin-undo-${r.key}`} aria-label={`Undo skip for ${name}`} onClick={() => undoSkip(r)}>Undo skip</button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
