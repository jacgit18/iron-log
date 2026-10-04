import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { TIERS } from '../../lib/stretches.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

// Add or edit a stretch in the library: name, video link, note, the group it sits in, and when it shows on the board.
export function StretchSheet({ id }) {
  const s = useAppStore.getState();
  const items = useAppStore(x => x.stretches);
  const cur = id ? items.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', url: cur ? cur.url || '' : '', note: cur ? cur.note || '' : '', group: cur ? cur.group : 'Standing', tier: cur ? cur.tier : 'primary' }));
  const [err, setErr] = useState('');
  const up = patch => setD(x => ({ ...x, ...patch }));
  const groups = [...new Set(items.map(i => i.group))];
  return (
    <Sheet>
      <h2 className="cond">{cur ? 'Edit stretch' : 'New stretch'}</h2>
      <form id="stretch-form" noValidate onSubmit={e => { e.preventDefault(); const m = s.saveStretch(d); if (m) setErr(m); }}>
        <label className="field">Name<input id="stretch-name" maxLength={80} value={d.n} placeholder="e.g. 90/90 Hip Switch" onChange={e => up({ n: e.target.value })} /></label>
        <label className="field">Video link (optional)<input type="url" value={d.url} placeholder="https://" onChange={e => up({ url: e.target.value })} /></label>
        <label className="field">Group
          <input list="stretch-groups" maxLength={40} value={d.group} onChange={e => up({ group: e.target.value })} />
          <datalist id="stretch-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </label>
        <label className="field">On the board
          <select value={d.tier} onChange={e => up({ tier: e.target.value })}>{TIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="field">Note (optional)<input maxLength={200} value={d.note} placeholder="e.g. Be on the side of your face" onChange={e => up({ note: e.target.value })} /></label>
        {err && <p className="note err" role="alert">{err}</p>}
      </form>
      <div className="actions">
        {cur && <ArmedButton className="btn danger" label="Delete" armedLabel="Tap again to delete" onConfirm={() => s.deleteStretch(cur.id)} />}
        <button type="button" className="btn" onClick={s.closeModal}>Cancel</button>
        <button type="submit" form="stretch-form" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}

// Add or edit a stretch on the Experiment list.
export function StretchExpSheet({ id }) {
  const s = useAppStore.getState();
  const cur = id ? s.stretchExps.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', url: cur ? cur.url || '' : '', note: cur ? cur.note || '' : '' }));
  const [err, setErr] = useState('');
  const up = patch => setD(x => ({ ...x, ...patch }));
  return (
    <Sheet>
      <h2 className="cond">{cur ? 'Edit experiment' : 'Add a stretch to try'}</h2>
      <form id="sexp-form" noValidate onSubmit={e => { e.preventDefault(); const m = s.saveStretchExp(d); if (m) setErr(m); }}>
        <label className="field">Name<input id="sexp-name" maxLength={80} value={d.n} placeholder="e.g. Cossack Squat" onChange={e => up({ n: e.target.value })} /></label>
        <label className="field">Video link (optional)<input type="url" value={d.url} placeholder="https://" onChange={e => up({ url: e.target.value })} /></label>
        <label className="field">Note (optional)<input maxLength={200} value={d.note} placeholder="e.g. Saw it on YouTube" onChange={e => up({ note: e.target.value })} /></label>
        {err && <p className="note err" role="alert">{err}</p>}
      </form>
      <div className="actions">
        <button type="button" className="btn" onClick={s.closeModal}>Cancel</button>
        <button type="submit" form="sexp-form" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
