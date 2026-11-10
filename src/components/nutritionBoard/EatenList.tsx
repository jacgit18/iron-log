import { useState } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { shortDay } from '../../lib/nutritionBoard.js';
import type { Micro } from '../../shared/foodMicro.js';
import { useAppStore } from '../../store/useAppStore.js';
import EntryForm from '../diet/EntryForm.js';

// What was eaten on a day, in one list (eaten food has no meal). Today's list (`also`) holds only food that is not a planned item, and says nothing when there is none: planned food shows its check in its meal. Today's entries can be edited and deleted; earlier days are read-only.
export default function EatenList({ day, entries, editable, note, also = false }: { day: string; entries: { id: string; n: string; kcal: number; p: number; c?: number; f?: number; micro?: Micro }[]; editable: boolean; note: string | null; also?: boolean }) {
  const [editId, setEditId] = useState<string | null>(null);
  if (also && entries.length === 0) return null;
  return (
    <div className="wb-slot nb-eaten">
      <div className="wb-slothd"><b>{also ? 'Also eaten' : 'Eaten'}</b><span>{entries.length ? `${entries.length} logged` : ''}</span></div>
      {entries.length === 0 && <span className="nb-empty">Nothing logged</span>}
      <ul className="nb-eatlist" aria-label={`${also ? 'Also eaten' : 'Eaten'} on ${shortDay(day)}`}>
        {entries.map(e => (
          <li key={e.id} className="nb-eat">
            {editId === e.id ? (
              <EntryForm idp={`nb-e-${e.id}`} initial={{ n: e.n, kcal: e.kcal, p: e.p, ...(e.c !== undefined ? { c: e.c } : {}), ...(e.f !== undefined ? { f: e.f } : {}) }} submitLabel="Save" onCancel={() => setEditId(null)}
                amounts={{ ...(e.micro ? { micro: e.micro } : {}), kcal: e.kcal }}
                onSubmit={v => { const err = useAppStore.getState().updateDietEntry(e.id, v); if (!err) setEditId(null); return err; }} />
            ) : (
              <>
                <span className="nb-eatn">{e.n}</span>
                <span className="wb-cm">{entryText(e)}</span>
                {editable && (
                  <span className="nb-eatacts">
                    <button type="button" className="btn sm" aria-label={`Edit ${e.n}`} onClick={() => setEditId(e.id)}>Edit</button>
                    <button type="button" className="btn sm" aria-label={`Delete ${e.n}`} onClick={() => useAppStore.getState().removeDietEntry(e.id)}>Delete</button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="wb-fatnote">{note}</p>}
    </div>
  );
}
