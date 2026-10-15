import type { CatalogItem, Stretch, StretchTier } from '../../types.ts';
import { useState } from 'react';
import { catalogStretchGroup } from '../../lib/stretches.js';
import { pickerKey, type MineOption } from '../../lib/picker.js';
import ItemPicker from '../ItemPicker.jsx';
import { useAppStore } from '../../store/useAppStore.js';
import { TIERS } from '../../lib/stretches.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

// Your stretches as the picker lists them; badged Library or Custom only when syncing, as the library is (ADR 027).
const mineOf = (items: Stretch[], syncing: boolean): MineOption[] =>
  items.map(i => ({ id: i.id, name: i.n, meta: i.group, ...(i.catalogId ? { catalogId: i.catalogId } : {}), ...(syncing ? { badge: i.catalogId ? 'Library' : 'Custom' } : {}) }));

// Add or edit a stretch in the library: name, video link, note, the group it sits in, and when it shows on the board.
// Adding, the name is the item picker (ADR 036): picking one of yours opens it, picking a catalog stretch is saved with its catalog id.
export function StretchSheet({ id }: { id?: string | null }) {
  const s = useAppStore.getState();
  const items = useAppStore(x => x.stretches);
  const syncing = useAppStore(x => x.sync !== null);
  const cur = id ? items.find(x => x.id === id) : null;
  const [d, setD] = useState<{ id?: string; n: string; url: string; note: string; group: string; tier: StretchTier; cat?: CatalogItem | null }>(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', url: cur ? cur.url || '' : '', note: cur ? cur.note || '' : '', group: cur ? cur.group : 'Standing', tier: cur ? cur.tier : 'primary' }));
  const held = d.cat && pickerKey(d.cat.name) === pickerKey(d.n) ? d.cat : null;
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const groups = [...new Set(items.map(i => i.group))];
  return (
    <Sheet>
      <h2 className="cond">{cur ? (cur.catalogId ? cur.n : 'Edit stretch') : 'New stretch'}</h2>
      <form id="stretch-form" noValidate onSubmit={e => { e.preventDefault(); const m = s.saveStretch({ ...d, cat: held }); if (m) setErr(m); }}>
        {cur?.catalogId
          ? <p className="note">From the catalog: its name stays; everything else here is yours.</p>
          : cur
            ? <label className="field">Name<input id="stretch-name" maxLength={80} value={d.n} placeholder="e.g. 90/90 Hip Switch" onChange={e => up({ n: e.target.value })} /></label>
            : <ItemPicker id="stretch-name" label="Name" kind="stretch" value={d.n} maxLength={80} placeholder="Type to search or add, e.g. 90/90 Hip Switch"
                mine={mineOf(items, syncing)} catalogMeta={c => catalogStretchGroup(c)} createLabel={n => `Create “${n}” as a new stretch`}
                onText={n => up({ n })}
                onPick={c => {
                  if (c.kind === 'mine') s.openModal({ type: 'stretch', id: c.id }); // already yours: open it instead of making a second
                  else if (c.kind === 'catalog') up({ cat: c.item, n: c.item.name, group: catalogStretchGroup(c.item) });
                  else up({ cat: null });
                }} />}
        {held && <p className="note">From the catalog. It will be added to your stretches when you save.</p>}
        <label className="field">Video link (optional)<input type="url" value={d.url} placeholder="https://" onChange={e => up({ url: e.target.value })} /></label>
        <label className="field">Group
          <input list="stretch-groups" maxLength={40} value={d.group} onChange={e => up({ group: e.target.value })} />
          <datalist id="stretch-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </label>
        <label className="field">On the board
          <select value={d.tier} onChange={e => up({ tier: e.target.value as StretchTier })}>{TIERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
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

// Add or edit a stretch on the Experiment list. Adding, the name is the item picker (ADR 036): one already on the list opens it, and a
// catalog stretch gives its name (an experiment is a name to try, so nothing joins your library).
export function StretchExpSheet({ id }: { id?: string | null }) {
  const s = useAppStore.getState();
  const exps = useAppStore(x => x.stretchExps);
  const items = useAppStore(x => x.stretches);
  const cur = id ? exps.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', url: cur ? cur.url || '' : '', note: cur ? cur.note || '' : '', group: cur ? cur.group || '' : '' }));
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  return (
    <Sheet>
      <h2 className="cond">{cur ? 'Edit experiment' : 'Add a stretch to try'}</h2>
      <form id="sexp-form" noValidate onSubmit={e => { e.preventDefault(); const m = s.saveStretchExp(d); if (m) setErr(m); }}>
        {cur
          ? <label className="field">Name<input id="sexp-name" maxLength={80} value={d.n} placeholder="e.g. Cossack Squat" onChange={e => up({ n: e.target.value })} /></label>
          : <ItemPicker id="sexp-name" label="Name" kind="stretch" value={d.n} maxLength={80} placeholder="Type to search or add, e.g. Cossack Squat"
              mine={exps.map(x => ({ id: x.id, name: x.n, ...(x.note ? { meta: x.note } : {}) }))} also={items.map(i => ({ id: i.id, name: i.n }))} catalogMeta={c => catalogStretchGroup(c)}
              createLabel={n => `Try “${n}”`} onText={n => up({ n, group: '' })}
              onPick={c => {
                if (c.kind === 'mine') s.openModal({ type: 'stretchexp', id: c.id });
                else up({ group: c.kind === 'catalog' ? catalogStretchGroup(c.item) : '' }); // a catalog stretch brings its group; a typed name has none
              }} />}
        {d.group && <p className="note">Group: {d.group}</p>}
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
