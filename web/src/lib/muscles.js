/* ---------- Muscle map ---------- */
import { slotsFor } from './data.js';
import { phaseOf, rxOf } from './logic.js';

export const MUSCLES = {
  traps: { n: 'Traps' }, frontdelt: { n: 'Front delts' }, sidedelt: { n: 'Side delts' }, reardelt: { n: 'Rear delts' },
  chest: { n: 'Chest' }, biceps: { n: 'Biceps' }, triceps: { n: 'Triceps' }, forearms: { n: 'Forearms & grip' },
  abs: { n: 'Abs' }, obliques: { n: 'Obliques' }, lats: { n: 'Lats' }, upperback: { n: 'Upper back' }, lowerback: { n: 'Lower back' },
  glutes: { n: 'Glutes' }, abductors: { n: 'Outer hip (abductors)' }, adductors: { n: 'Inner thigh (adductors)' }, hipflexors: { n: 'Hip flexors' },
  quads: { n: 'Quads' }, hamstrings: { n: 'Hamstrings' }, calves: { n: 'Calves' }, shins: { n: 'Shins' },
};
export const M_KEYS = Object.keys(MUSCLES);
// Default tags: p = primary, s = secondary. mob = mobility/stretch, not counted.
export const MUSCLE_MAP = {
  latpd: { p: ['lats'], s: ['biceps', 'upperback', 'reardelt'] }, latpdbi: { p: ['lats'], s: ['biceps', 'upperback', 'reardelt'] },
  wristpd: { p: ['forearms'] }, platerot: { p: ['obliques'], s: ['abs'] },
  innerthigh: { p: ['adductors'] }, outerthigh: { p: ['abductors'], s: ['glutes'] }, romanadd: { p: ['adductors'], s: ['obliques'] },
  qlext: { p: ['lowerback', 'obliques'] }, chestpress: { p: ['chest'], s: ['frontdelt', 'triceps'] },
  zercher: { p: ['lowerback'], s: ['glutes', 'hamstrings', 'upperback'] }, zottman: { p: ['biceps', 'forearms'] },
  kbleg: { p: ['abs', 'hipflexors'] }, grip: { p: ['forearms'] }, canoe: { mob: true },
  suitcase: { p: ['forearms', 'obliques'], s: ['traps'] }, reardelt: { p: ['reardelt'], s: ['upperback'] }, facepull: { p: ['reardelt'], s: ['upperback', 'traps'] },
  legext: { p: ['quads'] }, cablecrunch: { p: ['abs'] }, hipthrust: { p: ['glutes'], s: ['hamstrings'] },
  dip: { p: ['triceps', 'chest'], s: ['frontdelt'] }, kneeraise: { p: ['abs', 'hipflexors'], s: ['forearms'] },
  db6: { p: ['frontdelt', 'sidedelt'] }, hack: { p: ['quads'], s: ['glutes', 'adductors'] },
  pallof: { p: ['obliques', 'abs'] }, cablerow: { p: ['lats', 'upperback'], s: ['reardelt', 'biceps'] },
  deskbands: { mob: true }, arnold: { p: ['frontdelt', 'sidedelt'], s: ['triceps'] },
  dbclean: { p: ['quads', 'glutes', 'frontdelt'], s: ['traps', 'triceps', 'hamstrings'] },
  trxpike: { p: ['frontdelt', 'triceps'], s: ['abs'] }, trxrow: { p: ['upperback', 'reardelt'], s: ['lats', 'biceps'] },
  medball: { p: ['obliques'], s: ['glutes', 'abs'] }, latwall: { p: ['glutes', 'quads'], s: ['abductors', 'calves'] },
  spinal: { mob: true }, pogo: { p: ['calves'], s: ['shins'] },
  skater: { p: ['glutes', 'abductors', 'quads'], s: ['adductors', 'calves'] }, splitjump: { p: ['quads', 'glutes'], s: ['calves', 'hamstrings'] },
  depthcombo: { p: ['quads', 'glutes', 'calves'], s: ['hamstrings'] },
  farmers: { p: ['forearms', 'traps'], s: ['obliques', 'abs'] }, dblunge: { p: ['quads', 'glutes'], s: ['adductors', 'hamstrings'] },
  ohtri: { p: ['triceps'] }, bss: { p: ['quads', 'glutes'], s: ['adductors', 'hamstrings'] }, legcurl: { p: ['hamstrings'], s: ['calves'] },
  cablepunch: { p: ['obliques', 'abs'], s: ['chest', 'frontdelt'] },
};
// Left-half shapes (x < 100); mirrored for the right side.
export const SIL = 'M100 44 L92 44 L92 56 Q72 58 62 62 Q50 66 48 84 L50 132 L44 170 L44 212 Q47 226 54 228 Q60 226 60 212 L64 150 L68 112 L72 150 L72 200 L68 214 Q64 270 72 322 Q68 360 74 404 L70 414 L97 414 L96 372 Q98 340 96 322 Q100 280 99 250 L100 244 Z';
export const FRONT = [
  ['traps', 'M78 60 Q86 54 92 52 L92 58 Q86 60 80 63 Z'],
  ['sidedelt', 'M64 61 Q51 63 49 78 Q50 84 54 85 Q56 71 67 65 Z'],
  ['frontdelt', 'M69 64 Q58 70 57 85 Q62 92 70 90 Q74 77 77 66 Z'],
  ['chest', 'M77 66 Q96 61 99 65 L99 100 Q88 106 75 100 Q70 84 77 66 Z'],
  ['biceps', 'M55 91 Q51 111 55 132 Q62 136 66 130 Q68 110 67 94 Z'],
  ['forearms', 'M51 140 Q45 170 48 206 L58 208 Q64 176 64 140 Z'],
  ['obliques', 'M76 104 Q84 106 87 110 Q84 150 88 190 L78 192 Q72 150 76 104 Z'],
  ['abs', 'M89 106 L99 106 L99 190 L91 190 Q87 150 89 106 Z'],
  ['hipflexors', 'M80 197 L95 201 L91 221 L82 212 Z'],
  ['quads', 'M70 216 Q66 262 74 316 Q84 322 92 316 Q95 292 93 266 Q86 244 83 216 Z'],
  ['adductors', 'M92 223 Q98 227 98 234 L96 282 Q88 272 87 242 Z'],
  ['shins', 'M78 336 Q74 362 78 396 L86 396 Q88 362 86 336 Z'],
];
export const BACK = [
  ['traps', 'M84 48 L100 44 L100 98 Q90 86 72 66 Q80 58 84 48 Z'],
  ['reardelt', 'M66 62 Q52 66 50 82 Q56 88 66 86 Q70 74 72 66 Z'],
  ['lats', 'M70 78 Q66 102 76 132 Q86 150 97 158 L98 124 Q84 112 78 96 Z'],
  ['upperback', 'M79 72 Q92 82 99 100 L99 120 Q88 114 80 100 Z'],
  ['triceps', 'M54 89 Q50 110 54 134 Q62 138 66 132 Q68 110 65 91 Z'],
  ['forearms', 'M51 140 Q45 170 48 206 L58 208 Q64 176 64 140 Z'],
  ['lowerback', 'M88 142 L99 152 L99 196 L88 196 Q84 170 88 142 Z'],
  ['abductors', 'M70 196 Q66 210 70 226 Q74 214 84 202 Z'],
  ['glutes', 'M73 202 Q70 230 80 246 Q94 250 99 240 L99 204 Q86 196 73 202 Z'],
  ['hamstrings', 'M72 252 Q68 290 76 322 L94 322 Q98 290 96 254 Q86 258 72 252 Z'],
  ['calves', 'M76 334 Q70 358 78 382 L90 382 Q96 358 90 334 Z'],
];

export const tagsOf =(cfg, id) => (cfg.muscleMap && cfg.muscleMap[id]) || MUSCLE_MAP[id] || null;
export const level = s => s <= 0 ? 0 : s < 5 ? 1 : s < 10 ? 2 : s <= 20 ? 3 : 4;
export const fmtSets = n => (Math.round(n * 2) / 2).toString();
// Planned weekly sets per muscle for a program. `live` uses this week's phases and moves.
export function muscleVolume(cfg, week, prog, live, withSecondary) {
  const vol = {}; M_KEYS.forEach(k => { vol[k] = { sets: 0, ex: [] }; });
  const untagged = new Set();
  slotsFor(prog).forEach(sl => sl.items.forEach((it, idx) => {
    const tg = tagsOf(cfg, it.ex); if (!tg) { untagged.add(it.ex); return; } if (tg.mob) return;
    const ph = live ? phaseOf(cfg, week, sl, idx) : (cfg.phDef[`${sl.id}:${idx}`] ?? it.ph ?? null);
    const m = rxOf(cfg, it, ph).match(/(\d+)\s*×/); const sets = (m ? Number(m[1]) : 3) * (sl.type === 'either' ? 0.5 : 1);
    const day = (live && week.moved[sl.id]) || sl.day;
    (withSecondary ? [['p', 1], ['s', 0.5]] : [['p', 1]]).forEach(([k, f]) => (tg[k] || []).forEach(mu => {
      if (!vol[mu]) return;
      vol[mu].sets += sets * f; vol[mu].ex.push({ ex: it.ex, role: k, day, sets, either: sl.type === 'either' });
    }));
  }));
  return { vol, untagged: [...untagged] };
}

export function muscleNames(cfg, id, role) {
  const t = tagsOf(cfg, id); if (!t || t.mob) return t && t.mob ? (role === 'p' ? 'Mobility' : '') : '';
  return (t[role] || []).map(m => MUSCLES[m] ? MUSCLES[m].n : m).join(', ');
}
