import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { flag } from '../store/useAppStore.js';
import { useTimerStore } from '../store/useTimerStore.js';

const HOUR = 60 * 60 * 1000;

// Offers a new version when one is ready; nothing reloads until you choose to.
export default function UpdateBanner() {
  const timing = useTimerStore(s => !!s.mode);
  const { needRefresh: [needRefresh, setNeedRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url: string, reg: ServiceWorkerRegistration | undefined) {
      if (!reg) return;
      // Look for a new version every hour while the app is open and visible.
      setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {}); }, HOUR);
    },
  });
  useEffect(() => { if (offlineReady) { flag('Ready to work offline'); setOfflineReady(false); } }, [offlineReady, setOfflineReady]);
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
