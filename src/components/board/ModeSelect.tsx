import { useAppStore } from '../../store/useAppStore.js';

const MODES = [[1, 'Mode 1 · A only'], [2, 'Mode 2 · monthly'], [3, 'Mode 3 · 6 months']];

// The Program mode menu. A phone draws it in the Workout / Stretches row (BoardTab.tsx); a wide screen draws it inside the week card (Board.tsx, WeekSection.css).
export default function ModeSelect() {
  const mode = useAppStore(s => s.cfg.mode);
  const setMode = useAppStore(s => s.setMode);
  return (
    <label className="seg modesel" htmlFor="board-mode">
      <span className="sr">Mode</span>
      <select id="board-mode" aria-label="Program mode" value={mode} onChange={e => setMode(Number(e.target.value) as 1 | 2 | 3)}>
        {MODES.map(([m, t]) => <option key={m} value={m}>{t}</option>)}
      </select>
    </label>
  );
}
