import { useGoogleSignIn } from '../../sync/useGoogleSignIn.js';

// The Library signed out (brief recipes-desktop-layouts, R7): one sentence and a Sign in button instead of a search box and filters that find nothing.
export default function LibrarySignIn() {
  const { busy, start } = useGoogleSignIn();
  return (
    <div className="rc-libsignin" id="recipes-library-signin">
      <p className="note">Sign in to browse the recipe library.</p>
      <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>Sign in</button>
    </div>
  );
}
