import type { ProgKey } from '../../types.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { progName } from '../../lib/logic.js';
import { slotsFor } from '../../lib/data.js';
import { daysChoices, parseStart, START_VALUES, suggestName } from '../../lib/programStart.js';
import { starterById } from '../../lib/starterPrograms.js';
import Sheet from '../Sheet.jsx';
import './NewProgramSheet.css';

// Step 1 picks where the program starts and names it; step 2 (it is already in the library) offers to put it on the Board.
export default function NewProgramSheet() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const [start, setStart] = useState(START_VALUES[0]!);
  const [days, setDays] = useState<number | null>(null);
  const [typed, setTyped] = useState<string | null>(null); // null: the name is still the suggestion
  const [err, setErr] = useState('');
  const [made, setMade] = useState<{ id: string; name: string } | null>(null);
  const choices = daysChoices(start); const nDays = days != null && choices.includes(days) ? days : (choices[0] ?? 0);
  const name = typed ?? suggestName(start, nDays, k => progName(cfg, k));
  const close = () => { st.closeModal(); window.scrollTo({ top: 0 }); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const what = parseStart(start);
    if (!what) return;
    if (!name.trim()) { setErr('Give the program a name.'); return; }
    const fail = what.kind === 'starter' ? st.createStarterProgram(what.id, nDays, name) : st.createProgram(name, what.kind === 'copy' ? what.key : 'empty', true) ? null : 'Wait a moment and try again.';
    if (fail) { setErr(fail); return; }
    setErr(''); setMade({ id: useAppStore.getState().edProg!.slice(2), name: name.trim() });
  };
  if (made) {
    // Closing the sheet takes back the history entry it added (lib/backNav.ts), and that Back restores the address the editor follows (#/program/a).
    // Loading first would be undone by it, so the load waits for that Back to land.
    const load = (k: ProgKey) => {
      const done = () => { st.loadVersion(made.id, k); st.setEdDay(1); };
      const entryToLeave = (history.state as { nav?: { modal?: boolean } } | null)?.nav?.modal === true;
      close();
      if (entryToLeave) window.addEventListener('popstate', done, { once: true }); else done();
    };
    return (
      <Sheet>
        <h2 className="cond">{made.name} is ready</h2>
        <p className="note">It is in your program library. Put it on your Board now?</p>
        <div className="npnext">
          {(['A', 'B'] as const).map(k => (
            <button key={k} type="button" className="btn" onClick={() => load(k)}>
              Load into {progName(cfg, k)}
              <span className="note">{slotsFor(programs[k]).length === 0 || st.isOriginal(programs[k], k) ? `${progName(cfg, k)} has no changes of yours, so nothing needs saving.` : `What ${progName(cfg, k)} has now is saved to your library first, so nothing is lost.`}</span>
            </button>
          ))}
          <button type="button" className="btn" onClick={close}>
            Not yet
            <span className="note">Keep it in the library and open it in the editor.</span>
          </button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">Create a program</h2>
      <fieldset className="npstart">
        <legend>Start from</legend>
        {START_VALUES.map(v => {
          const s = parseStart(v)!;
          const [title, note] = s.kind === 'starter' ? [starterById(s.id)!.name, starterById(s.id)!.blurb]
            : s.kind === 'copy' ? [`A copy of ${progName(cfg, s.key)}`, 'The same days and exercises, as your own copy.']
              : ['A blank program', 'Seven empty days to fill in.'];
          return (
            <label key={v} className="npopt">
              <input type="radio" name="np-start" value={v} checked={start === v} onChange={() => { setStart(v); setErr(''); }} />
              <span><b>{title}</b><span className="note">{note}</span></span>
            </label>
          );
        })}
      </fieldset>
      {choices.length > 1 && (
        <label className="field">Days a week
          <select value={nDays} onChange={e => setDays(Number(e.target.value))}>
            {[...choices].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n} days a week</option>)}
          </select>
        </label>
      )}
      <label className="field">Name<input maxLength={60} value={name} required aria-invalid={!!err} aria-describedby={err ? 'np-err' : undefined} onChange={e => setTyped(e.target.value)} /></label>
      {err && <p className="note err" role="alert" id="np-err">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Create</button>
      </div>
    </Sheet>
  );
}
