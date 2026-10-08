import { useState } from 'react';
import boardLight from '../assets/landing/board.png';
import boardDark from '../assets/landing/board-dark.png';
import { setDevUser } from '../sync/devUser.js';
import { useGoogleSignIn } from '../sync/useGoogleSignIn.js';
import LegalLinks from './LegalLinks.js';

// What someone sees before they have an account here (src/lib/gate.ts decides): what the app is, and the way in. It replaces the app
// entirely; nothing of the app is mounted behind it. Plain words, no tracking, and a clear note that signing in creates the account.
export default function Landing({ offline = false }: { offline?: boolean }) {
  const [problem, setProblem] = useState('');
  const { busy, start } = useGoogleSignIn(setProblem);
  return (
    <main className="landing" aria-labelledby="landing-h">
      <header className="landing-head">
        <img src="/logo.svg" alt="" width="40" height="40" />
        <span className="landing-brand">Iron Log</span>
      </header>

      <section className="landing-hero">
        <h1 id="landing-h">A weekly training board that remembers your lifts.</h1>
        <p className="landing-lead">Plan the week on one board, log your sets in seconds, and watch the weights climb. It works offline, so it is there in the gym, and it syncs across your devices once you sign in.</p>
        {offline && <p className="notice" role="status"><b>You are offline.</b> Connect to the internet to sign in for the first time.</p>}
        <div className="landing-cta">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>{busy ? 'Opening Google…' : 'Sign in with Google'}</button>
        </div>
        {problem && <p className="notice" role="alert"><b>{problem}</b></p>}
        {/* Development builds only (the production build does not contain this): skip the landing page as the fake dev user. */}
        {import.meta.env.DEV && (
          <p className="landing-dev">
            <button type="button" className="btn" onClick={() => { setDevUser('dev'); window.location.reload(); }}>Skip: continue as the development user</button>
            <span className="note"> Development builds only. Needs the API running; the real sign-in is the button above.</span>
          </p>
        )}
        <p className="landing-fine"><LegalLinks /> Free during the beta. For people aged 16 and over.</p>
      </section>

      <section className="landing-shot" aria-label="A look at the board">
        <picture>
          <source srcSet={boardDark} media="(prefers-color-scheme: dark)" />
          <img src={boardLight} alt="The weekly board: a column for each day with exercise cards, targets and check-offs" width="1100" loading="lazy" />
        </picture>
      </section>

      <section aria-labelledby="landing-what">
        <h2 id="landing-what">What it does</h2>
        <ul className="landing-list">
          <li><b>A weekly board.</b> One column per day, with A and B programs that rotate for you.</li>
          <li><b>Targets for every lift.</b> Weights and reps that follow your training phase and your last session.</li>
          <li><b>Timers built in.</b> Rest between sets and countdowns for holds.</li>
          <li><b>Progress you can see.</b> Lift history, body weight and a muscle map of what you have trained.</li>
          <li><b>Yours to keep.</b> Export everything, or delete your data and your account, any time.</li>
        </ul>
      </section>

      <footer className="landing-foot">
        <p>Iron Log is a record-keeping tool, not medical advice. It uses no advertising and no tracking, and it never sells your data.</p>
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
