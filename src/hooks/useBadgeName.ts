import { useMemo } from 'react';
import { createAccountClient } from '../sync/account.js';
import { signIn as devHeaders } from '../sync/devUser.js';
import { useAppStore } from '../store/useAppStore.js';
import { useWho } from '../components/settings/useWho.js';

/** The name the badge shows, or null while there is no badge (sync off, signed out, could not check, or sign-in needed). The header uses it too: with a badge, the Settings tab is not drawn. */
export default function useBadgeName(): string | null {
  const syncing = useAppStore(s => s.sync !== null);
  const client = useMemo(() => createAccountClient({ headers: devHeaders }), []);
  const { who } = useWho(syncing, client);
  const authPaused = useAppStore(s => s.sync?.state === 'paused' && s.sync.pausedBecause === 'auth');
  if (!syncing || authPaused || who?.status !== 'signed-in') return null;
  return who.kind === 'dev' ? 'Development user' : who.name ?? who.email ?? 'your account';
}
