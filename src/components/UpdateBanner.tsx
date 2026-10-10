import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flag, useAppStore } from '../store/useAppStore.js';
import { useTimerStore } from '../store/useTimerStore.js';
import { canAutoReload, isTyping, lastAutoReload, markAutoReload } from '../lib/updateIdle.js';

const HOUR = 60 * 60 * 1000;
const CHECK_MS = 5_000; // how often a waiting update asks whether the app is idle yet
const REFOCUS_MS = 10 * 60 * 1000; // coming back to the app checks for an update if the last check is older than this

// Applies a waiting version once the app is idle (ADR 018); while it is in use the banner offers it and nothing reloads until you choose to.
export default function UpdateBanner() {
  const timing = useTimerStore(s => !!s.mode);
  // The API has said this version is too old to sync (426). Its changes are kept on this device until it is updated.
  const tooOld = useAppStore(s => s.sync?.pausedBecause === 'outdated');
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const lastInput = useRef(0);
  const lastCheck = useRef(0);
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url: string, reg: ServiceWorkerRegistration | undefined) {
      if (!reg) return;
      registration.current = reg;
      // Look for a new version every hour while the app is open and visible.
      setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) { lastCheck.current = Date.now(); reg.update().catch(() => {}); } }, HOUR);
    },
  });
  // Opening the app again is the best time to find an update: nothing is in progress yet.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') lastInput.current = Date.now(); // returning counts as activity: restart the quiet time
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck.current < REFOCUS_MS) return;
      lastCheck.current = Date.now();
      registration.current?.update().catch(() => {});
    };
    const onInput = () => { lastInput.current = Date.now(); };
    lastInput.current = lastCheck.current = Date.now(); // the app was just opened
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', onInput, true);
    document.addEventListener('keydown', onInput, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', onInput, true);
      document.removeEventListener('keydown', onInput, true);
    };
  }, []);
  // A waiting version is applied by itself once nothing is in use. "Later" clears needRefresh, which stops this until the next version.
  useEffect(() => {
    if (!needRefresh) return;
    const id = setInterval(() => {
      const st = useAppStore.getState();
      const now = Date.now();
      if (!canAutoReload({
        timing: !!useTimerStore.getState().mode,
        modalOpen: !!st.modal,
        importing: !!st.importDraft,
        unsavedCount: st.unsaved.length,
        typing: isTyping(document.activeElement),
        sinceInputMs: now - lastInput.current,
        sinceAutoReloadMs: now - lastAutoReload(),
      })) return;
      markAutoReload(now);
      updateServiceWorker(true);
    }, CHECK_MS);
    return () => clearInterval(id);
  }, [needRefresh, updateServiceWorker]);
  useEffect(() => { if (offlineReady) { flag('Ready to work offline'); setOfflineReady(false); } }, [offlineReady, setOfflineReady]);
  // Look for the update now rather than at the next hourly check.
  useEffect(() => { if (tooOld) registration.current?.update().catch(() => {}); }, [tooOld]);
  if (tooOld) {
    return (
      <div className="notice movewarn" role="alert">
        <span><b>Update needed.</b> This version of Iron Log is too old to sync. Your changes are kept on this device and will be sent once you update.{timing ? ' Reloading stops the running timer.' : ''}</span>
        <span className="actions">
          <button type="button" className="btn sm primary" onClick={() => (needRefresh ? updateServiceWorker(true) : window.location.reload())}>Reload to update</button>
        </span>
      </div>
    );
  }
  if (!needRefresh) return null;
  return (
    <div className="notice tip updatebar" role="status">
      <span>A new version of Iron Log is ready; it installs by itself when you're not in the middle of something.{timing ? ' Reloading stops the running timer.' : ''}</span>
      <span className="actions">
        <button type="button" className="btn sm primary" onClick={() => updateServiceWorker(true)}>Reload now</button>
        <button type="button" className="btn sm ghost" onClick={() => setNeedRefresh(false)}>Later</button>
      </span>
    </div>
  );
}
