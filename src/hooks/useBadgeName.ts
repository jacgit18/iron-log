import { useMemo } from 'react';
import { createAccountClient, type AccountState } from '../sync/account.js';
import { signIn as devHeaders } from '../sync/devUser.js';
import { useAppStore } from '../store/useAppStore.js';
import { useWho } from '../components/settings/useWho.js';

/**
 * `name` is what the badge shows, or null while there is no badge (sync off, signed out, could not check, or sign-in needed). `pending` is
 * true while syncing is on and the first who-am-I answer has not come: the header uses both to decide whether the Settings tab is drawn (with
 * a badge it is not), and assumes a badge while pending, so a signed-in person's tab bar does not change shape when the answer arrives.
 * `ask` is the same answer as one shared object (never hidden, with a `recheck`), for Settings' panels so they do not each call /api/me. `who` is the same answer (null until it comes, and while syncing is off), so the Plans tab needs no second /api/me call.
 */
export default function useBadgeName(): { name: string | null; pending: boolean; who: AccountState | null; ask: { who: AccountState | null; recheck: () => void } } {
  const syncing = useAppStore(s => s.sync !== null);
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const { who, recheck } = useWho(syncing, client);
  const ask = useMemo(() => ({ who, recheck }), [who, recheck]); // the raw answer, for the panels in Settings (WhoContext): unlike `who` below it is kept while auth is paused
  const authPaused = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'auth');
  if (!syncing) return { name: null, pending: false, who: null, ask };
  if (who === null) return { name: null, pending: true, who: null, ask };
  if (authPaused || who.status !== 'signed-in') return { name: null, pending: false, who: authPaused ? null : who, ask };
  return { name: who.kind === 'dev' ? 'Development user' : who.name ?? who.email ?? 'your account', pending: false, who, ask };
}
