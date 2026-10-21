import { useAppStore } from '../../store/useAppStore.js';
import Board from './Board.jsx';
import { lazyTab } from '../../lib/lazyTab.js';

// The stretch routine is a second screen of the Board tab; its code loads when it is first shown, not with the workout.
const Stretches = lazyTab(() => import('../stretches/Stretches.js'));

const MODES = [[1, 'Mode 1 · A only'], [2, 'Mode 2 · monthly'], [3, 'Mode 3 · 6 months']];

// The Board tab: the workout week, or the stretch routine for the same week. Stretches don't depend on the
// program or mode, so they look the same whichever is selected.
export default function BoardTab() {
  const view = useAppStore(s => s.boardView);
  const setBoardView = useAppStore(s => s.setBoardView);
  const mode = useAppStore(s => s.cfg.mode);
  const setMode = useAppStore(s => s.setMode);
  return (
    <>
      <div className="edtop boardtabtop">
        <div className="seg" role="group" aria-label="Board section">
          <button type="button" id="board-workout" className={view === 'workout' ? 'on' : ''} aria-pressed={view === 'workout'} onClick={() => setBoardView('workout')}>Workout</button>
          <button type="button" id="board-stretches" className={view === 'stretches' ? 'on' : ''} aria-pressed={view === 'stretches'} onClick={() => setBoardView('stretches')}>Stretches</button>
        </div>
        {view === 'workout' && (
          <label className="seg modesel" htmlFor="board-mode">
            <span className="sr">Mode</span>
            <select id="board-mode" aria-label="Program mode" value={mode} onChange={e => setMode(Number(e.target.value) as 1 | 2 | 3)}>
              {MODES.map(([m, t]) => <option key={m} value={m}>{t}</option>)}
            </select>
          </label>
        )}
      </div>
      {view === 'stretches' ? <Stretches /> : <Board />}
    </>
  );
}
