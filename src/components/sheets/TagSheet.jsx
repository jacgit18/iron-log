import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { exInfo } from '../../lib/data.js';
import { MUSCLES, M_KEYS, MUSCLE_MAP, tagsOf } from '../../lib/muscles.js';
import Sheet from '../Sheet.jsx';

// Each muscle cycles: not used → secondary → primary.
const NEXT = { undefined: 's', s: 'p', p: undefined };

export default function TagSheet({ exId }) {
  const cfg = useAppStore(s => s.cfg);
  const { saveTags, resetTags, closeModal } = useAppStore.getState();
  const [draft, setDraft] = useState(() => {
    const tg = tagsOf(cfg, exId) || {}; const st = {};
    (tg.p || []).forEach(m => { st[m] = 'p'; }); (tg.s || []).forEach(m => { st[m] = 's'; });
    return { mob: !!tg.mob, st };
  });
  const custom = !!(cfg.muscleMap && cfg.muscleMap[exId]);
  const cycle = m => setDraft(d => { const st = { ...d.st }; const n = NEXT[st[m]]; if (n) st[m] = n; else delete st[m]; return { ...d, st }; });
  const save = () => {
    const o = { p: M_KEYS.filter(m => draft.st[m] === 'p'), s: M_KEYS.filter(m => draft.st[m] === 's') };
    if (draft.mob) o.mob = true;
    saveTags(exId, o);
  };

  return (
    <Sheet>
      <h2 className="cond">{exInfo(cfg, exId).n}</h2>
      <p className="note">Tap a muscle to cycle: not used → secondary → primary.</p>
      <div className="chips">
        {M_KEYS.map(m => {
          const v = draft.st[m];
          return (
            <button type="button" key={m} className={`chip ${v || ''}`} aria-pressed={!!v} onClick={() => cycle(m)}>
              {MUSCLES[m].n}{v === 'p' ? ' · primary' : v === 's' ? ' · secondary' : ''}
            </button>
          );
        })}
      </div>
      <label className="inline">
        <input type="checkbox" id="tag-mob" checked={draft.mob} onChange={e => setDraft(d => ({ ...d, mob: e.target.checked }))} /> Mobility or stretch (don't count toward muscles)
      </label>
      <div className="actions">
        {custom && MUSCLE_MAP[exId] && <button type="button" className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => resetTags(exId)}>Use default</button>}
        <button type="button" className="btn" onClick={closeModal}>Cancel</button>
        <button type="button" className="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}
