import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore.js';
import { progName } from './lib/logic.js';
import useTooltips from './hooks/useTooltips.js';
import useFocusKeeper from './hooks/useFocusKeeper.js';
import BoardTab from './components/board/BoardTab.jsx';
import Daily from './components/daily/Daily.jsx';
import Progress from './components/progress/Progress.jsx';
import Editor from './components/program/Editor.jsx';
import Settings from './components/settings/Settings.jsx';
import TimerBar from './components/TimerBar.jsx';
import LogSheet from './components/sheets/LogSheet.jsx';
import DetailSheet from './components/sheets/DetailSheet.jsx';
import TagSheet from './components/sheets/TagSheet.jsx';
import SlotSheet from './components/sheets/SlotSheet.jsx';
import ExerciseSheet from './components/sheets/ExerciseSheet.jsx';
import DayAddSheet from './components/sheets/DayAddSheet.jsx';
import { StretchSheet, StretchExpSheet } from './components/sheets/StretchSheets.jsx';
import SupplementSheet from './components/sheets/SupplementSheet.jsx';
import ExperimentSheet from './components/sheets/ExperimentSheet.jsx';
import NewProgramSheet from './components/sheets/NewProgramSheet.jsx';
import ImportSheet from './components/sheets/ImportSheet.jsx';
import HelpSheet from './components/sheets/HelpSheet.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';

const TABS = [['board', 'Board', BoardTab], ['daily', 'Daily', Daily], ['progress', 'Progress', Progress], ['program', 'Program', Editor], ['settings', 'Settings', Settings]];

function Modal() {
  const modal = useAppStore(s => s.modal);
  const slotExists = useAppStore(s => (s.modal && s.modal.type === 'log' ? !!s.slotById(s.modal.slotId) : true));
  if (!modal || !slotExists) return null;
  switch (modal.type) {
    case 'log': return <LogSheet key={`${modal.slotId}:${modal.idx}`} slotId={modal.slotId} idx={modal.idx} />;
    case 'detail': return <DetailSheet exId={modal.exId} />;
    case 'tags': return <TagSheet key={modal.exId} exId={modal.exId} />;
    case 'slot': return <SlotSheet key={`slot-${modal.idx}`} idx={modal.idx} col={modal.col} target={modal.target} />;
    case 'experiment': return <ExperimentSheet key={modal.id || 'new'} id={modal.id} />;
    case 'stretch': return <StretchSheet key={modal.id || 'new'} id={modal.id} />;
    case 'stretchexp': return <StretchExpSheet key={modal.id || 'new'} id={modal.id} />;
    case 'supplement': return <SupplementSheet key={modal.id || 'new'} id={modal.id} />;
    case 'exercise': return <ExerciseSheet key={modal.exId} exId={modal.exId} />;
    case 'dayadd': return <DayAddSheet key={modal.col} col={modal.col} />;
    case 'newprog': return <NewProgramSheet />;
    case 'import': return <ImportSheet />;
    case 'help': return <HelpSheet />;
    default: return null;
  }
}

export default function App() {
  const tab = useAppStore(s => s.tab);
  const cfg = useAppStore(s => s.cfg);
  const saveFlag = useAppStore(s => s.saveFlag);
  const ready = useAppStore(s => s.isReady());
  const progKey = useAppStore(s => s.activeProgKey());
  const { setTab, closeModal, openModal } = useAppStore.getState();
  useTooltips();
  useFocusKeeper();

  const label = TABS.find(([k]) => k === tab)[1];
  useEffect(() => { document.title = `${label} · Iron Log`; }, [label]);

  // Tabs pattern: arrows / Home / End move between tabs and select them.
  const onTabKey = e => {
    const i = TABS.findIndex(([k]) => k === tab);
    const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (n == null) return;
    e.preventDefault();
    const k = TABS[(n + TABS.length) % TABS.length][0];
    setTab(k); document.getElementById(`tab-${k}`).focus();
  };
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeModal]);

  const View = TABS.find(([k]) => k === tab)[2];
  return (
    <>
      <a className="skip" href="#view">Skip to content</a>
      <div className="wrap">
        <header className="top">
          <h1>Iron Log</h1>
          <div className="meta">
            <span className="pill prog">{progName(cfg, progKey)}</span>
            <span className="pill">Mode {cfg.mode}</span>
          </div>
          <button type="button" className="btn ghost helpbtn" id="help-btn" onClick={() => openModal({ type: 'help' })}>Help</button>
          <nav className="tabs" aria-label="Sections">
            <div role="tablist" aria-label="Sections" className="tablist" onKeyDown={onTabKey}>
              {TABS.map(([k, l]) => (
                <button type="button" role="tab" key={k} id={`tab-${k}`} aria-selected={tab === k} aria-controls="view"
                  tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </nav>
          {/* Its own line with a fixed height, so a message appearing or clearing never moves the page. */}
          <p className="saveflag" role="status" aria-live="polite" aria-atomic="true">{!ready && !saveFlag ? 'Loading…' : saveFlag}</p>
        </header>
        <UpdateBanner />
        <main>
          <div id="view" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}><View /></div>
        </main>
      </div>
      <Modal />
      <aside className="timer-region" aria-label="Timer"><TimerBar /></aside>
    </>
  );
}
