import { useEffect } from 'react';
import { useTimerStore, mmss } from '../store/useTimerStore.js';
import { useAppStore } from '../store/useAppStore.js';

export default function TimerBar() {
  const t = useTimerStore();
  const tab = useAppStore(s => s.tab);
  useEffect(() => { document.body.classList.toggle('timing', !!t.mode); }, [t.mode]);

  if (!t.mode) {
    if (tab !== 'board') return null;
    return <button type="button" className="fab" onClick={t.startRest}>Rest timer</button>;
  }
  const r = t.remaining();
  const label = t.mode === 'hold' && t.sets ? `Hold ${t.set}/${t.sets} · ${t.exName}` : t.label;
  return (
    <div className="timerbar" role="timer" aria-live="off" data-mode={t.mode === 'hold' ? 'hold' : 'rest'}>
      <div className="tb-bar"><i style={{ width: `${Math.max(0, Math.min(100, (1 - r / t.dur) * 100))}%` }} /></div>
      <div className="tb-row">
        <div className="tb-main"><span className="tb-label">{label}</span><span className="tb-time">{mmss(r)}</span></div>
        <div className="tb-btns">
          <button type="button" className="btn sm" aria-label="15 seconds less" onClick={() => t.nudge(-15)}>−15</button>
          <button type="button" className="btn sm" aria-label="15 seconds more" onClick={() => t.nudge(15)}>+15</button>
          <button type="button" className="btn sm" onClick={t.togglePause}>{t.paused != null ? 'Resume' : 'Pause'}</button>
          <button type="button" className="btn sm" onClick={t.stop}>Stop</button>
        </div>
      </div>
    </div>
  );
}
