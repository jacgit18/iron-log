import type { LibraryItem, Program } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { exerciseCount } from '../../lib/exerciseCount.js';
import { boardNote, onBoardKeys } from '../../lib/programDay.js';
import { progName } from '../../lib/logic.js';
import { splitLibrary } from '../../lib/programArchive.js';
import { DEFAULT_PROGRAM_SORT, PROGRAM_SORTS } from '../../lib/programSort.js';
import { useSortChoice } from '../useSortChoice.js';
import './ProgramStrip.css';

const SHOWN = 2; // saved programs on the strip; the rest are in the Program library panel below
const count = (p: Program) => p.days.reduce((n, d) => n + exerciseCount(d.slots), 0);

// Wide desktop only (the stylesheet hides it below 1280px): the programs as cards across the top, and where Create a program lives there. Everything a card does also
// exists in the editor's switch and the Program library panel, which stay; the buttons here have their own accessible names so they never repeat those.
export default function ProgramStrip() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs); const library = useAppStore(s => s.library);
  const edProg = useAppStore(s => s.edProg);
  const st = useAppStore.getState();
  const [sort] = useSortChoice('programs', PROGRAM_SORTS, DEFAULT_PROGRAM_SORT);
  const saved = splitLibrary(library, sort).active.slice(0, SHOWN);
  const open = (it: LibraryItem) => { st.setEdProg('L:' + it.id); st.setEdDay(1); };
  return (
    <div className="progstrip" role="group" aria-label="Programs">
      {(['A', 'B'] as const).map(p => (
        <div key={p} className={`pc${edProg === p ? ' cur' : ''}`}>
          <b>{progName(cfg, p)}</b>
          <small>On your Board · {count(programs[p])} exercises</small>
          <button type="button" className="btn sm" aria-label={`Open ${p} in the editor`} aria-pressed={edProg === p} onClick={() => st.setEdProg(p)}>Open</button>
        </div>
      ))}
      {saved.map(it => (
        <div key={it.id} className={`pc${edProg === 'L:' + it.id ? ' cur' : ''}`}>
          <b>{it.name}</b>
          <small>{boardNote(onBoardKeys(it.prog, programs as Record<'A' | 'B', Program>).map(b => progName(cfg, b)))} · {count(it.prog)} exercises</small>
          <button type="button" className="btn sm" aria-label={`Open ${it.name} in the editor`} onClick={() => open(it)}>Open</button>
        </div>
      ))}
      <div className="pc new">
        <b>Create a program</b>
        <small>Start from scratch or a starter program</small>
        <button type="button" className="btn sm primary" aria-label="Create a program" onClick={() => { if (!st.blocked()) st.openModal({ type: 'newprog' }); }}>Create</button>
      </div>
    </div>
  );
}
