import { lazy, Suspense, useEffect, useRef, type ComponentType, type KeyboardEvent } from 'react';
import { flag, useAppStore } from './store/useAppStore.js';
import { takeAfterReload } from './lib/afterReload.js';
import useTooltips from './hooks/useTooltips.js';
import useFocusKeeper from './hooks/useFocusKeeper.js';
import useTabbarHeight from './hooks/useTabbarHeight.js';
import BoardTab from './components/board/BoardTab.js';
import TimerBar from './components/TimerBar.js';
import Toaster from './components/Toaster.js';
import InstallHint from './components/board/InstallHint.js';
import AccountBadge from './components/AccountBadge.js';
import useBadgeName from './hooks/useBadgeName.js';
import ProgramSwitch from './components/board/ProgramSwitch.js';
import UpdateBanner from './components/UpdateBanner.js';
import LegacyCard from './components/LegacyCard.js';
import OtherAccountCard from './components/OtherAccountCard.js';
import SignInCard from './components/SignInCard.js';
import SyncNotice from './components/SyncNotice.js';
import OfflineNotice from './components/OfflineNotice.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { lazyTab, mapChunkError } from './lib/lazyTab.js';
import { renewPush } from './lib/pushClient.js';
import { useWaterReminder } from './hooks/useWaterReminder.js';

// The Board (the first screen) and the shell are in the main bundle; the other tabs are fetched when first opened. Every chunk is in the
// service worker's precache, so they open offline too.
const Daily = lazyTab(() => import('./components/daily/Daily.js'));
const Progress = lazyTab(() => import('./components/progress/Progress.js'));
const Editor = lazyTab(() => import('./components/program/Editor.js'));
const Settings = lazyTab(() => import('./components/settings/Settings.js'));
// The sheets (log, detail, slot, import, ...) are only drawn once one is opened, so they load as one chunk after the first screen is up
// rather than before it. They are fetched shortly after, so the first one opens without waiting; offline they come from the precache.
const loadModal = () => import('./components/sheets/Modal.js');
const LazyModal = lazy(mapChunkError(loadModal));
function Modal() {
  const open = useAppStore(s => s.modal !== null);
  // Fetched once the first screen is settled, so the first sheet opens without waiting. Not while offline: the browser remembers a failed
  // import() for the life of the page (see lazyTab.ts), so a prefetch that failed would fail every later open. If a download does fail, the
  // boundary offers Reload (a ChunkLoadError), which also picks up the service worker's copy.
  useEffect(() => {
    const t = setTimeout(() => { if (navigator.onLine !== false) loadModal().catch(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, []);
  return open ? <ErrorBoundary where="view"><Suspense fallback={null}><LazyModal /></Suspense></ErrorBoundary> : null;
}

const TABS: [string, string, ComponentType][] = [['board', 'Board', BoardTab], ['daily', 'Daily', Daily], ['progress', 'Progress', Progress], ['program', 'Program', Editor], ['settings', 'Settings', Settings]];

export default function App() {
  const tab = useAppStore(s => s.tab);
  const saveFlag = useAppStore(s => s.saveFlag);
  const unsaved = useAppStore(s => s.unsaved);
  // With syncing on, a refused write is kept in the sync screen's "Not sent" list (SyncNotice says so), so this notice about
  // this device's own storage would be wrong: nothing is lost on reload.
  const syncing = useAppStore(s => s.sync !== null);
  const storeMode = useAppStore(s => s.storeMode);
  const ready = useAppStore(s => s.isReady());
  const signedOut = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'auth');
  const { setTab, closeModal, openModal } = useAppStore.getState();
  useTooltips();
  useFocusKeeper();
  const tabsRef = useRef<HTMLElement>(null);
  useTabbarHeight(tabsRef);

  // With the account badge showing, the badge is the way to Settings, so the Settings tab is not drawn (it is when nobody is signed in).
  const { name: badgeName, pending: badgePending } = useBadgeName();
  const tabs = badgeName === null && !badgePending ? TABS : TABS.filter(([k]) => k !== 'settings');
  const tabDrawn = tabs.some(([k]) => k === tab); // false on Settings reached through the badge
  const label = TABS.find(([k]) => k === tab)![1];
  useEffect(() => { document.title = `${label} · Iron Log`; }, [label]);

  // Tabs pattern: arrows / Home / End move between tabs and select them.
  const onTabKey = (e: KeyboardEvent) => {
    const focused = tabs.findIndex(([k]) => `tab-${k}` === document.activeElement?.id); // from the tab that has focus; Settings through the badge has no tab of its own
    const i = focused >= 0 ? focused : tabs.findIndex(([k]) => k === tab);
    const n = ({ ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 } as Record<string, number>)[e.key];
    if (n == null) return;
    e.preventDefault();
    const k = tabs[(n + tabs.length) % tabs.length][0];
    setTab(k); document.getElementById(`tab-${k}`)!.focus();
  };
  // A note set just before a reload (Erase everything), said once now that the page is back.
  useEffect(() => { const t = takeAfterReload(); if (t) flag(t); }, []);
  useWaterReminder();
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
          <ProgramSwitch />
          <button type="button" className="btn ghost helpbtn" id="help-btn" onClick={() => openModal({ type: 'help' })}>Help</button>
          <nav className="tabs" aria-label="Sections" ref={tabsRef}>
            <div role="tablist" aria-label="Sections" className="tablist" onKeyDown={onTabKey}>
              {tabs.map(([k, l]) => (
                <button type="button" role="tab" key={k} id={`tab-${k}`} aria-selected={tab === k} aria-controls="view"
                  tabIndex={tab === k || (!tabDrawn && k === tabs[0][0]) ? 0 : -1} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </nav>
          <AccountBadge name={badgeName} />
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
          <div id="view" role="tabpanel" {...(tabDrawn ? { 'aria-labelledby': `tab-${tab}` } : { 'aria-label': label })} tabIndex={-1}>{ready || tab === 'settings' ? <ErrorBoundary key={tab} where="view"><View /></ErrorBoundary> : null}</div>
        </main>
      </div>
      <Toaster info={!ready && !saveFlag && !signedOut ? 'Loading…' : saveFlag} />
      <Modal />
      <aside className="timer-region" aria-label="Timer"><TimerBar /></aside>
    </>
  );
}
