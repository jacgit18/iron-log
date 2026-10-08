import { useAppStore } from '../store/useAppStore.js';

const aChange = (n: number, verb: [string, string]) => (n === 1 ? `A change ${verb[0]}` : `${n} changes ${verb[1]}`);

// Shown under the header when sync needs the user's attention: changes the server would not take, or changes waiting
// because the server cannot be reached. Quiet otherwise, so it never nags during a normal sync. "Too old" has its own
// notice (UpdateBanner), and the full picture is in Settings.
export default function SyncNotice() {
  const sync = useAppStore(s => s.sync);
  const setTab = useAppStore(s => s.setTab);
  if (!sync) return null;
  const waiting = sync.state === 'paused' && sync.pausedBecause !== 'outdated' ? sync.pendingPaths.length : 0;
  const setAside = sync.quarantined;
  if (!waiting && !setAside) return null;
  return (
    <div className="notice movewarn" role={setAside ? 'alert' : 'status'}>
      <div>
        {setAside > 0 && <div><b>Not sent:</b> {aChange(setAside, ['was', 'were'])} not accepted by the server and set aside.</div>}
        {waiting > 0 && <div>{aChange(waiting, ['is', 'are'])} waiting to sync. {waiting === 1 ? 'It is' : 'They are'} safe on this device.</div>}
      </div>
      <div className="actions"><button type="button" className="btn sm" onClick={() => setTab('settings')}>Details</button></div>
    </div>
  );
}
