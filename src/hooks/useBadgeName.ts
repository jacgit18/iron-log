import { useMemo } from 'react';
import { createAccountClient } from '../sync/account.js';
import { signIn as devHeaders } from '../sync/devUser.js';
import { useAppStore } from '../store/useAppStore.js';
import { useWho } from '../components/settings/useWho.js';

/**
 * `name` is what the badge shows, or null while there is no badge (sync off, signed out, could not check, or sign-in needed). `pending` is
 * true while syncing is on and the first who-am-I answer has not come: the header uses both to decide whether the Settings tab is drawn (with
 * a badge it is not), and assumes a badge while pending, so a signed-in person's tab bar does not change shape when the answer arrives.
 */
export default function useBadgeName(): { name: string | null; pending: boolean } {
  const syncing = useAppStore(s => s.sync !== null);
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const { who } = useWho(syncing, client);
  const authPaused = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'auth');
  if (!syncing) return { name: null, pending: false };
  if (who === null) return { name: null, pending: true };
  if (authPaused || who.status !== 'signed-in') return { name: null, pending: false };
  return { name: who.kind === 'dev' ? 'Development user' : who.name ?? who.email ?? 'your account', pending: false };
}
