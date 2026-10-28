import { useEffect } from 'react';
import './Landing.css'; // the plan cards share the landing page's look
import './Plans.css';
import { appTitle } from '../lib/envName.js';

// The public Plans page (/plans, src/lib/plansPage.ts): shown to anyone, with or without an account, and never inside the Android app
// (main.tsx sends that to the landing page: the Play build shows no prices, ADR 065 point 8 and ADR 078). Plain text, nothing to buy here: paying happens
// after signing in.
// The plans as shown to visitors. Plus is users.plan 'paid' (the stored value keeps its name; the shown name is Plus). Pro is the planned higher tier with AI: shown so people know, not for sale, no stored value yet.
// The amounts must match the two Stripe prices (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY); Stripe, not this text, is what is charged.
const PLANS = [
  { name: 'Beta', price: 'Free during the beta', limits: 'Everything below, no caps', features: 'All of Free and Plus while the beta lasts' },
  { name: 'Free', price: '$0', limits: '7 daily backups kept in your browser', features: 'The weekly board, logging, programs, progress, timers, sync across devices, export and delete' },
  { name: 'Plus', price: '$5.99 a month, or $49.99 a year', limits: '30 daily backups kept on your account', features: 'Everything in Free, plus automatic off-device backups you can restore from' },
  { name: 'Pro', price: 'Coming later, not priced yet', limits: 'A monthly AI allowance, to be set', features: 'Everything in Plus, plus AI features. Not available yet: a beta test comes first, to see how much people want it' },
];

export default function Plans() {
  useEffect(() => { document.title = `Plans · ${appTitle(window.location.hostname)}`; }, []);
  return (
    <main className="landing" aria-labelledby="plans-h">
      <header className="landing-head">
        <img src="/logo.svg" alt="" width="40" height="40" />
        <span className="landing-brand">Loadbearer</span>
      </header>

      <section>
        <p className="landing-fine"><a href="/">Back to Loadbearer</a></p>
        <h1 id="plans-h" className="plans-title">Plans</h1>
        <p className="landing-fine">Free stays free: your data, export and delete never depend on a plan. Plus is optional, renews until you cancel, and can be cancelled any time.</p>
        <ul className="landing-plans">
          {PLANS.map(p => (
            <li key={p.name} className={`landing-plan${p.name === 'Beta' ? ' now' : ''}`}>
              <h3>{p.name}{p.name === 'Beta' && <span className="landing-now">Now</span>}</h3>
              <dl>
                <dt>Price</dt><dd>{p.price}</dd>
                <dt>Limits</dt><dd>{p.limits}</dd>
                <dt>Features</dt><dd>{p.features}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <footer className="landing-foot">
        <p>Loadbearer is a record-keeping tool, not medical advice. It uses no advertising and no tracking, and it never sells your data.</p>
      </footer>
    </main>
  );
}
