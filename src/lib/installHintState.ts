import { useAppStore } from '../store/useAppStore.js';
import type { AppState } from '../store/types.js';
import { usePwa, isIOS } from './pwa.js';
import { showInstallHint, installHintDismissed } from './installHint.js';

// What the floating tips (the install hint, the Program tab's "plan on a computer" card) wait for, in one place so they agree.

/** With sync on, wait until the data has loaded and nobody needs to sign in or pick an account: until then the cards for those are
 *  what the person should see (the iPhone path has no browser event to wait for, so it would show at once). */
export const waitingForSignIn = (st: Pick<AppState, 'sync' | 'isReady'>): boolean =>
  st.sync !== null && (!st.isReady() || (st.sync.state === 'paused' && (st.sync.pausedBecause === 'auth' || st.sync.pausedBecause === 'account')));

export const useWaitingForSignIn = (): boolean => useAppStore(waitingForSignIn);

/** Whether the install hint is on screen now, so another floating tip does not sit on top of it. */
export function useInstallHintShowing(): boolean {
  const { installEvent, installed } = usePwa();
  const signedOut = useWaitingForSignIn();
  return showInstallHint({ installed, canPrompt: !!installEvent, ios: isIOS(), signedOut, dismissed: installHintDismissed() });
}
