import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flag, useAppStore } from '../store/useAppStore.js';
import { useTimerStore } from '../store/useTimerStore.js';

const HOUR = 60 * 60 * 1000;

// Offers a new version when one is ready; nothing reloads until you choose to.
export default function UpdateBanner() {
  const timing = useTimerStore(s => !!s.mode);
  // The API has said this version is too old to sync (426). Its changes are kept on this device until it is updated.
  const tooOld = useAppStore(s => s.sync?.pausedBecause === 'outdated');
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url: string, reg: ServiceWorkerRegistration | undefined) {
      if (!reg) return;
      registration.current = reg;
      // Look for a new version every hour while the app is open and visible.
      setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); }, HOUR);
    },
  });
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
      <span>A new version of Iron Log is ready.{timing ? ' Reloading stops the running timer.' : ''}</span>
      <span className="actions">
        <button type="button" className="btn sm primary" onClick={() => updateServiceWorker(true)}>Reload now</button>
        <button type="button" className="btn sm ghost" onClick={() => setNeedRefresh(false)}>Later</button>
      </span>
    </div>
  );
}
