import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useExIdsInUse } from '../../hooks/useExIdsInUse.js';
import { exInfo } from '../../lib/data.js';
import { exerciseOptions } from '../../lib/exerciseOptions.js';
import { pickerKey } from '../../lib/picker.js';
import { setRecipeStart } from '../../lib/shareTarget.js';
import { navigate } from '../useRoute.js';
import Sheet from '../Sheet.jsx';
import './ShareSheet.css';

const SHOWN = 12;
type Step = { k: 'pick' } | { k: 'exercise'; q: string; ask?: { id: string; name: string } } | { k: 'recipe'; q: string } | { k: 'saved'; text: string };

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
  // Closing a sheet steps the history back one entry (lib/backNav.ts), so the page is opened once that has happened, or after a short wait when nothing went back.
  const newRecipe = () => {
    setRecipeStart({ title, url });
    let went = false;
    const go = () => { if (went) return; went = true; window.removeEventListener('popstate', go); useAppStore.getState().setTab('daily'); navigate('daily/recipes/form', 'push'); };
    window.addEventListener('popstate', go); setTimeout(go, 300);
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
          <label className="field">Find an exercise
            <input type="search" value={step.q} autoFocus onChange={e => setStep({ k: 'exercise', q: e.target.value })} />
          </label>
          <ul className="sharelist">
            {exerciseOptions(cfg, inUse).filter(o => match(o.name, step.q)).slice(0, SHOWN).map(o => (
              <li key={o.id}>
                <button type="button" className="btn ghost" onClick={() => {
                  const had = exInfo(cfg, o.id).url || '';
                  if (had && had !== url) setStep({ k: 'exercise', q: step.q, ask: { id: o.id, name: o.name } }); else saveExercise(o.id, o.name);
                }}>{o.name}</button>
              </li>
            ))}
          </ul>
          <div className="actions"><button type="button" className="btn" onClick={() => setStep({ k: 'pick' })}>Back</button><button type="button" className="btn" onClick={closeModal}>Cancel</button></div>
        </>
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
      {step.k === 'recipe' && (
        <>
          <button type="button" className="btn" onClick={newRecipe}>New recipe with this link</button>
          <label className="field">Or add it to one of yours
            <input type="search" value={step.q} onChange={e => setStep({ k: 'recipe', q: e.target.value })} />
          </label>
          <ul className="sharelist">
            {recipes.filter(r => r.cat !== 'ready' && match(r.n, step.q)).slice(0, SHOWN).map(r => (
              <li key={r.id}><button type="button" className="btn ghost" onClick={() => saveRecipe(r.id, r.n)}>{r.n}</button></li>
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
