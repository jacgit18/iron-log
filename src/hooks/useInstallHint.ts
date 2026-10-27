import { useAppStore } from '../store/useAppStore.js';
import type { AppState } from '../store/types.js';
import { usePwa, isIOS } from '../lib/pwa.js';
import { showInstallHint, installHintDismissed } from '../lib/installHint.js';

// With sync on, wait until the data has loaded and nobody needs to sign in or pick an account: until then the cards for those are
// what the person should see (the iPhone path has no browser event to wait for, so it would show at once). Other floating tips wait too.
const waitingForSignIn = (st: AppState) => st.sync !== null && (!st.isReady() || (st.sync.state === 'paused' && (st.sync.pausedBecause === 'auth' || st.sync.pausedBecause === 'account')));
export const useWaitingForSignIn = (): boolean => useAppStore(waitingForSignIn);

/** Whether the install hint is on screen now, so another floating tip does not sit on top of it. */
export function useInstallHintShowing(): boolean {
  const { installEvent, installed } = usePwa();
  const signedOut = useWaitingForSignIn();
  return showInstallHint({ installed, canPrompt: !!installEvent, ios: isIOS(), signedOut, dismissed: installHintDismissed() });
}
