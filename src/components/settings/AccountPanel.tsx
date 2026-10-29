import { useWho } from './useWho.js';
import EmailCodeSignIn from '../EmailCodeSignIn.js';
import LegalLinks from '../LegalLinks.js';
import { useGoogleSignIn } from '../../sync/useGoogleSignIn.js';
import { getSyncApi } from '../../store/useAppStore.js';

// The way to sign in, for someone who is not signed in. Signed in, the account menu in the header says who (with Sign out), so this panel is not drawn. Only shown when syncing through the API is switched on (feature-flags.md).
// Every state is a sentence, not a colour. "Could not check" is never worded as "signed out": the person may well be signed in.
export default function AccountPanel() {
  const api = getSyncApi();
  const { client: account, busy, start: signIn } = useGoogleSignIn();
  const { who: state, recheck } = useWho(!!api, account);
  if (!api || state?.status === 'signed-in') return null;

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
    </section>
  );
}
