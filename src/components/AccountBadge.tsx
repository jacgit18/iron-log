import { useMemo } from 'react';
import { createAccountClient } from '../sync/account.js';
import { signIn as devHeaders } from '../sync/devUser.js';
import { useAppStore } from '../store/useAppStore.js';
import { useWho } from './settings/useWho.js';
import './AccountBadge.css';

// Who is signed in, at the right end of the header: a round initial with a green dot, and the name beside it where there is room. It
// opens Settings, where the Account panel has the sign-out. Shown only when syncing is on and the server says someone is signed in:
// "could not check" and "signed out" show nothing here (the sign-in card and the Account panel already say those), so the badge never
// claims an account that is not there. The state is a word for a screen reader and a dot for the eye, never the colour alone.
export default function AccountBadge() {
  const syncing = useAppStore(s => s.sync !== null);
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const { who } = useWho(syncing, client);
  if (!syncing || who?.status !== 'signed-in') return null;
  const name = who.kind === 'dev' ? 'Development user' : who.name ?? who.email ?? 'your account';
  const initial = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return (
    <button type="button" className="acctbadge" id="account-badge" aria-label={`Signed in as ${name}. Open account settings`} title={`Signed in as ${name}`}
      onClick={() => useAppStore.getState().setTab('settings')}>
      <span className="acctavatar" aria-hidden="true">{initial}<i className="acctdot" /></span>
      <span className="acctname" aria-hidden="true">{name}</span>
    </button>
  );
}
