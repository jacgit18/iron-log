import { normWeek } from '../shared/week.js';
import type { Week } from '../types.ts';

/* ---------- Merge rules for a conflict ----------
   Only what ADR 003 and backend-data-rules.md section 4 call for. Everything else in a stale conflict is "this device
   wins": the phone's version is sent again on top of the server's row, and the version it replaced stays in row_history. */

/** A card ticked on the other side beats this device's skip: the workout was done. Returns `ours` itself when nothing changes. */
export function tickedBeatsSkipped(ours: unknown, theirs: Week): Week {
  const week = normWeek(ours);
  let changed = false;
  for (const id of Object.keys(theirs.done)) {
    if (!week.skipped[id]) continue;
    delete week.skipped[id];
    week.done[id] = true;
    changed = true;
  }
  return changed ? week : (ours as Week);
}
