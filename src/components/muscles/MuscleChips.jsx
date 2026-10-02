import { MUSCLES, M_KEYS } from '../../lib/muscles.js';

// Each muscle cycles: not used → secondary → primary.
const NEXT = { undefined: 's', s: 'p', p: undefined };

export default function MuscleChips({ draft, setDraft, mobId }) {
  const cycle = m => setDraft(d => { const st = { ...d.st }; const n = NEXT[st[m]]; if (n) st[m] = n; else delete st[m]; return { ...d, st }; });
  return (
    <>
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
        <input type="checkbox" id={mobId} checked={draft.mob} onChange={e => setDraft(d => ({ ...d, mob: e.target.checked }))} /> Mobility or stretch (don't count toward muscles)
      </label>
    </>
  );
}
