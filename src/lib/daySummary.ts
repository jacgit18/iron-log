// The Program editor's "Day at a glance" panel (wide desktop): what one day of a program holds, worked out from its cards.
// Sets and muscles are counted the way the muscle map counts them (`muscleVolume`): the card's default phase, its "4 × 6" prescription (3 when it has none), half for an either/or card, primary muscles only.
import type { Cfg, EquipmentId, MuscleKey, PhaseKey, ProgramDay } from '../types.ts';
import { exInfo } from './data.js';
import { eqName } from './equipment.js';
import { exerciseCount } from './exerciseCount.js';
import { defaultPhase, rxOf } from './logic.js';
import { MUSCLES, tagsOf } from './muscles.js';

export const SUMMARY_MUSCLES = 5; // muscles listed before "and N more"

export interface DaySummary {
  exercises: number;
  sets: number;
  phases: { key: PhaseKey; count: number }[];
  muscles: { key: MuscleKey; name: string; sets: number }[];
  moreMuscles: number;
  equipment: { id: EquipmentId; name: string; count: number }[];
}

const PHASE_ORDER: PhaseKey[] = ['strength', 'hyp', 'iso', 'exp', 'mob'];

export function daySummary(cfg: Cfg, day: ProgramDay): DaySummary {
  const phases = new Map<PhaseKey, number>(); const muscles = new Map<MuscleKey, number>(); const equip = new Map<EquipmentId, number>();
  let sets = 0;
  for (const sl of day.slots) {
    sl.items.forEach((it, idx) => {
      const ph = defaultPhase(cfg, sl, idx);
      const m = rxOf(cfg, it, ph).match(/(\d+)\s*×/); const n = (m ? Number(m[1]) : 3) * (sl.type === 'either' ? 0.5 : 1);
      sets += n;
      if (ph) phases.set(ph, (phases.get(ph) ?? 0) + 1);
      const eq = exInfo(cfg, it.ex).eq; if (eq && eqName(cfg, eq)) equip.set(eq, (equip.get(eq) ?? 0) + 1);
      const tg = tagsOf(cfg, it.ex); if (!tg || tg.mob) return;
      (tg.p || []).forEach(mu => { if (MUSCLES[mu]) muscles.set(mu, (muscles.get(mu) ?? 0) + n); });
    });
  }
  const ranked = [...muscles].map(([key, s]) => ({ key, name: MUSCLES[key].n, sets: s })).sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
  return {
    exercises: exerciseCount(day.slots),
    sets: Math.round(sets),
    phases: PHASE_ORDER.filter(k => phases.has(k)).map(key => ({ key, count: phases.get(key)! })),
    muscles: ranked.slice(0, SUMMARY_MUSCLES),
    moreMuscles: Math.max(0, ranked.length - SUMMARY_MUSCLES),
    equipment: [...equip].map(([id, count]) => ({ id, name: eqName(cfg, id), count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}
