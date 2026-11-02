import { useEffect } from 'react';
import { qaLinkAllowed, qaLinkTarget } from '../lib/qaPersonas.js';
import { useAppStore } from '../store/useAppStore.js';
import { hasHeldQaLink, takeQaLink } from '../sync/qaLink.js';
import { loadPersonas } from '../sync/qaPersonas.js';
import { useQa } from '../sync/qaState.js';

// Opens the QA picker with one account marked when the page was opened from /?qa=<id> (brief qa-scenarios). Draws nothing. It waits until /api/me says
// this person may use the picker, tries once (an unknown id, a failed list: nothing opens, no message) and never switches.
export default function QaDeepLink() {
  const qa = useQa();
  const allowed = qaLinkAllowed(qa);
  useEffect(() => {
    if (!allowed || !hasHeldQaLink()) return;
    const id = takeQaLink();
    void loadPersonas().then(out => {
      const target = out ? qaLinkTarget(id, out.personas) : null;
      if (target) useAppStore.getState().openModal({ type: 'qapicker', highlight: target });
    });
  }, [allowed]);
  return null;
}
