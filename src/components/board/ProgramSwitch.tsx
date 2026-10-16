import { useAppStore } from '../../store/useAppStore.js';
import { programFor, progName } from '../../lib/logic.js';
import type { ProgKey } from '../../types.ts';
import './ProgramSwitch.css';

// Mode 2 (monthly) alternates programs A and B by the month; this switch, in the header, flips the week on the Board to the other one.
// Whether the week follows the month or was switched is not drawn (it was a stray line beside the switch); a screen reader still hears it with the switch.
// It is only there where it does something: Mode 2, on the Board. The other modes have one program or follow the schedule, so nothing to switch.
export default function ProgramSwitch() {
  const cfg = useAppStore(s => s.cfg);
  const tab = useAppStore(s => s.tab);
  const weekStart = useAppStore(s => s.weekStart);
  const progKey = useAppStore(s => s.activeProgKey());
  if (cfg.mode !== 2 || tab !== 'board') return null;
  const auto = programFor(cfg, weekStart);
  const note = progKey === auto ? 'Set by month' : `Switched · month default is ${progName(cfg, auto)}`;
  return (
    <div className="progswitch">
      <div className="seg" role="group" aria-label="Program this week" aria-describedby="progswitch-note">
        {['A', 'B'].map(k => (
          <button type="button" key={k} className={k === progKey ? 'on' : ''} aria-pressed={k === progKey} onClick={() => useAppStore.getState().setWeekProg(k as ProgKey)}>{progName(cfg, k)}</button>
        ))}
      </div>
      <span className="sr" id="progswitch-note">{note}</span>
    </div>
  );
}
