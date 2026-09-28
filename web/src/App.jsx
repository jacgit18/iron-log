import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore.js';
import { progName } from './lib/logic.js';
import useTooltips from './hooks/useTooltips.js';
import Board from './components/board/Board.jsx';
import LogSheet from './components/sheets/LogSheet.jsx';
import DetailSheet from './components/sheets/DetailSheet.jsx';
import TimerBar from './components/TimerBar.jsx';

const TABS = [['board', 'Board'], ['progress', 'Progress'], ['body', 'Muscles'], ['program', 'Program'], ['settings', 'Settings']];

function NotPortedYet({ name }) {
  return <div className="empty">The {name} tab hasn't been moved to React yet. It's next on the list.</div>;
}

function Modal() {
  const modal = useAppStore(s => s.modal);
  const slotExists = useAppStore(s => (s.modal && s.modal.type === 'log' ? !!s.slotById(s.modal.slotId) : true));
  if (!modal || !slotExists) return null;
  if (modal.type === 'log') return <LogSheet key={`${modal.slotId}:${modal.idx}`} slotId={modal.slotId} idx={modal.idx} />;
  if (modal.type === 'detail') return <DetailSheet exId={modal.exId} />;
  return null;
}

export default function App() {
  const tab = useAppStore(s => s.tab);
  const cfg = useAppStore(s => s.cfg);
  const saveFlag = useAppStore(s => s.saveFlag);
  const ready = useAppStore(s => s.isReady());
  const progKey = useAppStore(s => s.activeProgKey());
  const { init, setTab, closeModal } = useAppStore.getState();
  useTooltips();

  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeModal]);

  return (
    <>
      <div className="wrap">
        <header className="top">
          <h1>Iron Log</h1>
          <div className="meta">
            <span className="pill prog">{progName(cfg, progKey)}</span>
            <span className="pill">Mode {cfg.mode}</span>
            <span className="saveflag">{!ready && !saveFlag ? 'Loading…' : saveFlag}</span>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button type="button" role="tab" key={k} id={`tab-${k}`} aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
            ))}
          </nav>
        </header>
        <main id="view">
          {tab === 'board' ? <Board /> : <NotPortedYet name={TABS.find(([k]) => k === tab)[1]} />}
        </main>
      </div>
      <Modal />
      <TimerBar />
    </>
  );
}
