import './Landing.css'; // the splash shares the landing page's base rules; Landing itself loads on demand (main.tsx)

// Shown for the moment a new visitor is being checked, so the page is never blank.
export function Splash() {
  return (
    <main className="landing landing-splash" aria-busy="true">
      <img src="/logo.svg" alt="" width="48" height="48" />
      <p role="status">Loading…</p>
    </main>
  );
}
