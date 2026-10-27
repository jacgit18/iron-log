import { useState } from 'react';
import boardLight from '../assets/landing/board.webp';
import boardDark from '../assets/landing/board-dark.webp';
import { setDevUser } from '../sync/devUser.js';
import { useGoogleSignIn } from '../sync/useGoogleSignIn.js';
import { takeAfterReload } from '../lib/afterReload.js';
import './Landing.css'; // before EmailCodeSignIn, whose .emailsignin .btn rules must still win over .landing-cta .btn
import EmailCodeSignIn from './EmailCodeSignIn.js';
import LegalLinks from './LegalLinks.js';

// What someone sees before they have an account here (src/lib/gate.ts decides): what the app is, and the way in. It replaces the app
// entirely; nothing of the app is mounted behind it. Plain words, no tracking, and a clear note that signing in creates the account.
// The plans as shown to visitors. Plus is users.plan 'paid' (the stored value keeps its name; the shown name is Plus, so a higher tier can sit above it later).
// The amounts must match the two Stripe prices (STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY); Stripe, not this text, is what is charged.
const PLANS = [
  { name: 'Beta', price: 'Free during the beta', limits: 'Everything below, no caps', features: 'All of Free and Plus while the beta lasts' },
  { name: 'Free', price: '$0', limits: '7 daily backups kept in your browser', features: 'The weekly board, logging, programs, progress, timers, sync across devices, export and delete' },
  { name: 'Plus', price: '$5.99 a month, or $49.99 a year', limits: '30 daily backups kept on your account', features: 'Everything in Free, plus automatic off-device backups you can restore from' },
];

const FEATURES = [
  { title: 'A weekly board.', text: 'One column per day, with A and B programs that rotate for you.' },
  { title: 'Targets for every lift.', text: 'Weights and reps that follow your training phase and your last session.' },
  { title: 'Timers built in.', text: 'Rest between sets and countdowns for holds.' },
  { title: 'Progress you can see.', text: 'Lift history, body weight and a muscle map of what you have trained.' },
  { title: 'Yours to keep.', text: 'Export everything, or delete your data and your account, any time.' },
];

export default function Landing({ offline = false }: { offline?: boolean }) {
  const [problem, setProblem] = useState('');
  const [done] = useState(takeAfterReload); // "Your account was deleted.": the reload after deleting lands here
  const { client, busy, start } = useGoogleSignIn(setProblem);
  return (
    <main className="landing" aria-labelledby="landing-h">
      <header className="landing-head">
        <img src="/logo.svg" alt="" width="40" height="40" />
        <span className="landing-brand">Loadbearer</span>
      </header>

      <section className="landing-hero">
        <h1 id="landing-h">A weekly training board that remembers your lifts.</h1>
        <p className="landing-lead">Plan the week on one board, log your sets in seconds, and watch the weights climb. It works offline, so it is there in the gym, and it syncs across your devices once you sign in.</p>
        {done && <p className="notice" role="status"><b>{done}</b></p>}
        {offline && <p className="notice" role="status"><b>You are offline.</b> Connect to the internet to sign in for the first time.</p>}
        <div className="landing-cta">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>{busy ? 'Opening Google…' : 'Sign in with Google'}</button>
          <EmailCodeSignIn client={client} />
        </div>
        {problem && <p className="notice" role="alert"><b>{problem}</b></p>}
        {/* Development builds only (the production build does not contain this): skip the landing page as the fake dev user. */}
        {import.meta.env.DEV && (
          <p className="landing-dev">
            <button type="button" className="btn" onClick={() => { setDevUser('dev'); window.location.reload(); }}>Skip: continue as the development user</button>
            <span className="note"> Development builds only, and the way in without Google here. Needs the API running; the real sign-in is the button above.</span>
          </p>
        )}
        <p className="landing-fine"><LegalLinks /> Free during the beta. For people aged 16 and over.</p>
      </section>

      <section className="landing-shot" aria-label="A look at the board">
        <picture>
          <source srcSet={boardDark} media="(prefers-color-scheme: dark)" />
          <img src={boardLight} alt="The weekly board: a column for each day with exercise cards, targets and check-offs" width="1100" height="688" loading="lazy" />
        </picture>
      </section>

      <section aria-labelledby="landing-what">
        <h2 id="landing-what">What it does</h2>
        <ul className="landing-list">
          {FEATURES.map(f => <li key={f.title}><b>{f.title}</b> {f.text}</li>)}
        </ul>
      </section>

      <section aria-labelledby="landing-plans">
        <h2 id="landing-plans">Plans</h2>
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

// Shown for the moment a new visitor is being checked, so the page is never blank.
export function Splash() {
  return (
    <main className="landing landing-splash" aria-busy="true">
      <img src="/logo.svg" alt="" width="48" height="48" />
      <p role="status">Loading…</p>
    </main>
  );
}
