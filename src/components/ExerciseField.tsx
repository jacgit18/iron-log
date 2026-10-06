import { useEffect, useRef } from 'react';
import type { Cfg, EquipmentKey } from '../types.ts';
import { allExIds, exInfo, findExId, EQUIPMENT, EQ_KEYS } from '../lib/data.js';

// Type an exercise: suggestions come from the catalog (built-in and your own); a name that isn't there yet
// is added to your catalog when the sheet is saved.
type Props = { cfg: Cfg; id: string; name: string; url?: string; eq?: string; onName: (v: string) => void; onUrl?: (v: string) => void; onEq?: (v: string) => void };
export default function ExerciseField({ cfg, id, name, url, eq = '', onName, onUrl, onEq }: Props) {
  const names = [...new Set(allExIds(cfg).map(x => exInfo(cfg, x).n))].sort((a, b) => a.localeCompare(b));
  const known = name.trim() !== '' ? findExId(cfg, name) : null;
  const isNew = name.trim() !== '' && !known;
  // Picking an existing exercise shows its saved video link, so what you save is that exercise's link (edited or not).
  // A link shown that way is cleared when the name stops matching; one typed for a new exercise is kept.
  const filled = useRef<string | null>(null);
  useEffect(() => {
    if (!onUrl) return;
    if (known) { const u = exInfo(cfg, known).url || ''; filled.current = u; onUrl(u); }
    else if (filled.current != null && url === filled.current) { filled.current = null; onUrl(''); }
  }, [known]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <label className="field">Exercise
        <input id={id} list={`${id}-list`} value={name} autoComplete="off" placeholder="Type to search or add, e.g. Cable Lateral Raise" onChange={e => onName(e.target.value)} />
      </label>
      <datalist id={`${id}-list`}>{names.map(n => <option key={n} value={n} />)}</datalist>
      {onUrl && name.trim() !== '' && <label className="field">Video link (optional)<input type="url" value={url ?? ''} placeholder="https://" onChange={e => onUrl(e.target.value)} /></label>}
      {isNew && (
        <>
          <p className="note">New exercise. It will be added to your exercise list.</p>
          {onEq && (
            <label className="field">Equipment
              <select value={eq} onChange={e => onEq(e.target.value)}>
                <option value="">Not set</option>
                {(EQ_KEYS as EquipmentKey[]).map(k => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}
              </select>
            </label>
          )}
        </>
      )}
    </>
  );
}
