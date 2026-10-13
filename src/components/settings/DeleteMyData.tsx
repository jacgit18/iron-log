import { useMemo, useState } from 'react';
import { forgetSession } from '../../lib/gate.js';
import { LS } from '../../lib/storage.js';
import { parsePath } from '../../sync/documents.js';
import { createAccountClient } from '../../sync/account.js';
import { useWho } from './useWho.js';
import { noteAfterReload } from '../../lib/afterReload.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import { localPaths, writeLegacyMarker } from '../../sync/legacyMarker.js';
import { getSyncApi, useAppStore } from '../../store/useAppStore.js';

// Phase F: erase everything in the account for good, or delete the account. The server removes the rows (not a soft delete: no weight or
// note is left to read), then this device forgets its own copy and reloads. Only with syncing on and someone signed in. Each needs the
// word typed, so a stray tap cannot do it. Backups age out within 30 days; the privacy policy says so, and so does this panel.
const WORDS = { data: 'ERASE', account: 'DELETE' } as const;
type What = keyof typeof WORDS;

const WHY: Record<string, string> = {
  network: 'Could not reach the server. Nothing was erased.',
  server: 'The server could not do it right now. Nothing was erased; try again in a moment.',
  auth: 'You are signed out. Sign in, then try again. Nothing was erased.',
  outdated: 'This version of the app is too old. Update it first. Nothing was erased.',
  refused: 'The server would not do it. Nothing was erased.',
  unavailable: 'This is not available right now. Nothing was erased.',
};

// What this device holds of its own: the documents from before accounts, and the notes about them, and the grocery list (kept on this device only). Display options stay.
function forgetDevice() {
  for (const path of localPaths()) if (parsePath(path) || path.startsWith('grocery/')) LS.remove(path);
  LS.remove('sync/legacy');
  forgetSession(LS); // the next screen is the landing page
  writeLegacyMarker({ state: 'dismissed', at: new Date().toISOString() }); // never offer to upload what was just erased
}

export default function DeleteMyData() {
  const api = getSyncApi();
  const sync = useAppStore(s => s.sync);
  const dl = useAppStore(s => s.dl);
  const exporting = useAppStore(s => s.exporting);
  const account = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const { who } = useWho(!!api, account);
  const [typed, setTyped] = useState<Record<What, string>>({ data: '', account: '' });
  const [busy, setBusy] = useState<What | null>(null);
  const [problem, setProblem] = useState('');

  // Not while this device holds another account's data: the server would erase the signed-in account, and this device would then
  // forget the other one's copy and unsent changes. The other-account card's choice comes first.
  if (!api || !sync || who?.status !== 'signed-in' || (sync.state === 'paused' && sync.pausedBecause === 'account')) return null;

  const run = async (what: What) => {
    setBusy(what);
    setProblem('');
    const out = await api.eraseEverything(what);
    if (!out.ok) { setBusy(null); setProblem(WHY[out.class] ?? WHY.unavailable!); return; }
    forgetDevice();
    noteAfterReload(what === 'data' ? 'Everything in your account was erased.' : 'Your account was deleted.'); // shown after the reload
    window.location.reload(); // the app still holds the old data in memory; start clean
  };

  const block = (what: What, title: string, body: string, button: string) => {
    const id = `dmd-${what}`;
    return (
      <div className="dmd-block">
        <h4>{title}</h4>
        <p>{body}</p>
        <label className="field" htmlFor={id}>Type <b>{WORDS[what]}</b> to confirm
          <input id={id} type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed[what]} onChange={e => setTyped(t => ({ ...t, [what]: e.target.value }))} />
        </label>
        <div className="actions">
          <button type="button" className="btn danger" disabled={busy !== null || typed[what].trim() !== WORDS[what]} onClick={() => void run(what)}>{busy === what ? 'Working…' : button}</button>
        </div>
      </div>
    );
  };

  return (
    <section className="panel deletemydata danger-panel" aria-labelledby="dmd-h">
      <h3 id="dmd-h">Delete my data</h3>
      <p>These remove your data from the server for good, not just hide it. They cannot be undone. <b>Export first</b> if you want a copy: it is yours to keep.</p>
      {dl && <div className="actions"><button type="button" className="btn" disabled={!!exporting} onClick={() => void useAppStore.getState().downloadData()}>Export all data first</button></div>}
      {block('data', 'Erase everything in my account', 'Removes every workout, check-off, body weight, program and setting from the server, and from this device. You stay signed in with an empty account. Your other devices clear themselves the next time they sync.', 'Erase everything permanently')}
      {block('account', 'Delete my account', 'Does the above, and also deletes your account and its Google sign-in record. Signing in with the same Google account afterwards starts a new, empty account.', 'Delete my account permanently')}
      <p className="note">Copies in the server's nightly backups are deleted automatically within 30 days. Nothing else about you is kept. {' '}<a href="/privacy.html">Privacy policy</a></p>
      {problem && <p className="notice" role="alert"><b>{problem}</b></p>}
    </section>
  );
}
