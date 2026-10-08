import { useMemo, useState } from 'react';
import { describeLegacy, legacyDocs, planLegacy } from '../sync/legacy.js';
import { localPaths, readLegacyMarker, writeLegacyMarker, type LegacyMarker } from '../sync/legacyMarker.js';
import { LS } from '../lib/storage.js';
import { flag, getSyncApi, useAppStore } from '../store/useAppStore.js';

// Phase E: this browser held data before accounts existed. While the account is empty and nothing new has been logged, it can be
// uploaded once, all or nothing. After that it cannot (the server refuses a second upload), so the card says so plainly.
// Nothing is ever deleted from this device by this card.
const WHY: Record<string, string> = {
  'not-empty': 'Your account already has data, so nothing was uploaded.',
  mismatch: 'The server’s counts did not match what was sent, so please check your data before trying again.',
  unavailable: 'Uploading is not available right now.',
};

export default function LegacyCard() {
  const sync = useAppStore(s => s.sync);
  const api = getSyncApi();
  const [marker, setMarker] = useState<LegacyMarker | null>(readLegacyMarker);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const plan = useMemo(() => (api && !marker ? planLegacy(legacyDocs(localPaths(), p => LS.get(p))) : null), [api, marker]);
  if (!api || !sync || !plan || !plan.commands.length || marker || later) return null;
  if (!sync.ready || sync.state !== 'idle') return null; // signed in and caught up first; the sign-in and account cards come before this

  const what = describeLegacy(plan.summary);
  const dismiss = () => { const m: LegacyMarker = { state: 'dismissed', at: new Date().toISOString() }; writeLegacyMarker(m); setMarker(m); };

  const upload = async () => {
    setBusy(true);
    setProblem('');
    const out = await api.importLegacy(plan.commands);
    setBusy(false);
    if (out.ok) {
      const m: LegacyMarker = { state: 'uploaded', at: new Date().toISOString(), total: out.total };
      writeLegacyMarker(m);
      setMarker(m);
      flag(`Uploaded ${what}.`);
      return;
    }
    if (out.class === 'refused') setProblem(`The server would not take row ${(out.at ?? 0) + 1}${out.command ? ` (${out.command})` : ''}: ${out.reason}. Nothing was uploaded.`);
    else if (out.class === 'network' || out.class === 'server' || out.class === 'auth' || out.class === 'outdated') setProblem('Could not reach the server, or you are signed out. Nothing was uploaded; try again in a moment.');
    else setProblem(WHY[out.class] ?? 'Nothing was uploaded.');
  };

  if (sync.holdsData) {
    return (
      <div className="notice movewarn" role="status">
        <div><b>Old data on this device.</b> It holds {what} from before accounts, but your account already has data, so it cannot be added automatically. It is still here and nothing was deleted.</div>
        <div className="actions"><button type="button" className="btn sm" onClick={dismiss}>Got it</button></div>
      </div>
    );
  }
  return (
    <div className="notice movewarn" role="status">
      <div>
        <b>Upload this device’s data?</b> It holds {what} from before accounts. Uploading adds it to your account once, all or nothing. Do this before logging anything new: after that it cannot be added. Nothing is deleted from this device.
        {problem && <div role="alert"><b>{problem}</b></div>}
      </div>
      <div className="actions">
        <button type="button" className="btn sm primary" disabled={busy} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Upload'}</button>
        <button type="button" className="btn sm" disabled={busy} onClick={() => setLater(true)}>Not now</button>
      </div>
    </div>
  );
}
