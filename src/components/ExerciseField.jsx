import { allExIds, exInfo, findExId, EQUIPMENT, EQ_KEYS } from '../lib/data.js';

// Type an exercise: suggestions come from the catalog (built-in and your own); a name that isn't there yet
// is added to your catalog when the sheet is saved.
export default function ExerciseField({ cfg, id, name, url, eq = '', stretch = false, onName, onUrl, onEq, onStretch }) {
  const names = [...new Set(allExIds(cfg).map(x => exInfo(cfg, x).n))].sort((a, b) => a.localeCompare(b));
  const isNew = name.trim() !== '' && !findExId(cfg, name);
  return (
    <>
      <label className="field">Exercise
        <input id={id} list={`${id}-list`} value={name} autoComplete="off" placeholder="Type to search or add, e.g. Cable Lateral Raise" onChange={e => onName(e.target.value)} />
      </label>
      <datalist id={`${id}-list`}>{names.map(n => <option key={n} value={n} />)}</datalist>
      {isNew && (
        <>
          <p className="note">New exercise. It will be added to your exercise list.</p>
          <label className="field">Video link (optional)<input type="url" value={url} placeholder="https://" onChange={e => onUrl(e.target.value)} /></label>
          {onEq && (
            <label className="field">Equipment
              <select value={eq} onChange={e => onEq(e.target.value)}>
                <option value="">Not set</option>
                {EQ_KEYS.map(k => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}
              </select>
            </label>
          )}
          {onStretch && <label className="inline"><input type="checkbox" checked={stretch} onChange={e => onStretch(e.target.checked)} /> Stretch or mobility (no weight or reps)</label>}
        </>
      )}
    </>
  );
}
