import { useEffect, useRef } from 'react';
import { flag, useAppStore } from '../store/useAppStore.js';
import { ymd } from '../shared/dates.js';
import Notice, { UNDO_MS } from './Notice.jsx';
import RemovedNotice from './RemovedNotice.jsx';
import './Toaster.css';

/* The one place a message about something you just did appears, on every screen (it floats above the bottom bar and the rest
   timer, so it never pushes the page). Two sources:
     - the Board's notes (uncheck, skip, move heads-up, day-order suggestion) and its "Removed ..." notice, only while the Board shows;
     - the status line (store.saveFlag: "Saved", "Put back", errors), as an info notice. "Loading…" and the routine "Saved" are announced but not drawn.
   Each note is still cleared by its own store action; this only draws them. Removed notices on other screens stay beside their list. */
export default function Toaster({ info }: { info: string }) {
  const tab = useAppStore(s => s.tab);
  return (
    <div className="toasts">
      {/* The status line is the live region itself (always in the page, so the screen reader hears a message when it appears; a
          region added together with its text is often missed). It is the top item: the next tap clears it, and removing the top
          item moves nothing below it, so a button being pressed does not slide away from under the finger. "Loading…" and the routine "Saved"
          (after every write) are announced but not drawn. */}
      <div className="toastinfo" role="status" aria-live="polite" aria-atomic="true" id="live-status">
        {info === 'Loading…' || info === 'Saved' ? <span className="vh">{info}</span> : info && <Notice kind="info" silent actions={[]}>{info}</Notice>}
      </div>
      {tab === 'board' && <BoardNotices />}
    </div>
  );
}

// In priority order: the stack shows two (Toaster.css) and the rest wait behind them. Removed leads (it has the focus), then the
// ones that ask for an answer, then the ones that only report.
function BoardNotices() {
  const st = useAppStore.getState();
  const weekStart = useAppStore(s => s.weekStart);
  const week = useAppStore(s => s.week);
  const moveNote = useAppStore(s => s.moveNote);
  const orderNote = useAppStore(s => s.orderNote);
  const uncheckNote = useAppStore(s => s.uncheckNote);
  const skipNote = useAppStore(s => s.skipNote);
  const wk = ymd(weekStart);
  const showMove = moveNote && moveNote.week === wk;
  const showOrder = orderNote && orderNote.week === wk;
  const showUncheck = uncheckNote && uncheckNote.week === wk;
  const showSkip = skipNote && skipNote.week === wk && !!(week.skipped || {})[skipNote.slotId]; // gone once the card is back
  // After Apply the pressed button is gone, so focus goes to Undo.
  const undoRef = useRef<HTMLButtonElement>(null);
  const applied = !!(showOrder && orderNote.applied);
  useEffect(() => { if (applied && undoRef.current) undoRef.current.focus(); }, [applied]);
  // The heads-up and the suggestion come from the injury prevention switch, so they carry the way to turn it off.
  const turnOff = { label: 'Turn off', title: 'injury prevention', ghost: true, onClick: () => { st.setInjuryPrevention(false); flag('Injury prevention is off. Turn it back on in Settings.'); } };
  return (
    <div className="toastlist">
      {/* First, so it is always one of the two that show: the delete button that had focus went with its row, and focus goes to this Undo
          (ADR 023), which a queued (hidden) notice could not take. */}
      <RemovedNotice scope={'board:' + wk} expires />
      {showMove && (
        <Notice kind="warning" actions={[
          !!moveNote.alt && { label: `Move to Day ${moveNote.alt} instead`, onClick: () => st.moveSlot(moveNote.slot!, moveNote.alt!) },
          { label: 'Undo', title: `move back to Day ${moveNote.fromShown}`, onClick: st.undoMove },
          turnOff,
          { label: 'Dismiss', onClick: st.dismissMove, ghost: true },
        ]}><b>Heads-up:</b> {moveNote.lines.join(' ')}</Notice>
      )}
      {showOrder && (orderNote.applied ? (
        <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: st.dismissOrder, key: orderNote }} actions={[
          st.canUndoOrder() && { label: 'Undo', onClick: st.undoOrder, btnRef: undoRef },
          { label: 'Dismiss', onClick: st.dismissOrder, ghost: true },
        ]}>{orderNote.kind === 'card' ? 'Moved for this week.' : 'Order changed for this week.'}</Notice>
      ) : (
        <Notice kind="suggestion" actions={[{ label: 'Apply', onClick: st.applyOrder }, turnOff, { label: 'Dismiss', onClick: st.dismissOrder, ghost: true }]}>
          <b>Back-to-back:</b> {orderNote.lines.join(' ')}
        </Notice>
      ))}
      {showUncheck && (
        <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: st.dismissUncheck, key: uncheckNote }} actions={[{ label: 'Undo', onClick: st.undoUncheck }, { label: 'Dismiss', onClick: st.dismissUncheck, ghost: true }]}>{uncheckNote.text}</Notice>
      )}
      {showSkip && (
        <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: st.dismissSkip, key: skipNote }} actions={[{ label: 'Undo', onClick: st.undoSkip }, { label: 'Dismiss', onClick: st.dismissSkip, ghost: true }]}>{skipNote.text}</Notice>
      )}
    </div>
  );
}
