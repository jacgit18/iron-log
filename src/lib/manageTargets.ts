import type { BodyEntry, BodyGoal } from '../types.ts';
import { fmtShort, parseDate } from '../shared/dates.js';
import { bwSorted, fmtLb, goalStatus } from './body.js';

// What the Manage sheet needs from the body data (brief targets-into-manage): the inputs the calorie and protein recommendation reads, and the read-only goal line.
// The goal is edited in Progress, so Manage only shows it.
export interface RecommendInputs { latest: number | null; goalLb: number | null; weeksLeft: number | null }

export function recommendInputs(goal: BodyGoal | null | undefined, body: BodyEntry[], today: Date): RecommendInputs {
  const weights = bwSorted(body);
  const latest = weights.length ? Number(weights[weights.length - 1]!.w) : null;
  const goalLb = goal ? Number(goal.w) : null;
  const g = goalStatus(goal, body, today);
  const weeksLeft = g && 'weeksLeft' in g && typeof g.weeksLeft === 'number' ? g.weeksLeft : null; // weeks to the goal date, when one is set
  return { latest, goalLb, weeksLeft };
}

export function goalLine(goal: BodyGoal | null | undefined): string {
  if (!goal || !(Number(goal.w) > 0)) return 'No goal set';
  return goal.by ? `Goal: ${fmtLb(goal.w)} lb by ${fmtShort(parseDate(goal.by))}` : `Goal: ${fmtLb(goal.w)} lb`;
}
