import type { StoreApi } from 'zustand';
import type { AppState } from './types.ts';

const FIRST_MS = 10_000; // once the app has loaded, so every day that the app is opened gets its copy
const CHANGE_MS = 30_000; // after the last change, so typing is not copied key by key

// The data the app saves; a change to any of these (by reference) is a change worth copying.
const dataOf = (s: AppState) => [s.cfg, s.logs, s.programs, s.library, s.body, s.experiments, s.stretches, s.stretchExps, s.supp, s.grocery, s.groceryMonths, s.week, s.strWeek];

/** Copies the data to the automatic backup after the app has loaded and again a little after each change. Returns the way to stop. */
export function startAutoBackup(store: Pick<StoreApi<AppState>, 'getState' | 'subscribe'>): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null; let last: unknown[] | null = null;
  const run = () => { timer = null; void store.getState().backupNow(); };
  const schedule = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(run, ms); };
  const unsub = store.subscribe(s => {
    if (!s.isReady()) return;
    const cur = dataOf(s);
    if (!last) { last = cur; schedule(FIRST_MS); void s.refreshBackups(); return; }
    if (cur.some((v, i) => v !== last![i])) { last = cur; schedule(CHANGE_MS); }
  });
  // Leaving the page with a copy pending: do it now.
  const onHide = () => { if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); run(); } };
  document.addEventListener('visibilitychange', onHide);
  return () => { unsub(); document.removeEventListener('visibilitychange', onHide); if (timer) clearTimeout(timer); };
}
