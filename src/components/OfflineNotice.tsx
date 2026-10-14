import { useEffect, useState } from 'react';
import { offlineView } from '../lib/offline.js';
import { useAppStore } from '../store/useAppStore.js';

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

// A slim, calm line under the header while the phone has no connection and syncing is on: what was done is kept on the phone and goes
// up by itself. It sits in the page flow (not fixed), so it never covers the timer bar, tab bar or buttons, and never blocks a tap.
// After the connection returns it says so while changes are actually being sent, then goes away (also if the server keeps failing: SyncNotice
// then says changes are waiting). Not shown with syncing off.
export default function OfflineNotice() {
  const sync = useAppStore(s => s.sync);
  const [online, setOnline] = useState(isOnline);
  const [wasOffline, setWasOffline] = useState(false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => { setOnline(false); setWasOffline(true); };
    window.addEventListener('online', up); window.addEventListener('offline', down);
    if (!isOnline()) down();
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const pending = sync ? sync.pendingPaths.length : 0;
  // Once everything is sent, forget the outage so the next return to the network starts clean.
  if (online && wasOffline && pending === 0) setWasOffline(false); // adjusted while rendering, React reruns at once
  const view = offlineView({ syncOn: !!sync, online, wasOffline, pending, syncing: sync?.state === 'syncing' });
  // The region stays mounted (empty) so a screen reader hears the text appear and change.
  return (
    <div className={view === 'hidden' ? undefined : 'notice offlinenote'} role="status" aria-live="polite">
      {view === 'offline' && <><b>Offline.</b> Changes are saved on this phone and will sync when you are back online.</>}
      {view === 'reconnecting' && <><b>Back online.</b> Syncing your changes{pending > 1 ? ` (${pending} waiting)` : ''}…</>}
    </div>
  );
}
