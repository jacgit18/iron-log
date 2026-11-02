import type { Cfg } from '../types.ts';
import { exInfo } from './data.js';
import { liftGoalsOf } from './liftGoal.js';
import { nameCmp } from './sort.js';

/* The Weight goals panel on Progress: every exercise that has a weight goal, logged or not, A to Z by name. */
export const goalExercises = (cfg: Cfg): { id: string; name: string }[] =>
  Object.keys(cfg.liftGoals || {}).filter(id => liftGoalsOf(cfg, id).length)
    .map(id => ({ id, name: exInfo(cfg, id).n })).sort(nameCmp(r => r.name, r => r.id));
