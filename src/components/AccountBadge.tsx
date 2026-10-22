import { useAppStore } from '../store/useAppStore.js';
import './AccountBadge.css';

// Who is signed in, at the right end of the header: a round initial with a green dot, and the name beside it where there is room. It
// opens Settings, where the Account panel has the sign-out. Shown only when syncing is on and the server says someone is signed in:
// "could not check" and "signed out" show nothing here (the sign-in card and the Account panel already say those), so the badge never
// claims an account that is not there. The state is a word for a screen reader and a dot for the eye, never the colour alone.
// The initial is drawn by CSS from data-initial, so the button's visible text is the name alone and the accessible name contains it (axe label-content-name-mismatch).
export default function AccountBadge({ name }: { name: string | null }) {
  const tab = useAppStore(s => s.tab);
  if (name === null) return null;
  const initial = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return (
    <button type="button" className="acctbadge" id="account-badge" aria-label={`Signed in as ${name}. Open account settings`} title={`Signed in as ${name}`} aria-current={tab === 'settings' ? 'page' : undefined}
      onClick={() => useAppStore.getState().setTab('settings')}>
      <span className="acctavatar" aria-hidden="true" data-initial={initial}><i className="acctdot" /></span>
      <span className="acctname" aria-hidden="true">{name}</span>
    </button>
  );
}
