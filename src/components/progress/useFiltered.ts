import type { MuscleKey } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { trainsMuscle } from '../../lib/muscleFilter.js';

// The ids that train the muscle picked on the map (all of them when none is picked).
export function useFiltered(ids: string[]) {
  const cfg = useAppStore(s => s.cfg); const sel = useAppStore(s => s.bodySel) as MuscleKey | null; const withSec = useAppStore(s => s.bodySec);
  return ids.filter(id => trainsMuscle(cfg, id, sel, withSec));
}
