import { useGoogleSignIn } from '../sync/useGoogleSignIn.js';
import { useAppStore } from '../store/useAppStore.js';

// Shown when syncing is on but nobody is signed in (the server answered 401). Without it the app would sit on "Loading…".
// Nothing is lost while signed out: changes are kept on this device and sent after sign-in.
export default function SignInCard() {
  const signedOut = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'auth');
  const { busy, start } = useGoogleSignIn();
  if (!signedOut) return null;
  return (
    <div className="notice movewarn" role="status">
      <div><b>Sign in to sync.</b> Your changes are kept on this device and will be sent once you sign in.</div>
      <div className="actions"><button type="button" className="btn sm" disabled={busy} onClick={() => void start()}>Sign in with Google</button></div>
    </div>
  );
}
