import { useMemo, useState } from 'react';
import './PlansTab.css';
import { PLAN_CARDS } from '../../lib/plansTab.js';
import { createAccountClient } from '../../sync/account.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import { useOnline } from '../../hooks/useOnline.js';
import { flag } from '../../store/useAppStore.js';

// The Plans tab (brief desktop-plans-tab): the three plans side by side for a signed-in free account on a wide screen. App.tsx draws the tab
// only then (src/lib/plansTab.ts); it reaches the same Stripe Checkout the Billing panel in Settings does (client.billingCheckout), so the
// server sets the plan from Stripe's events, never from this page. Pro is shown so people know, with nothing to press.
export default function PlansTab() {
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const online = useOnline();
  const [busy, setBusy] = useState<'month' | 'year' | null>(null);

  const subscribe = async (interval: 'month' | 'year') => {
    setBusy(interval);
    const out = await client.billingCheckout(interval);
    if (out.ok) { window.location.assign(out.url); return; }
    setBusy(null);
    flag('Billing is unavailable, try again');
  };

  return (
    <section className="panel planstab" aria-labelledby="plans-h">
      <h2 id="plans-h">Plans</h2>
      <p>Free stays free: your data, export and delete never depend on a plan. Plus is optional, renews until you cancel, and can be cancelled any time.</p>
      <ul className="plancards">
        {PLAN_CARDS.map(p => (
          <li key={p.name} className={`plancard${p.name === 'Free' ? ' current' : p.name === 'Plus' ? ' offer' : ''}`}>
            <h3>{p.name}{p.name === 'Free' && <span className="planbadge">Your plan</span>}</h3>
            <p className="planprice">{p.price}</p>
            <ul>{p.lines.map(l => <li key={l}>{l}</li>)}</ul>
            {p.name === 'Plus' && (
              <div className="actions">
                <button type="button" className="btn" disabled={busy !== null || !online} onClick={() => void subscribe('month')}>{busy === 'month' ? 'Opening…' : 'Plus, $5.99 a month'}</button>
                <button type="button" className="btn" disabled={busy !== null || !online} onClick={() => void subscribe('year')}>{busy === 'year' ? 'Opening…' : 'Plus, $49.99 a year'}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!online && <p className="note" role="status">You are offline. Subscribing needs a connection.</p>}
    </section>
  );
}
