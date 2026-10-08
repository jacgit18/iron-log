import { useEffect, useState } from 'react';
import type { AccountState } from '../../sync/account.js';
import ExportUpload from './ExportUpload.js';
import { useGoogleSignIn } from '../../sync/useGoogleSignIn.js';
import { flag, getSyncApi } from '../../store/useAppStore.js';

// Who is signed in, and the way to sign in or out. Only shown when syncing through the API is switched on (feature-flags.md).
// Every state is a sentence, not a colour. "Could not check" is never worded as "signed out": the person may well be signed in.
export default function AccountPanel() {
  const api = getSyncApi();
  const { client: account, busy, setBusy, start: signIn } = useGoogleSignIn();
  const [state, setState] = useState<AccountState | null>(null);

  // Bumped to ask for the answer again (after signing out); the effect below is the only place that reads it.
  const [checks, setChecks] = useState(0);
  useEffect(() => {
    if (!api) return;
    let current = true;
    void account.me().then(s => { if (current) setState(s); });
    return () => { current = false; };
  }, [api, account, checks]);
  if (!api) return null;

  const signOut = async () => {
    setBusy(true);
    const done = await account.signOut();
    setBusy(false);
    if (!done) { flag('Could not sign out. Try again in a moment.'); return; }
    setChecks(n => n + 1);
    void api.resume();
  };

  return (
    <section className="panel accountpanel" aria-labelledby="account-h">
      <h2 id="account-h">Account</h2>
      {state === null && <p className="note" role="status">Checking who is signed in…</p>}
      {state?.status === 'unreachable' && <p className="notice" role="status">Could not check who is signed in. Your changes are kept on this device.</p>}
      {state?.status === 'signed-out' && (
        <>
          <p><b>Not signed in.</b> Your changes are kept on this device and will be sent once you sign in.</p>
          <div className="actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void signIn()}>Sign in with Google</button>
          </div>
        </>
      )}
      {state?.status === 'signed-in' && (
        <>
          <p>{state.kind === 'dev' ? <><b>Signed in as the development user.</b> This build does not use a real account.</> : <>Signed in as <b>{state.email ?? state.name ?? 'your account'}</b>.</>}</p>
          {state.kind === 'session' && (
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>Sign out</button>
            </div>
          )}
          <ExportUpload />
        </>
      )}
    </section>
  );
}
