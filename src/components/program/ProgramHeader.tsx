import type { Program } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { progName } from '../../lib/logic.js';
import { programHeadline } from '../../lib/programRowFacts.js';
import './ProgramHeader.css';

// The top of the Programs view: which program you are editing (and that it is on your Board), the A | B switch, and Create a program.
// It replaces the A | B row, the Create button row and the strip of cards. Create sits here from 700px; a phone gets the floating pill instead (ProgramFab).
export default function ProgramHeader({ k, name, prog, lib }: { k: string; name: string; prog: Pick<Program, 'days'>; lib: boolean }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  return (
    <section className="panel proghead" aria-label="Program you are editing">
      <div className="ph-main">
        <span className="ph-eyebrow">You are editing</span>
        <span className="ph-name cond" role="heading" aria-level={2}>{name}</span>
        <span className="ph-sub">
          <span className={`pill ph-pill${lib ? '' : ' onboard'}`}>{lib ? 'Saved program' : 'On your Board'}</span>
          <span className="note">{lib ? 'Not on your Board until you put it there' : programHeadline(prog.days)}</span>
        </span>
      </div>
      <div className="seg" role="group" aria-label="Program to edit">
        {['A', 'B'].map(p => <button type="button" key={p} className={p === k ? 'on' : ''} aria-pressed={p === k} onClick={() => st.setEdProg(p)}>{progName(cfg, p)}</button>)}
      </div>
      <button type="button" className="btn createprog" onClick={() => { if (!st.blocked()) st.openModal({ type: 'newprog' }); }}>Create a program</button>
    </section>
  );
}
