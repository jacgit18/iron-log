import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useExIdsInUse } from '../../hooks/useExIdsInUse.js';
import { exInfo } from '../../lib/data.js';
import type { EquipmentId } from '../../types.ts';
import { exerciseOptions } from '../../lib/exerciseOptions.js';
import { cleanName, newExerciseError, startName, MAX_EXERCISE_NAME } from '../../lib/shareExercise.js';
import EquipmentField from '../EquipmentField.jsx';
import ItemPicker from '../ItemPicker.jsx';
import { catalogMeta } from '../ExerciseField.jsx';
import { pickerKey } from '../../lib/picker.js';
import { afterSheetClose } from '../../lib/backNav.js';
import { setRecipeStart } from '../../lib/shareTarget.js';
import { navigate } from '../useRoute.js';
import Sheet from '../Sheet.jsx';
import './ShareSheet.css';

const SHOWN = 12;
type Step = { k: 'pick' } | { k: 'create'; name: string; eq: EquipmentId | ''; err: string } | { k: 'exercise'; q: string; err?: string; ask?: { id: string; name: string } } | { k: 'recipe'; q: string; ask?: { id: string; name: string } } | { k: 'saved'; text: string };

// A link shared from another app (the manifest's share_target, brief share-target): save it as an exercise's video link or a recipe's.
export default function ShareSheet({ title, url }: { title: string; url: string }) {
  const cfg = useAppStore(s => s.cfg);
  const recipes = useAppStore(s => s.recipes);
  const inUse = useExIdsInUse(cfg);
  const [step, setStep] = useState<Step>({ k: 'pick' });
  const { closeModal } = useAppStore.getState();

  if (!url) {
    return (
      <Sheet>
        <h2 className="cond">Save this link</h2>
        <p className="note" role="alert">No web link found in what you shared.</p>
        <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Close</button></div>
      </Sheet>
    );
  }

  const saveExercise = (id: string, name: string) => { useAppStore.getState().applyExerciseUrl(id, url); setStep({ k: 'saved', text: `Saved as the video link for ${name}.` }); };
  const saveRecipe = (id: string, name: string) => {
    const r = useAppStore.getState().recipes.find(x => x.id === id); if (!r) return;
    const err = useAppStore.getState().saveRecipe({ ...r, url });
    setStep({ k: 'saved', text: err ?? `Saved as the video link for ${name}.` });
  };
  const newRecipe = () => {
    setRecipeStart({ title, url });
    afterSheetClose(window.history, window, () => { useAppStore.getState().setTab('daily'); navigate('daily/recipes/form', 'push'); }); // after the sheet's own Back step (lib/backNav.ts)
    closeModal();
  };
  const match = (name: string, q: string) => !q.trim() || pickerKey(name).includes(pickerKey(q));

  return (
    <Sheet>
      <h2 className="cond">Save this link</h2>
      <p className="sharelink">{title && <b>{title}<br /></b>}<span>{url}</span></p>
      {step.k === 'pick' && (
        <>
          <p className="note">Where should it go?</p>
          <div className="sharechoices">
            <button type="button" className="btn" onClick={() => setStep({ k: 'exercise', q: '' })}>Exercise</button>
            <button type="button" className="btn" onClick={() => setStep({ k: 'recipe', q: '' })}>Recipe</button>
          </div>
          <div className="actions"><button type="button" className="btn" onClick={closeModal}>Cancel</button></div>
        </>
      )}
      {step.k === 'exercise' && !step.ask && (
        <>
          <button type="button" className="btn" onClick={() => setStep({ k: 'create', name: startName(title), eq: '', err: '' })}>Create new exercise</button>
          <ItemPicker id="share-ex" label="Find an exercise" kind="exercise" value={step.q} mine={exerciseOptions(cfg, inUse)} catalogMeta={catalogMeta}
            placeholder="Type to search, or add a new one" createLabel={n => `Create “${n}” as a new exercise`}
            onText={q => setStep({ k: 'exercise', q })}
            onPick={c => {
              if (c.kind === 'create') { setStep({ k: 'create', name: startName(c.name), eq: '', err: '' }); return; }
              if (c.kind === 'catalog') {
                const st = useAppStore.getState(); const have = !!st.cfg.ex[c.item.id]; // already yours: same Replace check as any of your exercises
                if (!have) {
                  const err = st.addCatalogExercise(c.item);
                  if (err || !useAppStore.getState().cfg.ex[c.item.id]) { setStep({ k: 'exercise', q: step.q, err: err ?? 'Could not add it yet. Try again in a moment.' }); return; } // not added: data still loading
                }
              }
              const id = c.kind === 'catalog' ? c.item.id : c.id; const name = c.kind === 'catalog' ? c.item.name : exerciseOptions(cfg, inUse).find(x => x.id === id)?.name;
              if (!name) return;
              const had = exInfo(useAppStore.getState().cfg, id).url || '';
              if (had && had !== url) setStep({ k: 'exercise', q: step.q, ask: { id, name } }); else saveExercise(id, name);
            }} />
          {step.err && <p className="note err" role="alert">{step.err}</p>}
          <div className="actions"><button type="button" className="btn" onClick={() => setStep({ k: 'pick' })}>Back</button><button type="button" className="btn" onClick={closeModal}>Cancel</button></div>
        </>
      )}
      {step.k === 'create' && (
        <form noValidate onSubmit={(e: FormEvent) => {
          e.preventDefault();
          const err = newExerciseError(cfg, step.name, inUse); if (err) { setStep({ ...step, err }); return; }
          const name = cleanName(step.name); const st = useAppStore.getState();
          const id = st.createExercise({ nn: name, nu: url, ne: step.eq });
          if (!useAppStore.getState().cfg.ex[id]) { setStep({ ...step, err: 'Could not save yet. Try again in a moment.' }); return; } // data still loading
          setStep({ k: 'saved', text: `Saved as the video link for ${name}.` });
        }}>
          <label className="field">Exercise name
            <input value={step.name} maxLength={MAX_EXERCISE_NAME} autoFocus placeholder="e.g. Cable Lateral Raise" onChange={e => setStep({ ...step, name: e.target.value, err: '' })} />
          </label>
          <EquipmentField cfg={cfg} value={step.eq} onChange={eq => setStep({ ...step, eq })} />
          {step.err && <p className="note err" role="alert">{step.err}</p>}
          <div className="actions">
            <button type="button" className="btn" onClick={() => setStep({ k: 'exercise', q: '' })}>Back</button>
            <button type="submit" className="btn primary">Save exercise</button>
          </div>
        </form>
      )}
      {step.k === 'exercise' && step.ask && (
        <>
          <p className="note" role="alert">Replace the link on {step.ask.name}?</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setStep({ k: 'exercise', q: step.q })}>Keep the old link</button>
            <button type="button" className="btn primary" onClick={() => saveExercise(step.ask!.id, step.ask!.name)}>Replace</button>
          </div>
        </>
      )}
      {step.k === 'recipe' && step.ask && (
        <>
          <p className="note" role="alert">Replace the link on {step.ask.name}?</p>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setStep({ k: 'recipe', q: step.q })}>Keep the old link</button>
            <button type="button" className="btn primary" onClick={() => saveRecipe(step.ask!.id, step.ask!.name)}>Replace</button>
          </div>
        </>
      )}
      {step.k === 'recipe' && !step.ask && (
        <>
          <button type="button" className="btn" onClick={newRecipe}>New recipe with this link</button>
          <label className="field">Or add it to one of yours
            <input type="search" value={step.q} onChange={e => setStep({ k: 'recipe', q: e.target.value })} />
          </label>
          <ul className="sharelist">
            {recipes.filter(r => r.cat !== 'ready' && match(r.n, step.q)).slice(0, SHOWN).map(r => (
              <li key={r.id}><button type="button" className="btn ghost" onClick={() => (r.url && r.url !== url ? setStep({ k: 'recipe', q: step.q, ask: { id: r.id, name: r.n } }) : saveRecipe(r.id, r.n))}>{r.n}</button></li>
            ))}
          </ul>
          <div className="actions"><button type="button" className="btn" onClick={() => setStep({ k: 'pick' })}>Back</button><button type="button" className="btn" onClick={closeModal}>Cancel</button></div>
        </>
      )}
      {step.k === 'saved' && (
        <>
          <p className="note" role="status">{step.text}</p>
          <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Done</button></div>
        </>
      )}
    </Sheet>
  );
}
