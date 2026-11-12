import { useEffect, useState } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { useAppStore } from '../../store/useAppStore.js';
import ArmedButton from '../ArmedButton.jsx';
import EntryForm from '../diet/EntryForm.js';
import Sheet from '../Sheet.js';

// The sheet an eaten row opens (brief nutrition-items-row-sheet-and-more): the food's numbers, Edit, and a two-tap Delete (ADR 023). `id` is the diet entry. Edit shows the same form the Add sheet uses; Delete goes through the same store action the old inline button did.
// If the entry is gone (deleted here, or by another device) the sheet closes itself, so nothing else changes.
export default function EatenRowSheet({ id }: { id: string }) {
  const entry = useAppStore(s => s.diet.find(e => e.id === id));
  const closeModal = useAppStore(s => s.closeModal);
  const [editing, setEditing] = useState(false);
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
  return (
    <Sheet className="nbsheet" aria-label={entry.n}>
      <h2 className="cond">{entry.n}</h2>
      <p className="nb-eatsheet-nums">{entryText(entry)}</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
        <ArmedButton className="btn danger" aria-label={`Delete ${entry.n}`} label="Delete" armedLabel="Tap again to delete" onConfirm={() => { useAppStore.getState().removeDietEntry(entry.id); }} />
        <button type="button" className="btn primary" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}
