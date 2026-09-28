/* ---------- Muscle map ---------- */
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
export const tagsOf = (cfg, id) => (cfg.muscleMap && cfg.muscleMap[id]) || MUSCLE_MAP[id] || null;
export const level = s => s <= 0 ? 0 : s < 5 ? 1 : s < 10 ? 2 : s <= 20 ? 3 : 4;
export const fmtSets = n => (Math.round(n * 2) / 2).toString();
export function muscleNames(cfg, id, role) {
  const t = tagsOf(cfg, id); if (!t || t.mob) return t && t.mob ? (role === 'p' ? 'Mobility' : '') : '';
  return (t[role] || []).map(m => MUSCLES[m] ? MUSCLES[m].n : m).join(', ');
}
