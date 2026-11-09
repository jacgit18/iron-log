import { useState } from 'react';
import { TERMS_TICK_KEY } from '../lib/termsGate.js';

/** The "I agree" box on a sign-in surface. Never pre-ticked (a reload starts unticked). A tick is also written to sessionStorage with its time so the
 *  Google redirect or the email-code reload, which leave the page, can post the acceptance once the session exists (TermsGate); unticking removes it. */
export function useTermsTick() {
  const [ticked, setTicked] = useState(false);
  const set = (next: boolean) => {
    setTicked(next);
    try { if (next) sessionStorage.setItem(TERMS_TICK_KEY, String(Date.now())); else sessionStorage.removeItem(TERMS_TICK_KEY); } catch { /* private mode: the accept screen shows instead */ }
  };
  return { ticked, set };
}
