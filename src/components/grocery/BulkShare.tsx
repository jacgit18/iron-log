import { useEffect, useRef, useState } from 'react';
import { allPeople } from '../../lib/grocerySettle.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Grocery } from '../../types.ts';
import Notice, { UNDO_MS } from '../Notice.js';
import './BulkShare.css';

// Select mode on To get (brief grocery-bulk-share): the Select button, and while it is on a sticky bar with the count, Clear and Share…. Share… opens the sheet
// (BulkShareSheet, through the store's `modal`); nothing changes until Apply there, and the sheet hands back a one-step Undo, which this shows because the sheet is closed by then.
// The picked ids are held by To get (its rows carry the checkboxes); SelectButton sits over the list; BulkShare (the bar and the Undo notice) sits under it, sticky above the tab bar like the Bought notice.
export interface BulkApplied { text: string; undo: () => boolean } // false: nothing was put back (data still loading), so the notice stays

/** The Select button over the list. Not shown when nobody is left to share with (as the per-row chip) or nothing is to get. */
export function SelectButton({ g, canSelect, selecting, onSelecting }: { g: Grocery; canSelect: boolean; selecting: boolean; onSelecting: (on: boolean) => void }) {
  if (!allPeople(g).length || (!canSelect && !selecting)) return null;
  return (
    <div className="bsrow">
      <button type="button" className={`btn sm${selecting ? ' primary' : ''}`} id="groc-select" aria-pressed={selecting} onClick={() => onSelecting(!selecting)}>{selecting ? 'Done' : 'Select items'}</button>
    </div>
  );
}

export default function BulkShare({ mk, selecting, picked, onSelecting, onClear }: { mk: string; selecting: boolean; picked: readonly string[]; onSelecting: (on: boolean) => void; onClear: () => void }) {
  const [applied, setApplied] = useState<(BulkApplied & { mk: string; t: number }) | null>(null);
  const focusSelect = useRef(false);
  useEffect(() => { if (focusSelect.current && !selecting) { document.getElementById('groc-select')?.focus(); focusSelect.current = false; } }, [selecting]);
  const n = picked.length;
  const share = () => useAppStore.getState().openModal({
    type: 'bulkshare', mk, ids: [...picked],
    onApplied: (a: BulkApplied) => { focusSelect.current = true; setApplied({ ...a, mk, t: Date.now() }); onSelecting(false); },
  });
  if (!selecting && !(applied && applied.mk === mk)) return null;
  return (
    <div className="bsdock">
      {applied && applied.mk === mk && (
        <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setApplied(null), key: applied.t }}
          actions={[{ label: 'Undo', onClick: () => { if (applied.undo()) setApplied(null); } }, { label: 'Dismiss', ghost: true, onClick: () => setApplied(null) }]}>{applied.text}</Notice>
      )}
      {selecting && (
        <div className="bsbar" role="region" aria-label="Selected items">
          <b role="status">{n} selected</b>
          <button type="button" className="btn sm" id="groc-select-clear" disabled={!n} onClick={onClear}>Clear</button>
          <button type="button" className="btn sm primary" id="groc-select-share" disabled={!n} onClick={share}>Change who shares</button>
        </div>
      )}
    </div>
  );
}
