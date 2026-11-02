import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AccountState } from '../../sync/account.js';

// Who is signed in, for the Account and Delete my data panels. Checked when the panel opens; a check that could not reach the server
// (offline at the time) is made again when the connection or the app comes back, and `recheck` does it on a tap. Before, one failed
// check left "Could not check who is signed in" (and Delete my data hidden) until Settings was opened again.
export function useWho(enabled: boolean, account: { me(): Promise<AccountState> }) {
  const [who, setWho] = useState<AccountState | null>(null);
  const [tries, setTries] = useState(0);
  const recheck = useCallback(() => setTries(n => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void account.me().then(s => { if (current) setWho(s); });
    return () => { current = false; };
  }, [enabled, account, tries]);
  const unreachable = who?.status === 'unreachable';
  useEffect(() => {
    if (!unreachable) return;
    // Coming back to the app fires focus and visibilitychange together: one look, not two.
    let last = 0;
    const again = () => { if (document.visibilityState === 'hidden' || Date.now() - last < 1000) return; last = Date.now(); recheck(); };
    window.addEventListener('online', again);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('online', again); window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [unreachable, recheck]);
  return { who, recheck };
}

/** App's one answer, shared down the tree, so Settings does not ask /api/me again for every panel that needs to know who is signed in. */
export const WhoContext = createContext<{ who: AccountState | null; recheck: () => void } | null>(null);

/** The shared answer when App provides one; otherwise this component's own check (a panel drawn outside App's tree). */
export function useSharedWho(enabled: boolean, account: { me(): Promise<AccountState> }) {
  const shared = useContext(WhoContext);
  const own = useWho(enabled && !shared, account);
  return shared ?? own;
}
