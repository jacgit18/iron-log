/* ---------- Which Board days draw their cards ----------
   A phone shows one day at a time (the other columns are display:none), but the Board used to mount every card of all seven days on
   the first draw. That was the biggest block of main-thread work after the data arrived. Now the selected day draws at once and the
   others fill in one day per idle slice, nearest first. A day that has drawn stays drawn, so switching back costs nothing. A wide
   screen shows every column, so it draws all of them. Pure functions; the timing is in components/board/useMountedDays.ts. */

/** The next day to draw: the closest to the selected day that has not drawn yet (the earlier day wins a tie), or null when all have. */
export function nextDayToMount(selected: number | null, mounted: ReadonlySet<number>, total: number): number | null {
  const from = selected ?? 1;
  let best: number | null = null;
  for (let d = 1; d <= total; d++) {
    if (mounted.has(d)) continue;
    if (best === null || Math.abs(d - from) < Math.abs(best - from)) best = d;
  }
  return best;
}

/** Whether a day draws its cards now. The selected day always does, in the same draw that selects it. */
export function isDayMounted(day: number, selected: number | null, mounted: ReadonlySet<number>, wide: boolean): boolean {
  return wide || day === selected || mounted.has(day);
}
