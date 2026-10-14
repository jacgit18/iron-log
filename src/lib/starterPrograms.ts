/* ---------- Starter programs (ADR 041) ----------
   A new account can start from one of a few common plans instead of an empty board. A starter is sessions (Push, Pull, Legs ...) and
   the days per week it can run on; the sessions repeat in order across Day 1, 2, 3 ... so "Full body, 3 days a week" is A, B, A.
   There are no weights: each card shows sets and reps and the weight is typed at the first session. The exercises are written into the
   account's own library as ordinary custom exercises (or an existing exercise of the same name is used), so they work offline and the
   person can edit or delete them like any other. Pure: the store applies the result (applyStarter in editorSlice). */
import type { EquipmentId, ExerciseInfo, MuscleKey, MuscleTags, PhaseKey, Program, ProgramCfg, ProgramItem } from '../types.ts';
import { findExId, newExId } from './data.js';

interface Move { n: string; eq: EquipmentId; p: MuscleKey[]; s?: MuscleKey[] }
interface Lift { move: Move; rx: string; ph: PhaseKey }
interface Session { title: string; lifts: Lift[] }
export interface Starter {
  id: string;
  name: string;
  blurb: string;
  sessions: Session[];
  /** Days per week it can run on; the first is the default. */
  perWeek: number[];
}

const M = {
  bench: { n: 'Bench press', eq: 'barbell', p: ['chest'], s: ['triceps', 'frontdelt'] },
  incline: { n: 'Incline dumbbell press', eq: 'dumbbell', p: ['chest'], s: ['frontdelt', 'triceps'] },
  ohp: { n: 'Overhead press', eq: 'barbell', p: ['frontdelt'], s: ['triceps', 'sidedelt'] },
  lateral: { n: 'Lateral raise', eq: 'dumbbell', p: ['sidedelt'] },
  pushdown: { n: 'Triceps pushdown', eq: 'cable', p: ['triceps'] },
  row: { n: 'Barbell row', eq: 'barbell', p: ['upperback', 'lats'], s: ['biceps', 'lowerback'] },
  pulldown: { n: 'Lat pulldown', eq: 'cable', p: ['lats'], s: ['biceps'] },
  cablerow: { n: 'Seated cable row', eq: 'cable', p: ['upperback'], s: ['lats', 'biceps'] },
  facepull: { n: 'Face pull', eq: 'cable', p: ['reardelt'], s: ['upperback'] },
  curl: { n: 'Dumbbell curl', eq: 'dumbbell', p: ['biceps'] },
  squat: { n: 'Squat', eq: 'barbell', p: ['quads', 'glutes'], s: ['hamstrings', 'lowerback'] },
  rdl: { n: 'Romanian deadlift', eq: 'barbell', p: ['hamstrings', 'glutes'], s: ['lowerback'] },
  deadlift: { n: 'Deadlift', eq: 'barbell', p: ['hamstrings', 'glutes', 'lowerback'], s: ['upperback', 'quads'] },
  legpress: { n: 'Leg press', eq: 'machine', p: ['quads', 'glutes'] },
  legcurl: { n: 'Leg curl', eq: 'machine', p: ['hamstrings'] },
  calf: { n: 'Calf raise', eq: 'machine', p: ['calves'] },
  lunge: { n: 'Dumbbell lunge', eq: 'dumbbell', p: ['quads', 'glutes'] },
  plank: { n: 'Plank', eq: 'bodyweight', p: ['deepcore'], s: ['upperabs'] },
} satisfies Record<string, Move>;

const L = (move: Move, rx: string, ph: PhaseKey = 'strength'): Lift => ({ move, rx, ph });

export const STARTERS: Starter[] = [
  {
    id: 'ppl', name: 'Push / Pull / Legs', blurb: 'Pressing, pulling and legs on separate days.', perWeek: [3, 6],
    sessions: [
      { title: 'Push', lifts: [L(M.bench, '3 × 8'), L(M.ohp, '3 × 8'), L(M.incline, '3 × 10', 'hyp'), L(M.lateral, '3 × 12', 'hyp'), L(M.pushdown, '3 × 12', 'hyp')] },
      { title: 'Pull', lifts: [L(M.row, '3 × 8'), L(M.pulldown, '3 × 10'), L(M.cablerow, '3 × 10', 'hyp'), L(M.facepull, '3 × 15', 'hyp'), L(M.curl, '3 × 12', 'hyp')] },
      { title: 'Legs', lifts: [L(M.squat, '3 × 8'), L(M.rdl, '3 × 8'), L(M.legpress, '3 × 12', 'hyp'), L(M.legcurl, '3 × 12', 'hyp'), L(M.calf, '4 × 12', 'hyp')] },
    ],
  },
  {
    id: 'upperlower', name: 'Upper / Lower', blurb: 'Upper body one day, lower body the next.', perWeek: [4, 2],
    sessions: [
      { title: 'Upper', lifts: [L(M.bench, '3 × 8'), L(M.row, '3 × 8'), L(M.ohp, '3 × 10'), L(M.pulldown, '3 × 10'), L(M.curl, '2 × 12', 'hyp'), L(M.pushdown, '2 × 12', 'hyp')] },
      { title: 'Lower', lifts: [L(M.squat, '3 × 8'), L(M.rdl, '3 × 8'), L(M.legpress, '3 × 12', 'hyp'), L(M.legcurl, '3 × 12', 'hyp'), L(M.calf, '4 × 12', 'hyp')] },
    ],
  },
  {
    id: 'fullbody', name: 'Full body', blurb: 'The whole body each session, two sessions that alternate.', perWeek: [3, 2, 4],
    sessions: [
      { title: 'Full body A', lifts: [L(M.squat, '3 × 8'), L(M.bench, '3 × 8'), L(M.row, '3 × 8'), L(M.plank, '3 × 30 s', 'iso')] },
      { title: 'Full body B', lifts: [L(M.rdl, '3 × 8'), L(M.ohp, '3 × 8'), L(M.pulldown, '3 × 10'), L(M.lunge, '3 × 10', 'hyp')] },
    ],
  },
  {
    id: 'fivebyfive', name: '5 × 5', blurb: 'Heavy sets of five on a few big lifts, two sessions that alternate.', perWeek: [3],
    sessions: [
      { title: 'Workout A', lifts: [L(M.squat, '5 × 5'), L(M.bench, '5 × 5'), L(M.row, '5 × 5')] },
      { title: 'Workout B', lifts: [L(M.squat, '5 × 5'), L(M.ohp, '5 × 5'), L(M.deadlift, '1 × 5')] },
    ],
  },
];

export const starterById = (id: string) => STARTERS.find(s => s.id === id);

export interface StarterBuild {
  program: Program;
  /** Exercises to add to cfg.ex and cfg.muscleMap; empty for one the account already has under that name. */
  newEx: Record<string, ExerciseInfo>;
  newTags: Record<string, MuscleTags>;
}

/** The program for `starter` on `perWeek` days (7 days, the rest empty) with slot ids under `key`, and the exercises it needs.
 *  `from` is the Sunday it starts (a card's `from`, ADR 020). Null when `perWeek` is not one the starter offers. */
export function buildStarter(starter: Starter, perWeek: number, cfg: ProgramCfg, key: 'A' | 'B', from: string): StarterBuild | null {
  if (!starter.perWeek.includes(perWeek)) return null;
  const newEx: Record<string, ExerciseInfo> = {}; const newTags: Record<string, MuscleTags> = {};
  const idOf = new Map<string, string>();
  const exFor = (m: Move) => {
    const had = idOf.get(m.n); if (had) return had;
    let id = findExId(cfg, m.n);
    if (!id) { id = newExId(cfg, m.n, newEx); newEx[id] = { n: m.n, eq: m.eq }; newTags[id] = { p: [...m.p], ...(m.s ? { s: [...m.s] } : {}) }; }
    idOf.set(m.n, id);
    return id;
  };
  const days: Program['days'] = [];
  for (let d = 0; d < 7; d++) {
    const session = d < perWeek ? starter.sessions[d % starter.sessions.length]! : null;
    days.push({
      title: `Day ${d + 1}`,
      slots: session ? session.lifts.map((lift, i) => ({ id: `${key}-d${d + 1}s${i + 1}`, sec: session.title, from, items: [{ ex: exFor(lift.move), ph: lift.ph, w: null, rx: lift.rx } satisfies ProgramItem] })) : [],
    });
  }
  return { program: { key, days, sledAdded: true, sledTop: true }, newEx, newTags };
}
