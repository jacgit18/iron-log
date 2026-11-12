import { useEffect, useState } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { eatenTargets } from '../../lib/moveCopyEaten.js';
import { dayGroups } from '../../lib/nutritionBoard.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import ArmedButton from '../ArmedButton.jsx';
import EntryForm from '../diet/EntryForm.js';
import Sheet from '../Sheet.js';

// The sheet an eaten row opens (brief nutrition-items-row-sheet-and-more): the food's numbers, Edit, and a two-tap Delete (ADR 023). `id` is the diet entry. Edit shows the same form the Add sheet uses; Delete goes through the same store action the old inline button did.
// Move to and Copy to (brief nutrition-move-copy-eaten): pick a day, the same food goes there (the hour stays, so the meal rule is unchanged), one sentence says what happened. Move also removes the original and offers Undo.
// If the entry is gone (deleted here, or by another device) the sheet closes itself, so nothing else changes.
export default function EatenRowSheet({ id }: { id: string }) {
  const entry = useAppStore(s => s.diet.find(e => e.id === id));
  const closeModal = useAppStore(s => s.closeModal);
  const modal = useAppStore(s => s.modal);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<'copy' | 'move' | null>(null);
  useEffect(() => { if (!entry) closeModal(); }, [entry, closeModal]);
  if (!entry) return null;
  if (editing) {
    return (
      <Sheet className="nbsheet" aria-label={`Edit ${entry.n}`}>
        <h2 className="cond">Edit {entry.n}</h2>
        <EntryForm idp={`nb-e-${entry.id}`} initial={{ n: entry.n, kcal: entry.kcal, p: entry.p, ...(entry.c !== undefined ? { c: entry.c } : {}), ...(entry.f !== undefined ? { f: entry.f } : {}) }} submitLabel="Save" onCancel={() => setEditing(false)}
          amounts={{ ...(entry.micro ? { micro: entry.micro } : {}), kcal: entry.kcal }}
          onSubmit={v => { const err = useAppStore.getState().updateDietEntry(entry.id, v); if (!err) setEditing(false); return err; }} />
      </Sheet>
    );
  }
  const today = ymd(new Date());
  const targets = eatenTargets(entry, today, dayGroups(today).flatMap(g => g.days));
  const move = picking === 'move';
  const go = (toDay: string) => {
    const { id: _id, ...draft } = entry;
    const run = runInstantLog(() => useAppStore.getState().copyDietEntry(entry.id, toDay, move), [{ ...draft, d: toDay }], { from: entry.n, ...(move ? { verb: 'Moved' } : {}) });
    (modal?.onMsg as ((t: string) => void) | undefined)?.(run.text);
    closeModal();
  };
  return (
    <Sheet className="nbsheet" aria-label={entry.n}>
      <h2 className="cond">{entry.n}</h2>
      <p className="nb-eatsheet-nums">{entryText(entry)}</p>
      {picking && (
        <div className="nb-eatdays" role="group" aria-label={`${move ? 'Move' : 'Copy'} to day`}>
          {targets.map(d => <button type="button" key={d.id} className="btn" onClick={() => go(d.id)}>{d.label}</button>)}
        </div>
      )}
      <div className="actions">
        {targets.length > 0 && <button type="button" className="btn" aria-pressed={picking === 'copy'} onClick={() => setPicking(picking === 'copy' ? null : 'copy')}>Copy to…</button>}
        {targets.length > 0 && <button type="button" className="btn" aria-pressed={move} onClick={() => setPicking(move ? null : 'move')}>Move to…</button>}
        <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
        <ArmedButton className="btn danger" aria-label={`Delete ${entry.n}`} label="Delete" armedLabel="Tap again to delete" onConfirm={() => { useAppStore.getState().removeDietEntry(entry.id); }} />
        <button type="button" className="btn primary" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}
