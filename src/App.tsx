import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
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
import { WhoContext } from './components/settings/useWho.js';
import { useWide } from './components/board/useWide.js';
import { inAndroidApp } from './lib/androidApp.js';
import { showPlansTab } from './lib/plansTab.js';
import ThemeButton from './components/ThemeButton.js';
import QaBanner from './components/QaBanner.js';
import UpdateBanner from './components/UpdateBanner.js';
import SyncNotice from './components/SyncNotice.js';
import OfflineNotice from './components/OfflineNotice.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { appTitle } from './lib/envName.js';
import { lazyTab, mapChunkError } from './lib/lazyTab.js';
import { parseRoute, routeHash } from './lib/route.js';
import { ROUTE_EVENT } from './components/useRoute.js';
import { renewPush } from './lib/pushClient.js';
import { useWaterReminder } from './hooks/useWaterReminder.js';
import './components/BrandLink.css';

// The Board (the first screen) and the shell are in the main bundle; the other tabs are fetched when first opened. Every chunk is in the
// service worker's precache, so they open offline too.
const Daily = lazyTab(() => import('./components/daily/Daily.js'));
const Progress = lazyTab(() => import('./components/progress/Progress.js'));
const Editor = lazyTab(() => import('./components/program/Editor.js'));
const PlansTab = lazyTab(() => import('./components/plans/PlansTab.js'));
const Settings = lazyTab(() => import('./components/settings/Settings.js'));
// The Program tab's "plan on a computer" tip floats above the page and draws nothing until it is due, so its chunk is fetched with the tab.
const ProgramOnComputer = lazy(mapChunkError(() => import('./components/ProgramOnComputer.js')));
// The sync cards (sign in, other account, upload this device's data) only exist while syncing is on, so their code (and the sync
// planner behind it) loads only then. They draw nothing until they are needed, so waiting for the chunk moves nothing.
const loadSyncCards = () => import('./components/SyncCards.js');
const SignInCard = lazy(mapChunkError(() => loadSyncCards().then(m => ({ default: m.SignInCard }))));
const OtherAccountCard = lazy(mapChunkError(() => loadSyncCards().then(m => ({ default: m.OtherAccountCard }))));
const LegacyCard = lazy(mapChunkError(() => loadSyncCards().then(m => ({ default: m.LegacyCard }))));
function WhenSyncing({ children }: { children: ReactNode }) {
  const syncing = useAppStore(s => s.sync !== null);
  return syncing ? <ErrorBoundary where="view"><Suspense fallback={null}>{children}</Suspense></ErrorBoundary> : null;
}
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

const TABS: [string, string, ComponentType][] = [['board', 'Board', BoardTab], ['daily', 'Daily', Daily], ['progress', 'Progress', Progress], ['program', 'Program', Editor], ['plans', 'Plans', PlansTab], ['settings', 'Settings', Settings]];

const APP_TITLE = appTitle(window.location.hostname); // "Loadbearer - QA" on the QA host, "Loadbearer - Staging" on staging

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
  const { name: badgeName, pending: badgePending, who, ask } = useBadgeName();
  // The Plans tab is for a signed-in free account on a wide screen (src/lib/plansTab.ts); everyone else's bar is as before.
  const [inApp] = useState(inAndroidApp); // asked once: the Play build shows no prices, whatever the screen width (ADR 065 point 8)
  const plansShown = showPlansTab(useWide(), who, inApp);
  const tabs = TABS.filter(([k]) => (k !== 'settings' || badgeName === null && !badgePending) && (k !== 'plans' || plansShown));
  const tabDrawn = tabs.some(([k]) => k === tab); // false on Settings reached through the badge
  const label = TABS.find(([k]) => k === tab)![1];
  useEffect(() => { document.title = `${label} · ${APP_TITLE}`; }, [label]);

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
  // Screen addresses (brief navigation-urls). A tab change swaps the address instead of adding a Back step; Back or an edited address moves to the tab it names.
  const skipPop = useRef(false);
  useEffect(() => {
    if (parseRoute(location.hash)?.tab === tab) return;
    if (history.state?.settingsScreen) skipPop.current = true; // leaving Settings with a screen open takes that screen's history entry back (Settings.tsx): the popstate it causes must not undo this tab change
    history.replaceState({ ...history.state, route: false }, '', routeHash(tab));
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }, [tab]);
  useEffect(() => {
    const sync = () => {
      if (skipPop.current) {
        skipPop.current = false; // a pop we asked for ourselves: only fix the address when it names another tab than the one now shown (a sheet closed on a page keeps its page)
        const now = useAppStore.getState().tab;
        if (parseRoute(location.hash)?.tab !== now) { history.replaceState(history.state, '', routeHash(now)); window.dispatchEvent(new Event(ROUTE_EVENT)); }
        return;
      }
      const r = parseRoute(location.hash);
      if (r && r.tab !== useAppStore.getState().tab) setTab(r.tab);
    };
    window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, [setTab]);
  // A sheet adds one history entry, so Back closes the sheet and stays on the screen. An entry left over from before a reload is dropped, so Back is not a dead press.
  const sheetOpen = useAppStore(s => s.modal !== null);
  useEffect(() => { if (history.state?.sheet) history.replaceState({ ...history.state, sheet: false }, ''); }, []);
  useEffect(() => {
    if (sheetOpen && !history.state?.sheet) history.pushState({ ...history.state, sheet: true }, '');
    if (!sheetOpen && history.state?.sheet) { skipPop.current = true; history.back(); } // the sheet may close in the same update as a tab change: the entry below has the old address, fixed once in sync()
  }, [sheetOpen]);
  useEffect(() => {
    const onPop = () => { if (useAppStore.getState().modal && !history.state?.sheet) closeModal(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [closeModal]);
  // A note set just before a reload (Erase everything), said once now that the page is back.
  useEffect(() => { const t = takeAfterReload(); if (t) flag(t); }, []);
  useWaterReminder();
  useEffect(() => { void renewPush(); }, []); // a browser can drop a push subscription; this puts it back (admin-only, and only if this device turned push on)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeModal]);

  // Plans reached after it stopped applying (the window narrowed, a plan was bought, signed out): back to the Board.
  const plansGone = tab === 'plans' && !plansShown;
  useEffect(() => { if (plansGone && !badgePending) setTab('board'); }, [plansGone, badgePending, setTab]);
  const View = TABS.find(([k]) => k === (plansGone ? 'board' : tab))![2];
  return (
    <WhoContext.Provider value={ask}>
      <a className="skip" href="#view" onClick={e => { e.preventDefault(); document.getElementById('view')?.focus(); }}>Skip to content</a>
      <div className="wrap" data-acctmenu={badgeName !== null || badgePending ? '' : undefined}>
        <header className="top">
          <h1><button type="button" className="brandlink" aria-current={tab === 'board' ? 'page' : undefined} onClick={() => { setTab('board'); window.scrollTo({ top: 0 }); }}>{APP_TITLE}</button></h1>
          <div className="topact">
            <button type="button" className="btn ghost helpbtn" id="help-btn" onClick={() => openModal({ type: 'help' })}>Help</button>
            <ThemeButton />
          </div>
          <nav className="tabs" aria-label="Sections" ref={tabsRef}>
            <div role="tablist" aria-label="Sections" className="tablist" onKeyDown={onTabKey}>
              {tabs.map(([k, l]) => (
                <button type="button" role="tab" key={k} id={`tab-${k}`} aria-selected={tab === k} aria-controls="view"
                  tabIndex={tab === k || (!tabDrawn && k === tabs[0][0]) ? 0 : -1} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
          </nav>
          <AccountBadge name={badgeName} email={who?.status === 'signed-in' ? who.email : null} canSignOut={who?.status === 'signed-in' && who.kind === 'session'} />
        </header>
        <UpdateBanner />
        <QaBanner />
        <OfflineNotice />
        <SyncNotice />
        <WhenSyncing><SignInCard /></WhenSyncing>
        <WhenSyncing><OtherAccountCard /></WhenSyncing>
        <InstallHint />
        {tab === 'program' && <ErrorBoundary where="view"><Suspense fallback={null}><ProgramOnComputer /></Suspense></ErrorBoundary>}
        <WhenSyncing><LegacyCard /></WhenSyncing>
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
    </WhoContext.Provider>
  );
}
