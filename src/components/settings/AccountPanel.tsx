import { forgetSession } from '../../lib/gate.js';
import { disablePush } from '../../lib/pushClient.js';
import { LS } from '../../lib/storage.js';
import { useWho } from './useWho.js';
import ExportUpload from './ExportUpload.js';
import EmailCodeSignIn from '../EmailCodeSignIn.js';
import LegalLinks from '../LegalLinks.js';
import { useGoogleSignIn } from '../../sync/useGoogleSignIn.js';
import { flag, getSyncApi, useAppStore } from '../../store/useAppStore.js';

// Who is signed in, and the way to sign in or out. Only shown when syncing through the API is switched on (feature-flags.md).
// Every state is a sentence, not a colour. "Could not check" is never worded as "signed out": the person may well be signed in.
export default function AccountPanel() {
  const api = getSyncApi();
  const { client: account, busy, setBusy, start: signIn } = useGoogleSignIn();
  const { who: state, recheck } = useWho(!!api, account);
  if (!api) return null;

  const signOut = async () => {
    setBusy(true);
    await disablePush().catch(() => undefined); // while still signed in, so the server forgets this phone before the next person uses it
    const done = await account.signOut();
    setBusy(false);
    if (!done) { flag('Could not sign out. Try again in a moment.'); return; }
    forgetSession(LS);
    await useAppStore.getState().forgetBackups(); // the next person to sign in on this device must not be offered this account's copies
    window.location.reload(); // signing out on purpose: the next screen is the landing page, not the app
  };

  return (
    <section className="panel accountpanel" aria-labelledby="account-h">
      <h3 id="account-h">Account</h3>
      {state === null && <p className="note" role="status">Checking who is signed in…</p>}
      {state?.status === 'unreachable' && (
        <>
          <p className="notice" role="status">Could not check who is signed in. Your changes are kept on this device. It checks again when the connection comes back.</p>
          <div className="actions"><button type="button" className="btn" onClick={recheck}>Try again</button></div>
        </>
      )}
      {state?.status === 'signed-out' && (
        <>
          <p><b>Not signed in.</b> Your changes are kept on this device and will be sent once you sign in.</p>
          <div className="actions">
            <button type="button" className="btn" disabled={busy} onClick={() => void signIn()}>Sign in with Google</button>
          </div>
          <EmailCodeSignIn client={account} />
          <p><LegalLinks /></p>
        </>
      )}
      {state?.status === 'signed-in' && (
        <>
          <p>{state.kind === 'dev' ? <><b>Signed in as the development user.</b> This build does not use a real account.</> : <>Signed in as <b>{state.email ?? state.name ?? 'your account'}</b>.</>}</p>
          {state.kind === 'session' && (
            <div className="actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>Sign out</button>
            </div>
          )}
          <ExportUpload />
        </>
      )}
    </section>
  );
}
