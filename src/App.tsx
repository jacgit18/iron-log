import { lazy, Suspense, useEffect, useRef, type ComponentType, type KeyboardEvent } from 'react';
import { flag, useAppStore } from './store/useAppStore.js';
import { takeAfterReload } from './lib/afterReload.js';
import { progName } from './lib/logic.js';
import useTooltips from './hooks/useTooltips.js';
import useFocusKeeper from './hooks/useFocusKeeper.js';
import useTabbarHeight from './hooks/useTabbarHeight.js';
import BoardTab from './components/board/BoardTab.js';
import TimerBar from './components/TimerBar.js';
import Toaster from './components/Toaster.js';
import InstallHint from './components/board/InstallHint.js';
import AccountBadge from './components/AccountBadge.js';
import UpdateBanner from './components/UpdateBanner.js';
import LegacyCard from './components/LegacyCard.js';
import OtherAccountCard from './components/OtherAccountCard.js';
import SignInCard from './components/SignInCard.js';
import SyncNotice from './components/SyncNotice.js';
import OfflineNotice from './components/OfflineNotice.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { lazyTab } from './lib/lazyTab.js';
import { renewPush } from './lib/pushClient.js';

// The Board (the first screen) and the shell are in the main bundle; the other tabs are fetched when first opened. Every chunk is in the
// service worker's precache, so they open offline too.
const Daily = lazyTab(() => import('./components/daily/Daily.js'));
const Progress = lazyTab(() => import('./components/progress/Progress.js'));
const Editor = lazyTab(() => import('./components/program/Editor.js'));
const Settings = lazyTab(() => import('./components/settings/Settings.js'));
// The sheets (log, detail, slot, import, ...) are only drawn once one is opened, so they load as one chunk after the first screen is up
// rather than before it. They are fetched shortly after, so the first one opens without waiting; offline they come from the precache.
const loadModal = () => import('./components/sheets/Modal.js');
const LazyModal = lazy(loadModal);
function Modal() {
  const open = useAppStore(s => s.modal !== null);
  // Fetched once the first screen is settled, so the first sheet opens without waiting. A failed fetch (offline, no precache yet) is ignored
  // here; opening a sheet tries again, and a failure then lands in the boundary instead of taking the whole app down.
  useEffect(() => { const t = setTimeout(() => { loadModal().catch(() => {}); }, 1500); return () => clearTimeout(t); }, []);
  return open ? <ErrorBoundary where="view"><Suspense fallback={null}><LazyModal /></Suspense></ErrorBoundary> : null;
}

const TABS: [string, string, ComponentType][] = [['board', 'Board', BoardTab], ['daily', 'Daily', Daily], ['progress', 'Progress', Progress], ['program', 'Program', Editor], ['settings', 'Settings', Settings]];

export default function App() {
  const tab = useAppStore(s => s.tab);
  const cfg = useAppStore(s => s.cfg);
  const saveFlag = useAppStore(s => s.saveFlag);
  const unsaved = useAppStore(s => s.unsaved);
  // With syncing on, a refused write is kept in the sync screen's "Not sent" list (SyncNotice says so), so this notice about
  // this device's own storage would be wrong: nothing is lost on reload.
  const syncing = useAppStore(s => s.sync !== null);
  const storeMode = useAppStore(s => s.storeMode);
  const ready = useAppStore(s => s.isReady());
  const signedOut = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'auth');
  const progKey = useAppStore(s => s.activeProgKey());
  const { setTab, closeModal, openModal } = useAppStore.getState();
  useTooltips();
  useFocusKeeper();
  const tabsRef = useRef<HTMLElement>(null);
  useTabbarHeight(tabsRef);

  const label = TABS.find(([k]) => k === tab)![1];
  useEffect(() => { document.title = `${label} · Iron Log`; }, [label]);

  // Tabs pattern: arrows / Home / End move between tabs and select them.
  const onTabKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const n = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 } as Record<string, number>)[e.key];
    if (n == null) return;
    e.preventDefault();
    const k = TABS[(n + TABS.length) % TABS.length][0];
    setTab(k); document.getElementById(`tab-${k}`)!.focus();
  };
  // A note set just before a reload (Erase everything), said once now that the page is back.
  useEffect(() => { const t = takeAfterReload(); if (t) flag(t); }, []);
  useEffect(() => { void renewPush(); }, []); // a browser can drop a push subscription; this puts it back (admin-only, and only if this device turned push on)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeModal]);

  const View = TABS.find(([k]) => k === tab)![2];
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
          <nav className="tabs" aria-label="Sections" ref={tabsRef}>
            <div role="tablist" aria-label="Sections" className="tablist" onKeyDown={onTabKey}>
              {TABS.map(([k, l]) => (
                <button type="button" role="tab" key={k} id={`tab-${k}`} aria-selected={tab === k} aria-controls="view"
                  tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </nav>
          <AccountBadge />
        </header>
        <UpdateBanner />
        <OfflineNotice />
        <SyncNotice />
        <SignInCard />
        <OtherAccountCard />
        <InstallHint />
        <LegacyCard />
        {/* Stays until the writes go through: a passing message isn't enough when data would be gone on reload. */}
        {unsaved.length > 0 && !syncing && (
          <div className="notice movewarn" role="alert">
            <div><b>Not saved:</b> {unsaved.length === 1 ? 'a change' : `${unsaved.length} changes`} couldn’t be saved on this device{storeMode === 'local' ? ' (storage is full)' : ''}, and would be lost on reload. Free some space or export a backup, then try again.</div>
            <div className="actions"><button type="button" className="btn sm" onClick={() => useAppStore.getState().retryUnsaved()}>Try again</button></div>
          </div>
        )}
        <main>
          {/* None of the data views is drawn until the data has loaded: until then the store holds its starting state, which is the owner's built-in plan (ADR 016). Settings stays, since Sign in, Sign out and the sync controls must work when nothing can load. */}
          <div id="view" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>{ready || tab === 'settings' ? <ErrorBoundary key={tab} where="view"><View /></ErrorBoundary> : null}</div>
        </main>
      </div>
      <Toaster info={!ready && !saveFlag && !signedOut ? 'Loading…' : saveFlag} />
      <Modal />
      <aside className="timer-region" aria-label="Timer"><TimerBar /></aside>
    </>
  );
}
