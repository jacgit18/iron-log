
/* ---------- Program data ---------- */
export const PHASES = {
  strength: { label: 'Strength', rx: '4 × 6', pct: 85 },
  iso: { label: 'Isometric', rx: '4 × 15–30 s', pct: 75 },
  hyp: { label: 'Hypertrophy', rx: '4 × 15', pct: 65 },
  exp: { label: 'Explosive', rx: '3 × 10', pct: 45 },
  mob: { label: 'Mobility', rx: '2 × 30 s', pct: 0 }, // no 1RM share
};
export const PH_KEYS = Object.keys(PHASES);
export const DAY_COUNT = 7;
// Programs saved before Day 7 existed have 6 days; they get an empty seventh.
export const hasValidDays = p => !!p && Array.isArray(p.days) && p.days.length >= 6 && p.days.length <= DAY_COUNT;
// Day 5 and 6 once shipped with these subtitles; saved copies of the program still carry them.
const OLD_SUBS = new Set(['Upper body + rotational power', 'Lower body + reactive power']);
// The sled push used to be a warm-up checkbox. It is now an optional Explosive card (1 × 3), first on every day that
// has exercises. Added once per program (`sledAdded`), so deleting it later sticks; `sledTop` marks that it has been
// moved to the top once. Cards that already have ids keep them, so nothing else on the day changes identity.
const isSled = sl => !!sl && Array.isArray(sl.items) && sl.items.some(it => it.ex === 'sled' || it.ex === 'sledlat');
const sledCard = (key, di) => ({ id: `${key}-sled${di + 1}`, sec: 'Optional', note: 'Optional', items: [{ ex: key === 'B' ? 'sled' : 'sledlat', ph: 'exp', w: null, rx: '1 × 3' }] });
function withSled(prog, days) {
  const key = prog.key || 'N';
  const hasSled = days.some(d => d && Array.isArray(d.slots) && d.slots.some(isSled));
  const add = !prog.sledAdded && !hasSled;
  if (prog.sledTop && !add) return days;
  const taken = new Set();
  days.forEach((d, di) => (d && d.slots || []).forEach((sl, si) => { if (!isSled(sl)) taken.add(sl.id || `${key}-d${di + 1}s${si + 1}`); }));
  return days.map((d, di) => {
    if (!d || !Array.isArray(d.slots) || !d.slots.length) return d;
    const slots = d.slots.map((sl, si) => (sl.id ? sl : { ...sl, id: `${key}-d${di + 1}s${si + 1}` }));
    const sled = slots.filter(isSled).map(sl => {
      let id = sl.id; if (taken.has(id)) id = `${key}-sled${di + 1}`;
      while (taken.has(id)) id += '_';
      taken.add(id); return id === sl.id ? sl : { ...sl, id };
    });
    if (add) sled.push(sledCard(key, di));
    return { ...d, slots: [...sled, ...slots.filter(sl => !isSled(sl))] };
  });
}
export function withAllDays(prog) {
  let days = prog.days.map(d => (d && OLD_SUBS.has(d.sub) ? (({ sub, ...rest }) => rest)(d) : d)); // eslint-disable-line no-unused-vars
  days = withSled(prog, days);
  while (days.length < DAY_COUNT) days.push({ title: `Day ${days.length + 1}`, slots: [] });
  return { ...prog, days, sledAdded: true, sledTop: true };
}
export const padLibrary = items => items.map(it => (it && hasValidDays(it.prog) ? { ...it, prog: withAllDays(it.prog) } : it));

export const EQUIPMENT = {
  barbell: 'Barbell', shortbar: 'Short barbell', ezbar: 'EZ bar', dumbbell: 'Dumbbell', kettlebell: 'Kettlebell', cable: 'Cable', machine: 'Machine', bodyweight: 'Bodyweight',
  band: 'Band', trx: 'TRX', plate: 'Plate', medball: 'Med ball', other: 'Other',
};
export const EQ_KEYS = Object.keys(EQUIPMENT);

export const EX = {
  latpd: { n: 'Lat Pulldown, alternating single-arm', eq: 'cable' },
  wristpd: { n: 'Cable Wrist Pulldown', eq: 'cable' },
  platerot: { n: 'Plate Torso Rotation', eq: 'plate' },
  innerthigh: { n: 'Inner Thigh Abduction', eq: 'machine' },
  romanadd: { n: 'Roman Chair Hip Adduction', url: 'https://www.youtube.com/watch?v=j5HWZOfIePI', eq: 'bodyweight' },
  chestpress: { n: 'Chest Press', eq: 'machine' },
  zercher: { n: 'Seated Zercher Good Morning', url: 'https://youtu.be/ahfSSi4MVJQ', eq: 'barbell' },
  zottman: { n: 'Zottman Curl', eq: 'dumbbell' },
  kbleg: { n: 'Kettlebell Leg Raise', eq: 'kettlebell' },
  grip: { n: 'Grip Trainer', eq: 'other' },
  canoe: { n: 'Canoe Stretch', url: 'https://youtu.be/yR6EnBqjKNs', eq: 'barbell' },
  suitcase: { n: 'Suitcase Bottom-Up, single-arm', eq: 'kettlebell' },
  reardelt: { n: 'Side Rear Delt Fly', eq: 'cable' },
  facepull: { n: 'Face Pull', eq: 'cable' },
  legext: { n: 'Leg Extension ISO hold', eq: 'machine' },
  cablecrunch: { n: 'Kneeling Cable Ab Crunch', eq: 'cable' },
  hipthrust: { n: 'Hip Thrust', eq: 'machine' },
  dip: { n: 'Wide Tricep Dip', eq: 'bodyweight' },
  kneeraise: { n: 'Hanging Knee Raise', eq: 'bodyweight' },
  db6: { n: 'DB 6 Ways', eq: 'dumbbell' },
  hack: { n: 'Hack Squat', eq: 'machine' },
  pallof: { n: 'Pallof Press', eq: 'cable' },
  cablerow: { n: 'Explosive Unilateral Cable Row', url: 'https://youtu.be/OrAcowGGU2U', eq: 'cable' },
  deskbands: { n: 'Desk Bands', url: 'https://youtu.be/o_uZcQnXaFA', eq: 'band' },
  arnold: { n: 'Arnold Press', eq: 'dumbbell' },
  dbclean: { n: 'DB Clean & Jerk Press', eq: 'dumbbell' },
  trxpike: { n: 'TRX Pike Push-Up', url: 'https://youtu.be/GIWNRslPEv4', eq: 'trx' },
  trxrow: { n: 'TRX Wide-Grip Row', url: 'https://youtu.be/o9M1k6OzI-g', eq: 'trx' },
  medball: { n: 'Med Ball Rotational Scoop', url: 'https://youtu.be/xmQfXggU2mU', eq: 'medball' },
  latwall: { n: 'Lateral Wall Push', url: 'https://youtu.be/tIFjnucY09Q', eq: 'bodyweight' },
  spinal: { n: 'Spinal Waves', url: 'https://youtu.be/KCfh_wCssK8' },
  pogo: { n: 'Pogo Hops', url: 'https://youtu.be/iU-TKr4YesM', eq: 'bodyweight' },
  skater: { n: 'Lateral Bound / Skater Hop with Stick', url: 'https://youtu.be/4nTDP0G3nhc', eq: 'bodyweight' },
  splitjump: { n: 'Split Squat Jumps', url: 'https://www.youtube.com/watch?v=4DMvFDaqIys', eq: 'bodyweight' },
  depthcombo: { n: 'Depth Drop → Broad Jump → Box Jump', url: 'https://youtu.be/GZLyZCqF8BQ', eq: 'bodyweight' },
  latpdbi: { n: 'Lat Pulldown', eq: 'cable' },
  outerthigh: { n: 'Outer Thigh Adduction', eq: 'machine' },
  qlext: { n: 'Side Lateral QL Extension', url: 'https://www.youtube.com/watch?v=UaydER2VIUc', eq: 'machine' },
  farmers: { n: 'Farmers Carry', eq: 'dumbbell' },
  dblunge: { n: 'DB Lunge', eq: 'dumbbell' },
  ohtri: { n: 'Overhead Tricep Extension', eq: 'cable' },
  bss: { n: 'Bulgarian Split Squat', eq: 'dumbbell' },
  legcurl: { n: 'Prone Leg Curl', eq: 'machine' },
  cablepunch: { n: 'Cable Punch ISO hold', eq: 'cable' },
  sledlat: { n: 'Sled push → lateral pull', eq: 'other' },
  sled: { n: 'Sled push → pull', eq: 'other' },
};

// item: {ex, ph, w (lb), bw, rx (custom when phase==ph), note}
const I = (ex, ph, w, extra = {}) => ({ ex, ph, w, ...extra });
const EITHER_DELT = { type: 'either', tier: 'Accessory', items: [I('reardelt', 'iso', 50, { rx: '4 × 15 s per arm' }), I('facepull', 'strength', 30)], note: 'Whichever is free' };

const PROGRAM_A = {
  days: [
    { title: 'Day 1', slots: [
      { sec: 'Regular', tier: 'Primary', items: [I('latpd', 'hyp', 45)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('wristpd', 'hyp', 33)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('platerot', 'strength', 10)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('innerthigh', 'strength', 180)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('romanadd', null, null, { bw: true, note: 'On the back-extension bench' })] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('chestpress', 'strength', 35), I('zercher', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('zottman', 'hyp', 15, { rx: '3 × 15' }), I('kbleg', 'iso', 15, { rx: '3 × 15 s hold' })] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('canoe', null, 10, { note: 'With a stick or barbell' })] },
    ] },
    { title: 'Day 2', slots: [
      { sec: 'Regular', tier: 'Primary', items: [I('suitcase', null, 20, { rx: '3 × 4 each arm' })] },
      { sec: 'Regular', ...EITHER_DELT },
      { sec: 'Regular', tier: 'Accessory', items: [I('legext', 'iso', 50, { rx: '4 × 30 s' })] },
      { sec: 'Regular', tier: 'Accessory', items: [I('cablecrunch', 'strength', 60)] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('hipthrust', 'strength', 320), I('chestpress', 'hyp', 25)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('dip', 'strength', null, { bw: true, note: 'Bodyweight, working toward +10 lb' }), I('kneeraise', 'strength', null, { bw: true })] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('db6', 'strength', 10, { rx: '2 × 6' })] },
    ] },
    { title: 'Day 3', slots: [
      { sec: 'Regular', tier: 'Primary', items: [I('hack', 'hyp', 270, { note: 'Feet low on the plate, narrow stance for quads' })] },
      { sec: 'Regular', tier: 'Primary', items: [I('latpd', 'hyp', 45)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('wristpd', 'hyp', 33)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('platerot', 'strength', 10)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('legext', 'iso', 50, { rx: '4 × 30 s' })] },
      { sec: 'Regular', ...EITHER_DELT },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('pallof', 'strength', 30), I('cablerow', 'exp', 30)] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('deskbands', null, null, { note: 'With a resistance band' })] },
    ] },
    { title: 'Day 4', slots: [
      { sec: 'Regular', tier: 'Primary', items: [I('suitcase', null, 20, { rx: '3 × 4 each arm' })] },
      { sec: 'Regular', tier: 'Accessory', items: [I('innerthigh', 'strength', 180)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('romanadd', null, null, { bw: true, note: 'On the back-extension bench' })] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('arnold', 'strength', 35), I('zercher', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('hipthrust', 'strength', 320), I('chestpress', 'hyp', 25)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('zottman', 'hyp', 15, { rx: '3 × 15' }), I('kbleg', 'iso', 15, { rx: '3 × 15 s hold' })] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('deskbands', null, null, { note: 'With a resistance band' })] },
    ] },
    { title: 'Day 5', makeup: true, slots: [
      { sec: 'Regular', items: [I('cablecrunch', 'strength', 60)] },
      { sec: 'Regular', items: [I('dbclean', 'exp', 20)] },
      { sec: 'Regular', items: [I('hack', 'hyp', 270, { note: 'Feet low on the plate, narrow stance for quads' })] },
      { sec: 'Regular', ...EITHER_DELT },
      { sec: 'Plyometric', items: [I('trxpike', 'exp', null, { bw: true })] },
      { sec: 'Plyometric', items: [I('trxrow', 'exp', null, { bw: true })] },
      { sec: 'Plyometric', items: [I('medball', 'exp', null)] },
      { sec: 'Plyometric', items: [I('latwall', 'exp', null, { bw: true })] },
      { sec: 'Home', items: [I('db6', 'strength', 10, { rx: '2 × 6' })] },
      { sec: 'Home', items: [I('spinal', null, null, { note: 'Standing, no equipment' })] },
    ] },
    { title: 'Day 6', slots: [
      { sec: 'Plyometric', items: [I('pogo', 'exp', null, { bw: true, rx: '3 × 10' })] },
      { sec: 'Plyometric', items: [I('skater', 'exp', null, { bw: true, rx: '3 × 5, hold 3 s' })] },
      { sec: 'Plyometric', items: [I('splitjump', 'exp', null, { bw: true, rx: '3 × 5', note: 'Vertical drive, soft landings' })] },
      { sec: 'Plyometric', items: [I('depthcombo', 'exp', null, { bw: true, rx: '4 × 5', note: 'Controlled landings' })] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('arnold', 'strength', 35), I('zercher', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('pallof', 'strength', 30), I('cablerow', 'exp', 30)] },
    ] },
  ],
};

const EITHER_CARRY = { type: 'either', tier: 'Primary', items: [I('farmers', 'strength', 40), I('dblunge', 'strength', 40)], note: 'Whichever is free' };
const PROGRAM_B = {
  days: [
    { title: 'Day 1', slots: [
      { sec: 'Regular', tier: 'Primary', items: [I('latpdbi', 'hyp', 45)] },
      { sec: 'Regular', tier: 'Primary', items: [I('hack', 'hyp', 270, { note: 'Feet low on the plate, narrow stance for quads' })] },
      { sec: 'Regular', tier: 'Accessory', items: [I('wristpd', 'hyp', 33)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('platerot', 'strength', 10)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('innerthigh', 'strength', 180)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('outerthigh', 'strength', 160)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('qlext', null, null, { bw: true })] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('chestpress', 'strength', 35), I('zercher', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('zottman', 'hyp', 15, { rx: '3 × 15' }), I('kbleg', 'iso', 15, { rx: '3 × 15 s hold' })] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('canoe', null, 10, { note: 'With a stick or barbell' })] },
    ] },
    { title: 'Day 2', slots: [
      { sec: 'Regular', ...EITHER_CARRY },
      { sec: 'Regular', tier: 'Primary', items: [I('ohtri', 'strength', 17)] },
      { sec: 'Regular', ...EITHER_DELT },
      { sec: 'Regular', tier: 'Accessory', items: [I('cablecrunch', 'strength', 60)] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('hipthrust', 'strength', 320), I('chestpress', 'hyp', 25)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('bss', 'strength', 40), I('legcurl', 'strength', 50)] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('db6', 'strength', 10, { rx: '2 × 6' })] },
    ] },
    { title: 'Day 3', slots: [
      { sec: 'Regular', tier: 'Primary', items: [I('hack', 'hyp', 270, { note: 'Feet low on the plate, narrow stance for quads' })] },
      { sec: 'Regular', tier: 'Primary', items: [I('latpdbi', 'hyp', 45)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('wristpd', 'hyp', 33)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('platerot', 'strength', 10)] },
      { sec: 'Regular', ...EITHER_DELT },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('cablepunch', 'iso', 30, { rx: '4 × 30 s hold' }), I('cablerow', 'exp', 30)] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('deskbands', null, null, { note: 'With a resistance band' })] },
    ] },
    { title: 'Day 4', slots: [
      { sec: 'Regular', ...EITHER_CARRY },
      { sec: 'Regular', tier: 'Accessory', items: [I('innerthigh', 'strength', 180)] },
      { sec: 'Regular', tier: 'Accessory', items: [I('outerthigh', 'strength', 160)] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('arnold', 'strength', 35), I('zercher', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('hipthrust', 'strength', 320), I('chestpress', 'hyp', 25)] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('bss', 'strength', 40), I('legcurl', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('zottman', 'hyp', 15, { rx: '3 × 15' }), I('kbleg', 'iso', 15, { rx: '3 × 15 s hold' })] },
      { sec: 'Home', items: [I('grip', 'strength', 200, { note: 'With a grip trainer' })] },
      { sec: 'Home', items: [I('deskbands', null, null, { note: 'With a resistance band' })] },
    ] },
    { title: 'Day 5', makeup: true, slots: [
      { sec: 'Regular', items: [I('cablecrunch', 'strength', 60)] },
      { sec: 'Regular', items: [I('dbclean', 'exp', 20)] },
      { sec: 'Regular', ...EITHER_DELT },
      { sec: 'Plyometric', items: [I('trxpike', 'exp', null, { bw: true })] },
      { sec: 'Plyometric', items: [I('trxrow', 'exp', null, { bw: true })] },
      { sec: 'Plyometric', items: [I('medball', 'exp', null)] },
      { sec: 'Plyometric', items: [I('latwall', 'exp', null, { bw: true })] },
      { sec: 'Home', items: [I('db6', 'strength', 10, { rx: '2 × 6' })] },
      { sec: 'Home', items: [I('spinal', null, null, { note: 'Standing, no equipment' })] },
    ] },
    { title: 'Day 6', slots: [
      { sec: 'Plyometric', items: [I('pogo', 'exp', null, { bw: true, rx: '3 × 10' })] },
      { sec: 'Plyometric', items: [I('skater', 'exp', null, { bw: true, rx: '3 × 5, hold 3 s' })] },
      { sec: 'Plyometric', items: [I('splitjump', 'exp', null, { bw: true, rx: '3 × 5', note: 'Vertical drive, soft landings' })] },
      { sec: 'Plyometric', items: [I('depthcombo', 'exp', null, { bw: true, rx: '4 × 5', note: 'Controlled landings' })] },
      { sec: 'Supersets', tier: 'Primary', type: 'superset', items: [I('arnold', 'strength', 35), I('zercher', 'strength', 50)] },
      { sec: 'Supersets', tier: 'Accessory', type: 'superset', items: [I('cablepunch', 'iso', 30, { rx: '4 × 30 s hold' }), I('cablerow', 'exp', 30)] },
    ] },
  ],
};
export const WARMUP = [{ id: 'shadow', n: 'Shadow box', rx: 'as you feel' }];
// The warm-up list is editable: cfg.warmup replaces the default once the user changes it.
export const warmupOf = cfg => (Array.isArray(cfg.warmup) ? cfg.warmup : WARMUP);

PROGRAM_A.key = 'A'; PROGRAM_B.key = 'B';
[PROGRAM_A, PROGRAM_B].forEach(p => Object.assign(p, withAllDays(p)));
[PROGRAM_A, PROGRAM_B].forEach(p => p.days.forEach((d, di) => d.slots.forEach((sl, si) => { sl.id = sl.id || `${p.key}-d${di + 1}s${si + 1}`; })));
export const BUILTIN = { A: PROGRAM_A, B: PROGRAM_B };

export function slotsFor(prog) {
  const out = [];
  prog.days.forEach((d, di) => d.slots.forEach((s, si) => out.push({ ...s, id: s.id || `${prog.key}-d${di + 1}s${si + 1}`, day: di + 1, type: s.type || 'single' })));
  return out;
}

// A saved/edited program only replaces the built-in one when it has the right shape.
export function resolveProgram(k, data) { return hasValidDays(data) ? withAllDays({ ...structuredClone(data), key: k }) : BUILTIN[k]; }
export const VIDEO_ERR = 'Video link should start with https://';
// "Watch on YouTube" / "Watch on Instagram" from the link's host; unknown hosts show their domain.
const PLATFORMS = { 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'vimeo.com': 'Vimeo', 'facebook.com': 'Facebook', 'fb.watch': 'Facebook', 'x.com': 'X', 'twitter.com': 'X' };
export function videoLabel(url) {
  let host;
  try { host = new URL(String(url).trim()).hostname.toLowerCase().replace(/^(www|m)\./, ''); } catch { return 'Watch video'; }
  const hit = Object.keys(PLATFORMS).find(h => host === h || host.endsWith('.' + h));
  return `Watch on ${hit ? PLATFORMS[hit] : host}`;
}
export const isVideoUrl = s => !s || !s.trim() || /^https?:\/\//.test(s.trim()); // empty is fine: the link is optional
// What you set on an exercise (video link, equipment) is kept in cfg.ex and layers over the built-in entry.
export function exInfo(cfg, id) {
  const o = { ...(EX[id] || { n: id }), ...(cfg.ex && cfg.ex[id]) };
  return o;
}
export const allExIds = cfg => [...new Set([...Object.keys(EX), ...Object.keys(cfg.ex || {})])];

// A new custom exercise's id from its name, unique among the built-ins and cfg.ex (`taken` adds ids being created now).
export function newExId(cfg, name, taken = {}) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exercise';
  const known = { ...cfg.ex, ...taken }; let id = base, n = 2;
  while (EX[id] || (known[id] && known[id].n !== name)) id = `${base}-${n++}`;
  return id;
}
// Typed exercise names: matched to the catalog (built-in and your own) ignoring case and extra spaces.
const nameKey = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
export const findExId = (cfg, name) => { const k = nameKey(name); return k ? allExIds(cfg).find(id => nameKey(exInfo(cfg, id).n) === k) ?? null : null; };
// What the add/edit sheets save for a typed name: an existing exercise, or '__new' with the cleaned name to create.
export const exerciseChoice = (cfg, name) => { const n = String(name || '').trim().replace(/\s+/g, ' '); const id = findExId(cfg, n); return id ? { ex: id, nn: '' } : { ex: n ? '__new' : '', nn: n }; };
