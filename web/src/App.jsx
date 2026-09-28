import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore.js';
import { progName } from './lib/logic.js';
import useTooltips from './hooks/useTooltips.js';
import Board from './components/board/Board.jsx';
import Progress from './components/progress/Progress.jsx';
import Muscles from './components/muscles/Muscles.jsx';
import Editor from './components/program/Editor.jsx';
import Settings from './components/settings/Settings.jsx';
import TimerBar from './components/TimerBar.jsx';
import LogSheet from './components/sheets/LogSheet.jsx';
import DetailSheet from './components/sheets/DetailSheet.jsx';
import TagSheet from './components/sheets/TagSheet.jsx';
import SlotSheet from './components/sheets/SlotSheet.jsx';
import NewProgramSheet from './components/sheets/NewProgramSheet.jsx';
import ImportSheet from './components/sheets/ImportSheet.jsx';

const TABS = [['board', 'Board', Board], ['progress', 'Progress', Progress], ['body', 'Muscles', Muscles], ['program', 'Program', Editor], ['settings', 'Settings', Settings]];

function Modal() {
  const modal = useAppStore(s => s.modal);
  const slotExists = useAppStore(s => (s.modal && s.modal.type === 'log' ? !!s.slotById(s.modal.slotId) : true));
  if (!modal || !slotExists) return null;
  switch (modal.type) {
    case 'log': return <LogSheet key={`${modal.slotId}:${modal.idx}`} slotId={modal.slotId} idx={modal.idx} />;
    case 'detail': return <DetailSheet exId={modal.exId} />;
    case 'tags': return <TagSheet key={modal.exId} exId={modal.exId} />;
    case 'slot': return <SlotSheet key={`slot-${modal.idx}`} idx={modal.idx} />;
    case 'newprog': return <NewProgramSheet />;
    case 'import': return <ImportSheet />;
    default: return null;
  }
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

  const View = TABS.find(([k]) => k === tab)[2];
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
        <main id="view"><View /></main>
      </div>
      <Modal />
      <TimerBar />
    </>
  );
}
