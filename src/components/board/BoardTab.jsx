import { useAppStore } from '../../store/useAppStore.js';
import Board from './Board.jsx';
import Stretches from '../stretches/Stretches.jsx';

// The Board tab: the workout week, or the stretch routine for the same week. Stretches don't depend on the
// program or mode, so they look the same whichever is selected.
export default function BoardTab() {
  const view = useAppStore(s => s.boardView);
  const setBoardView = useAppStore(s => s.setBoardView);
  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Board section">
          <button type="button" id="board-workout" className={view === 'workout' ? 'on' : ''} aria-pressed={view === 'workout'} onClick={() => setBoardView('workout')}>Workout</button>
          <button type="button" id="board-stretches" className={view === 'stretches' ? 'on' : ''} aria-pressed={view === 'stretches'} onClick={() => setBoardView('stretches')}>Stretches</button>
        </div>
      </div>
      {view === 'stretches' ? <Stretches /> : <Board />}
    </>
  );
}
