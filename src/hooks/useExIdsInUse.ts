import { useMemo } from 'react';
import type { Cfg } from '../types.ts';
import { exIdsInUse } from '../lib/exerciseLibrary.js';
import { useAppStore } from '../store/useAppStore.js';

/** exIdsInUse for the current store, worked out again only when programs, versions, experiments, logs, the week or cfg change, not on
 *  every key typed in a sheet. */
export function useExIdsInUse(cfg: Cfg) {
  const programs = useAppStore(s => s.programs); const library = useAppStore(s => s.library);
  const experiments = useAppStore(s => s.experiments); const logs = useAppStore(s => s.logs); const week = useAppStore(s => s.week);
  return useMemo(() => exIdsInUse({ programs, library, experiments, logs, week }, cfg), [programs, library, experiments, logs, week, cfg]);
}
