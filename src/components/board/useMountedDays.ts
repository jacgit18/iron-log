import { useEffect, useState } from 'react';
import { DAYS } from '../../lib/logic.js';
import { isDayMounted, nextDayToMount } from '../../lib/boardMount.js';

// One slice of idle time. Safari has no requestIdleCallback, so it falls back to a short timer; the timeout makes sure a busy page still gets there.
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') { const id = requestIdleCallback(run, { timeout: 1500 }); return () => cancelIdleCallback(id); }
  const id = setTimeout(run, 50);
  return () => clearTimeout(id);
}

/** Says whether a Board day should draw its cards (see lib/boardMount.ts). The selected day draws at once; on a phone the others follow
 *  one per idle slice, nearest first, so no single slice is a long task. A wide screen shows every column, so it draws all of them. */
export function useMountedDays(selected: number | null, wide: boolean): (day: number) => boolean {
  const [mounted, setMounted] = useState<ReadonlySet<number>>(() => new Set());

  // A day that has been the selected one stays drawn after the selection moves. Recorded while rendering, before anything is committed, so it costs no extra draw.
  if (selected !== null && !mounted.has(selected)) setMounted(new Set(mounted).add(selected));

  useEffect(() => {
    if (wide) return;
    const next = nextDayToMount(selected, mounted, DAYS.length);
    if (next === null) return;
    return whenIdle(() => setMounted(m => new Set(m).add(next)));
  }, [wide, selected, mounted]);

  return (day: number) => isDayMounted(day, selected, mounted, wide);
}
