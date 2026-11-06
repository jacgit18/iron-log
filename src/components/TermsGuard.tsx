import { lazy, Suspense, type ReactNode } from 'react';
import { mapChunkError } from '../lib/lazyTab.js';
import { useTermsOwed } from '../sync/termsState.js';

// Draws the accept screen instead of the app while the account owes an acceptance (brief terms-acceptance); otherwise the app. /api/me sets what is owed
// (sync/termsState.ts), so a signed-out visitor, an offline start and an answer that could not be read all show the app, as before. The accept screen is
// its own small chunk: almost nobody ever loads it.
const TermsGate = lazy(mapChunkError(() => import('./TermsGate.js')));

export default function TermsGuard({ children }: { children: ReactNode }) {
  const owed = useTermsOwed();
  if (!owed) return <>{children}</>;
  return <Suspense fallback={null}><TermsGate owed={owed} /></Suspense>;
}
