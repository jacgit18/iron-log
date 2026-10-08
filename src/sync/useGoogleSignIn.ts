import { useMemo, useState } from 'react';
import { createAccountClient } from './account.js';
import { signIn as devHeaders } from './devUser.js';
import { flag } from '../store/useAppStore.js';

/** Starts Google sign-in and sends the browser there. `busy` stays true once it is on its way, so a second press does nothing. */
export function useGoogleSignIn() {
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const out = await client.startGoogleSignIn();
    if (out.ok) { window.location.assign(out.url); return; }
    setBusy(false);
    flag(out.reason === 'unreachable' ? 'Could not reach the server to sign in. Try again in a moment.' : 'Sign-in is not available right now.');
  };
  return { client, busy, setBusy, start };
}
