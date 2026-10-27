import { useEffect } from 'react';
import './Landing.css'; // the plan cards share the landing page's look

// The public Plans page (/plans, src/lib/plansPage.ts): shown to anyone, with or without an account, and never inside the Android app
// (main.tsx sends that to the landing page: the Play build shows no prices, ADR 065). Plain text, nothing to buy here: paying happens
// after signing in.
// Placeholders until the tiers are decided; they match users.plan (beta, free, paid).
const PLANS = [
  { name: 'Beta', price: 'Free during the beta', limits: 'TBD', features: 'TBD' },
  { name: 'Free', price: 'TBD', limits: 'TBD', features: 'TBD' },
  { name: 'Paid', price: 'TBD', limits: 'TBD', features: 'TBD' },
];

export default function Plans() {
  useEffect(() => { document.title = 'Plans · Loadbearer'; }, []);
  return (
    <main className="landing" aria-labelledby="plans-h">
      <header className="landing-head">
        <img src="/logo.svg" alt="" width="40" height="40" />
        <span className="landing-brand">Loadbearer</span>
      </header>

      <section>
        <p className="landing-fine"><a href="/">Back to Loadbearer</a></p>
        <h2 id="plans-h">Plans</h2>
        <p className="landing-fine">Nothing is decided yet beyond the beta, which is free. Everything marked TBD will be set before the beta ends.</p>
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
