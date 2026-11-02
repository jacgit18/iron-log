import type { Cfg, MuscleKey } from '../types.ts';
import { tagsOf } from './muscles.js';

// Does this exercise train the muscle? A secondary tag counts only when secondary work is counted.
export const trainsMuscle = (cfg: Cfg, exId: string, m: MuscleKey | null, withSecondary: boolean) => {
  if (!m) return true;
  const t = tagsOf(cfg, exId);
  return !!t && ((t.p || []).includes(m) || (withSecondary && (t.s || []).includes(m)));
};
