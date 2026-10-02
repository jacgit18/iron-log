import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo, exerciseChoice } from '../../lib/data.js';
import { SECTIONS, blankItem } from '../../store/editorSlice.js';
import { DAYS } from '../../lib/logic.js';
import Sheet from '../Sheet.jsx';
import ExerciseField from '../ExerciseField.jsx';

function ItemFields({ it, k, type, cfg, onChange }) {
  const up = patch => onChange(k, patch);
  const legend = type === 'superset' ? (k ? 'B' : 'A') : type === 'either' ? (k ? 'Or' : 'Option 1') : 'Exercise';
  return (
    <fieldset className="edit-item">
      <legend>{legend}</legend>
      <ExerciseField cfg={cfg} id={`slot-ex-${k}`} name={it.nm} url={it.nu || ''} eq={it.ne || ''} stretch={!!it.ns} onName={nm => up({ nm })} onUrl={nu => up({ nu })} onEq={ne => up({ ne })} onStretch={ns => up({ ns })} />
      <div className="fields">
        <label className="field">Phase
          <select value={it.ph || ''} onChange={e => up({ ph: e.target.value || null })}>
            <option value="">None</option>
            {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
          </select>
        </label>
        <label className="field">Weight (lb)
          <input type="number" inputMode="decimal" step="any" min="0" value={it.w} placeholder="—" onChange={e => up({ w: e.target.value })} />
        </label>
        <label className="field">Sets × reps<input value={it.rx} placeholder="phase default" onChange={e => up({ rx: e.target.value })} /></label>
      </div>
      <label className="inline"><input type="checkbox" checked={!!it.bw} onChange={e => up({ bw: e.target.checked })} /> Bodyweight</label>
      <label className="field">Note<input value={it.note} placeholder="Form cue, setup" onChange={e => up({ note: e.target.value })} /></label>
    </fieldset>
  );
}

export default function SlotSheet({ idx, preset }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const edDay = useAppStore(s => s.edDay);
  const [d, setD] = useState(() => {
    const src = idx == null ? (preset === 'stretch' ? { id: null, sec: 'Stretches', tier: '', type: 'single', items: [{ ...blankItem(), ph: null, ns: true }], note: '' } : { id: null, sec: 'Regular', tier: 'Accessory', type: 'single', items: [blankItem()], note: '' }) : structuredClone(st.edProgram().days[edDay - 1].slots[idx]);
    // Weight stays a string while editing so "12." can be typed; saveSlot gets a number.
    return { ...src, type: src.type || 'single', day: edDay, idx, note: src.note || '', tier: src.tier || '', items: src.items.map(it => ({ ...blankItem(), ...it, nm: it.ex ? exInfo(cfg, it.ex).n : '', w: it.w ?? '', rx: it.rx || '', note: it.note || '' })) };
  });
  const [err, setErr] = useState('');

  const setType = type => setD(x => { const want = type === 'single' ? 1 : 2; const items = x.items.slice(0, want); while (items.length < want) items.push({ ...blankItem(), w: '' }); return { ...x, type, items }; });
  const setItem = (k, patch) => setD(x => ({ ...x, items: x.items.map((it, j) => (j === k ? { ...it, ...patch } : it)) }));
  const submit = e => {
    e.preventDefault();
    const clean = { ...d, note: d.note.trim(), items: d.items.map(it => ({ ...it, ...exerciseChoice(cfg, it.nm), w: it.w === '' || it.w == null ? null : Number(it.w), rx: it.rx.trim(), note: it.note.trim(), nu: (it.nu || '').trim(), ne: it.ne || '', ns: !!it.ns })) };
    const msg = st.saveSlot(clean);
    if (msg) setErr(msg);
  };

  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{d.idx == null ? 'Add exercise' : 'Edit exercise'} · {st.edName()}</h2>
      <div className="fields">
        <label className="field">Type
          <select value={d.type} onChange={e => setType(e.target.value)}>
            <option value="single">Single</option><option value="superset">Superset (A → B)</option><option value="either">Either / or</option>
          </select>
        </label>
        <label className="field">Section
          <select value={d.sec} onChange={e => setD(x => ({ ...x, sec: e.target.value }))}>
            {[...new Set([...SECTIONS, d.sec])].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="field">Tier
          <select value={d.tier} onChange={e => setD(x => ({ ...x, tier: e.target.value }))}>
            <option value="">None</option><option value="Primary">Primary</option><option value="Accessory">Accessory</option>
          </select>
        </label>
        <label className="field">Day
          <select value={d.day} onChange={e => setD(x => ({ ...x, day: Number(e.target.value) }))}>
            {DAYS.map(x => <option key={x} value={x}>Day {x}</option>)}
          </select>
        </label>
      </div>
      {d.items.map((it, k) => <ItemFields key={k} it={it} k={k} type={d.type} cfg={cfg} onChange={setItem} />)}
      <label className="field">Card note<input value={d.note} placeholder="e.g. Whichever is free" onChange={e => setD(x => ({ ...x, note: e.target.value }))} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
