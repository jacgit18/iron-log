import { useEffect } from 'react';
import { goalMetNow, trackWater } from '../lib/waterReminder.js';
import { useAppStore } from '../store/useAppStore.js';

/** The drink-water reminder, when the app opens and when it comes back to the front (lib/waterReminder.ts). Does nothing until the water log and weight log are loaded. */
export function useWaterReminder(): void {
  const ready = useAppStore(s => s.ready.supp && s.ready.body);
  useEffect(() => {
    if (!ready) return;
    const check = () => { if (document.visibilityState === 'visible') { const s = useAppStore.getState(); trackWater('open', goalMetNow(s.supp, s.body)); } };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [ready]);
}
