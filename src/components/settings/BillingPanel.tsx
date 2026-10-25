import { useEffect, useMemo, useState } from 'react';
import './BillingPanel.css';
import BillingNotice from './BillingNotice.js';
import { createAccountClient } from '../../sync/account.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import { flag, getSyncApi } from '../../store/useAppStore.js';
import { useWho } from './useWho.js';

// The Billing section (ADR 065, brief billing-stripe-subscriptions): the plan, Subscribe (Stripe's hosted Checkout) and Manage billing
// (Stripe's hosted Customer Portal). Admin-only while Stripe is in test mode (the `billing` line in src/features.ts); it draws nothing when
// the server has billing off. The plan itself is set by the server from Stripe's events; this only shows it and sends the browser to Stripe.
const PLAN_NAMES: Record<string, string> = { beta: 'Beta tester', founder: 'Founder', free: 'Free', lifetime: 'Lifetime', paid: 'Supporter' };
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null);
const POLL_MS = 2000;
const POLL_TRIES = 5;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const set = () => setOnline(navigator.onLine !== false);
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set); };
  }, []);
  return online;
}

export default function BillingPanel() {
  const api = getSyncApi();
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const { who, recheck } = useWho(!!api, client);
  const [busy, setBusy] = useState<string | null>(null);
  const [returned] = useState<'success' | 'cancel' | null>(() => {
    const how = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('billing');
    return how === 'success' || how === 'cancel' ? how : null;
  });
  const [tries, setTries] = useState(0);
  const online = useOnline();

  // Back from Stripe's Checkout: the address says how it went (read once above). Take it off the address, and since the webhook may be
  // a moment behind, look again a few times below.
  useEffect(() => {
    if (!returned) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('billing');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }, [returned]);
  const signedIn = who?.status === 'signed-in' ? who : null;
  const settled = signedIn?.billing?.source === 'stripe' && signedIn.isPaid;
  useEffect(() => {
    if (returned !== 'success' || settled || tries >= POLL_TRIES) return;
    const t = setTimeout(() => { setTries(n => n + 1); recheck(); }, POLL_MS);
    return () => clearTimeout(t);
  }, [returned, settled, tries, recheck]);

  // Nothing is drawn until the first answer: when the server has billing off (every admin until go-live) a placeholder would appear and then
  // vanish, moving the Settings page. When billing is on the panel appears once, after the answer.
  if (!api || who === null || who.status === 'signed-out') return null;
  if (signedIn && !signedIn.billing?.available) return null;

  const go = async (what: string, open: () => ReturnType<typeof client.billingPortal>) => {
    setBusy(what);
    const out = await open();
    if (out.ok) { window.location.assign(out.url); return; }
    setBusy(null);
    flag('Billing is unavailable, try again');
  };

  const billing = signedIn?.billing;
  const plan = signedIn?.plan ?? (signedIn?.isPaid ? 'paid' : 'free');
  const renews = dateOf(billing?.renewsAt ?? null);
  const stripePaid = plan === 'paid' && billing?.source === 'stripe';

  return (
    <section className="panel billingpanel" aria-labelledby="billing-h">
      <h3 id="billing-h">Billing</h3>
      {signedIn && billing?.available && <BillingNotice />}
      {who.status === 'unreachable' && (
        <>
          <p className="notice" role="status">Could not check your plan. It checks again when the connection comes back.</p>
          <div className="actions"><button type="button" className="btn" onClick={recheck}>Try again</button></div>
        </>
      )}
      {signedIn && billing && (
        <>
          <p>Plan: <b>{PLAN_NAMES[plan] ?? plan}</b>{plan === 'paid' && billing.source !== 'stripe' ? ' (set by the owner)' : ''}.</p>
          {returned === 'success' && !settled && (
            <p className="note" role="status">{tries >= POLL_TRIES ? 'Still updating. It can take a minute.' : 'Thanks. Updating your plan…'}</p>
          )}
          {returned === 'success' && settled && <p className="note" role="status">Thanks. Your plan is updated.</p>}
          {stripePaid && billing.status === 'past_due' && <p className="notice" role="status">Payment failed. Update your card in Manage billing.</p>}
          {stripePaid && renews && billing.status !== 'past_due' && <p className="note">Renews on {renews}.</p>}
          {(plan === 'lifetime' || plan === 'founder') && <p className="note">Nothing to pay.</p>}
          {plan === 'beta' && <p className="note">Your plan is set by the owner.</p>}
          {!online && <p className="note" role="status">You are offline. Billing needs a connection.</p>}
          <div className="actions">
            {plan === 'free' && (
              <>
                <button type="button" className="btn" disabled={busy !== null || !online} onClick={() => void go('month', () => client.billingCheckout('month'))}>{busy === 'month' ? 'Opening…' : 'Subscribe monthly'}</button>
                <button type="button" className="btn" disabled={busy !== null || !online} onClick={() => void go('year', () => client.billingCheckout('year'))}>{busy === 'year' ? 'Opening…' : 'Subscribe yearly'}</button>
              </>
            )}
            {billing.hasCustomer && (
              <button type="button" className="btn" disabled={busy !== null || !online} onClick={() => void go('portal', () => client.billingPortal())}>{busy === 'portal' ? 'Opening…' : 'Manage billing'}</button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
