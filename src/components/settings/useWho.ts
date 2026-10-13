import { useCallback, useEffect, useState } from 'react';
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
    const again = () => { if (document.visibilityState !== 'hidden') recheck(); };
    window.addEventListener('online', again);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => { window.removeEventListener('online', again); window.removeEventListener('focus', again); document.removeEventListener('visibilitychange', again); };
  }, [unreachable, recheck]);
  return { who, recheck };
}
