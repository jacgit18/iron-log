import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import Board from './Board.jsx';
import { useBodyWeightDraft } from './BodyWeightRow.js';
import ModeSelect from './ModeSelect.js';
import { useWide } from './useWide.js';
import { ymd } from '../../shared/dates.js';
import { lazyTab } from '../../lib/lazyTab.js';
import { boardFix, boardView } from '../../lib/route.js';
import { navigate, useRoutePath } from '../useRoute.js';

// The stretch routine is a second screen of the Board tab; its code loads when it is first shown, not with the workout.
const Stretches = lazyTab(() => import('../stretches/Stretches.js'));

// The Board tab: the workout week, or the stretch routine for the same week. Stretches don't depend on the
// program or mode, so they look the same whichever is selected.
export default function BoardTab() {
  const saved = useAppStore(s => s.boardView);
  const path = useRoutePath();
  const view = boardView(path) ?? saved; // the address wins when it names a section (#/board/stretches); plain #/board shows the remembered one
  const setBoardView = useAppStore(s => s.setBoardView);
  const weekStart = useAppStore(s => s.weekStart);
  // The address follows the section shown so it can be copied or reloaded; an address that names one is remembered as the chosen section.
  useEffect(() => { const fix = boardFix(path, view); if (fix) navigate(fix, 'replace'); else if (view !== saved) setBoardView(view); }, [path, view, saved, setBoardView]);
  const pick = (v: string) => { setBoardView(v); navigate(`board/${v}`, 'replace'); };
  const wide = useWide();
  const bodyWeight = useBodyWeightDraft(ymd(weekStart)); // one form state for the row, whichever side of 700px draws it
  return (
    <>
      <div className="edtop boardtabtop">
        <div className="seg" role="group" aria-label="Board section">
          <button type="button" id="board-workout" className={view === 'workout' ? 'on' : ''} aria-pressed={view === 'workout'} onClick={() => pick('workout')}>Workout</button>
          <button type="button" id="board-stretches" className={view === 'stretches' ? 'on' : ''} aria-pressed={view === 'stretches'} onClick={() => pick('stretches')}>Stretches</button>
        </div>
        {/* A phone keeps the mode menu here; a wide screen draws it, with the body weight, inside the Board's week card (Board.tsx). */}
        {view === 'workout' && !wide && <ModeSelect />}
      </div>
      {view === 'stretches' ? <Stretches /> : <Board bodyWeight={bodyWeight} />}
    </>
  );
}
