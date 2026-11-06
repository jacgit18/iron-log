import { useEffect, useRef, useState } from 'react';
import { forgetSession } from '../lib/gate.js';
import { disablePush } from '../lib/pushClient.js';
import { signOutFlow } from '../lib/signOutFlow.js';
import { LS } from '../lib/storage.js';
import { TERMS_TICK_KEY, termsHeading, tickIsFresh, type TermsDecision } from '../lib/termsGate.js';
import { createAccountClient } from '../sync/account.js';
import { signIn as devHeaders } from '../sync/devUser.js';
import { useAppStore } from '../store/useAppStore.js';
import TermsCheckbox from './TermsCheckbox.js';
import './Landing.css'; // the page frame and button sizes are the landing page's
import './TermsGate.css';

// The accept screen (brief terms-acceptance): drawn instead of the app while a signed-in account has not accepted the current Terms of Use and Privacy
// Policy: an existing account on its next open, a new one whose box was not remembered, and everyone after a version bump. The app stays closed until
// the box is ticked and Continue is pressed, or the person signs out. Changes made on this device are kept by the store and sent after acceptance (the
// server does not refuse the data routes, ADR 102). A tick made on the sign-in card (sessionStorage, a few minutes old at most) is posted once here, so
// someone who just ticked it is not asked twice.
export default function TermsGate({ owed }: { owed: TermsDecision }) {
  const client = useRef(createAccountClient({ headers: devHeaders })).current;
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(() => { try { return tickIsFresh(sessionStorage.getItem(TERMS_TICK_KEY), Date.now()); } catch { return false; } });
  const [message, setMessage] = useState('');
  const [stale, setStale] = useState(false);
  const autoTried = useRef(false);

  const accept = async () => {
    setBusy(true);
    setMessage('');
    const out = await client.acceptTerms();
    if (out === 'ok') { try { sessionStorage.removeItem(TERMS_TICK_KEY); } catch { /* ignore */ } return; } // the app opens: the guard sees nothing owed
    setBusy(false);
    if (out === 'stale') { setStale(true); setMessage('Your copy of the app is out of date. Reload to get the current Terms.'); return; }
    setMessage('Could not save your answer. Check the connection and try again.');
  };

  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    let fresh = false;
    try { fresh = tickIsFresh(sessionStorage.getItem(TERMS_TICK_KEY), Date.now()); } catch { /* ignore */ }
    if (fresh) void accept();
    else { try { sessionStorage.removeItem(TERMS_TICK_KEY); } catch { /* ignore */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // The precached shell can be the old bundle that just got the 409: ask the service worker to look for the new one first, then reload.
  const reloadFresh = async () => {
    try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* reload anyway */ }
    window.location.reload();
  };

  const signOut = async () => {
    setBusy(true);
    const ok = await signOutFlow({ disablePush, signOut: () => client.signOut(), forgetSession: () => forgetSession(LS), forgetBackups: () => useAppStore.getState().forgetBackups(), reload: () => window.location.reload(), tell: setMessage });
    if (!ok) setBusy(false);
  };

  return (
    <main className="landing termsgate" aria-labelledby="terms-h">
      <img src="/logo.svg" alt="" width="40" height="40" />
      <h1 id="terms-h">{termsHeading(owed)}</h1>
      <p>{owed.first
        ? 'Please read and accept the Terms of Use and the Privacy Policy to use Loadbearer. Nothing on this device is lost or sent anywhere else while you decide.'
        : 'Please read what changed and accept it to keep using Loadbearer. Nothing on this device is lost while you decide.'}</p>
      <TermsCheckbox checked={ticked} onChange={setTicked} hint={false} />
      {message && <p className="notice" role="alert"><b>{message}</b></p>}
      <div className="actions">
        {stale
          ? <button type="button" className="btn primary" onClick={() => void reloadFresh()}>Reload</button>
          : <button type="button" className="btn primary" disabled={busy || !ticked} onClick={() => void accept()}>{busy ? 'Saving…' : 'Continue'}</button>}
        <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>Sign out</button>
      </div>
    </main>
  );
}
