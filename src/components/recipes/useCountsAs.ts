import { useState } from 'react';
import { countsToSave } from '../../lib/plate.js';
import type { PlateMark } from '../../types.ts';

/** The "Counts as on a plate" choice of a recipe form (brief week-board): automatic until a chip is pressed, then the person's own set until "Back to automatic". */
export function useCountsAs(saved: PlateMark[] | undefined) {
  const [counts, setCounts] = useState<PlateMark[]>(saved ?? []);
  const [picked, setPicked] = useState(!!saved);
  return {
    picked,
    /** What the chips show: the person's set, else the automatic marks. */
    shown: (auto: readonly PlateMark[]): readonly PlateMark[] => (picked ? counts : auto),
    pick: (next: PlateMark[]) => { setCounts(next); setPicked(true); },
    reset: () => { setCounts([]); setPicked(false); },
    /** The `counts` to write with the recipe, or nothing while automatic. */
    toSave: countsToSave(picked, counts),
  };
}
