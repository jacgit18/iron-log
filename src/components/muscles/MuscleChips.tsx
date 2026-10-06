import { MUSCLES, M_KEYS } from '../../lib/muscles.js';
import type { MuscleKey } from '../../types.ts';

/** A muscle-tag edit in progress: each muscle is primary ('p'), secondary ('s') or unused. */
export type MuscleDraft = { mob: boolean; st: Partial<Record<MuscleKey, 'p' | 's'>> };

// Each muscle cycles: not used → secondary → primary.
const NEXT: Record<string, 'p' | 's' | undefined> = { undefined: 's', s: 'p', p: undefined };

export default function MuscleChips({ draft, setDraft, mobId }: { draft: MuscleDraft; setDraft: (f: (d: MuscleDraft) => MuscleDraft) => void; mobId: string }) {
  const cycle = (m: MuscleKey) => setDraft(d => { const st = { ...d.st }; const n = NEXT[String(st[m])]; if (n) st[m] = n; else delete st[m]; return { ...d, st }; });
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
