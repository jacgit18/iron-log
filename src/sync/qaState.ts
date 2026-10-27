import { useSyncExternalStore } from 'react';
import type { QaInfo } from './account.js';

// What /api/me last said about QA test accounts (brief qa-persona-picker): set by every /api/me answer, so the banner and the Settings panel
// cost no request of their own. Undefined everywhere but a QA service, and when signed out.
let qa: QaInfo | undefined;
const listeners = new Set<() => void>();

export function setQa(next: QaInfo | undefined) {
  if (next?.persona === qa?.persona && next?.canSwitch === qa?.canSwitch && !next === !qa) return;
  qa = next;
  listeners.forEach(l => l());
}

export const getQa = (): QaInfo | undefined => qa;
export const useQa = (): QaInfo | undefined => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getQa, () => undefined);
