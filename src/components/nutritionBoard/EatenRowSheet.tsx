import { useEffect, useState } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { goLabel, pickerDays } from '../../lib/dayPicker.js';
import { canSaveToRecipe, portionBasis, recipeSaveBlock } from '../../lib/portionBasis.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import ArmedButton from '../ArmedButton.jsx';
import EntryForm from '../diet/EntryForm.js';
import DayPicker from './DayPicker.js';
import { MicroList } from './MicroLine.js';
import Sheet from '../Sheet.js';

// The sheet an eaten row opens (brief nutrition-items-row-sheet-and-more): the food's numbers, Edit, and a two-tap Delete (ADR 023). `id` is the diet entry. Edit shows the same form the Add sheet uses; Delete goes through the same store action the old inline button did.
// Move to and Copy to (briefs nutrition-move-copy-eaten, nutrition-multi-day-picker): the day picker (quick picks, week strip, tick several days) and one button; the same food goes to each day (the hour stays, so the meal rule is unchanged; a recipe-linked food may also go to a day ahead as a plan card), one sentence says what happened. Move takes one day, removes the original and offers Undo.
// If the entry is gone (deleted here, or by another device) the sheet closes itself, so nothing else changes.
export default function EatenRowSheet({ id }: { id: string }) {
  const entry = useAppStore(s => s.diet.find(e => e.id === id));
  const recipe = useAppStore(s => (entry?.from ? s.recipes.find(r => r.id === entry.from) : undefined));
  const closeModal = useAppStore(s => s.closeModal);
  const modal = useAppStore(s => s.modal);
  const today = ymd(useToday(s => s.today));
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(''); // why the recipe was not changed after a save with the tick on
  const [picking, setPicking] = useState<'copy' | 'move' | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (!entry) closeModal(); }, [entry, closeModal]);
  if (!entry) return null;
  if (editing) {
    const basis = portionBasis(entry);
    return (
      <Sheet className="nbsheet" aria-label={`Edit ${entry.n}`}>
        <h2 className="cond">Edit {entry.n}</h2>
        <EntryForm idp={`nb-e-${entry.id}`} initial={{ n: entry.n, kcal: entry.kcal, p: entry.p }} submitLabel="Save" onCancel={() => setEditing(false)}
          portion={{ basis, offerRecipeSave: canSaveToRecipe(recipe, basis.recorded) }}
          onSubmit={v => {
            const err = useAppStore.getState().updateDietEntry(entry.id, { n: v.n, kcal: v.kcal, p: v.p, c: v.c, f: v.f, micro: v.micro ?? null, ...(v.x !== undefined ? { x: v.x } : {}) });
            if (err) return err;
            setNote(''); // a line from an earlier save does not outlive the next one
            if (v.saveToRecipe && v.microPer && entry.from) {
              const why = recipeSaveBlock(useAppStore.getState().recipes.find(r => r.id === entry.from), basis.recorded); // the recipe may have changed since the sheet opened
              const failed = why ?? useAppStore.getState().setRecipeMicro(entry.from, v.microPer);
              if (failed) setNote(`Saved. ${failed} The recipe was not changed.`); // the entry is saved; say why the recipe was not touched
            }
            setEditing(false); return null;
          }} />
      </Sheet>
    );
  }
  const can = entry.d <= today && pickerDays({ kind: 'eaten', entry }, today).some(d => d.reason === null); // nothing to offer when every day is greyed
  const move = picking === 'move';
  const toggle = (to: 'copy' | 'move') => { setPicking(picking === to ? null : to); setPicked([]); };
  const go = () => {
    const r = useAppStore.getState().copyDietEntries(entry.id, picked, move);
    (modal?.onMsg as ((t: string) => void) | undefined)?.(r.message);
    closeModal();
  };
  return (
    <Sheet className="nbsheet" aria-label={entry.n}>
      <h2 className="cond">{entry.n}</h2>
      <p className="nb-eatsheet-nums">{entryText(entry)}</p>
      <MicroList micro={entry.micro} est={entry.est === true} />
      {note && <p className="note" role="status">{note}</p>}
      {picking && (
        <>
          <DayPicker source={{ kind: 'eaten', entry }} today={today} picked={picked} onPick={setPicked} single={move} label={`${move ? 'Move' : 'Copy'} to day`} />
          <button type="button" className="btn primary" disabled={!picked.length} onClick={go}>{goLabel(move ? 'Move' : 'Copy', picked)}</button>
        </>
      )}
      <div className="actions">
        {can && <button type="button" className="btn" aria-pressed={picking === 'copy'} onClick={() => toggle('copy')}>Copy to…</button>}
        {can && <button type="button" className="btn" aria-pressed={move} onClick={() => toggle('move')}>Move to…</button>}
        <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
        <ArmedButton className="btn danger" aria-label={`Delete ${entry.n}`} label="Delete" armedLabel="Tap again to delete" onConfirm={() => { useAppStore.getState().removeDietEntry(entry.id); }} />
        <button type="button" className="btn primary" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}
