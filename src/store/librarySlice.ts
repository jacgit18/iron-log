import { catalogPickError, catalogSnapshot } from '../lib/catalogExercise.js';
import { clearDone, dayAt, progName } from '../lib/logic.js';
import { eqNameError, newEqId } from '../lib/equipment.js';
import { exIdsInUse, usageOf } from '../lib/exerciseLibrary.js';
import { EX, exInfo, findExId, isCatalogId, isOwnExercise, isVideoUrl, newExId, slotsFor, VIDEO_ERR, warmupOf } from '../lib/data.js';
import { MUSCLE_MAP } from '../lib/muscles.js';
import { validRm } from '../shared/validate.js';
import type { Cfg, LibraryItem, PhaseKey, Program } from '../types.ts';
import type { Flag, LibrarySlice, StoreGet, StoreSet } from './types.ts';

const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// What you set on an exercise (video link, equipment) applies everywhere it appears. cfg.ex keeps only
// what differs from the built-in entry; clearing a built-in value stores '' (or false) so the merge hides it.
// Your own exercise (synced, that includes one saved under a built-in id) keeps every value, so its cfg.ex entry never empties out.
export function setOverride(c: Cfg, exId: string, vals: Record<string, unknown>) {
  const own = isOwnExercise(exId);
  const base: Record<string, any> = EX[exId] || {}; const o: Record<string, any> = { ...(c.ex[exId] || {}) };
  Object.entries(vals).forEach(([k, v]) => { if (v && (own || v !== base[k])) o[k] = v; else if (v) delete o[k]; else if (base[k]) o[k] = ''; else delete o[k]; });
  if (own && !o.n) o.n = EX[exId]?.n || exId;
  if (Object.keys(o).length) c.ex[exId] = o; else delete c.ex[exId];
}

// An exercise's default phase for every card. Slot defaults saved for that exercise would outrank it, so they go;
// a slot default saved afterwards wins again.
export function setExerciseDefault(c: Cfg, exId: string, ph: PhaseKey | null | '', programs: Record<string, Program>, library: LibraryItem[]) {
  c.exPh = c.exPh || {};
  if (ph) c.exPh[exId] = ph; else delete c.exPh[exId];
  if (!ph) return;
  const progs = [...Object.values(programs), ...library.map(it => ({ ...it.prog, key: 'N' }))];
  progs.forEach(p => { try { slotsFor(p as Program).forEach(sl => sl.items.forEach((x, i) => { if (x.ex === exId) delete c.phDef[`${sl.id}:${i}`]; })); } catch { /* a malformed saved program */ } });
}

const sameTags = (a: Record<string, any>, b: Record<string, any>) => JSON.stringify([[...(a.p || [])].sort(), [...(a.s || [])].sort(), !!a.mob]) === JSON.stringify([[...(b.p || [])].sort(), [...(b.s || [])].sort(), !!b.mob]);

// The experiment list and the exercise library: add, edit and delete exercises, equipment and warm-ups, and put them on a day.
export const librarySlice = (set: StoreSet, get: StoreGet, flag: Flag): LibrarySlice => ({
  // Experiment board: a list of exercises to try, added to a day of the viewed week as a card for that week.
  setExperiments(experiments) { set({ experiments }); get().saveExperiments(); },
  saveExperiment(d) {
    if (get().blocked()) return null;
    if (!d.ex || (d.ex === '__new' && !d.nn)) return 'Choose an exercise, or type a name for the new one.';
    if (!isVideoUrl(d.nu)) return VIDEO_ERR;
    if (d.cat) { const err = catalogPickError(get().cfg, d.cat, exIdsInUse(get(), get().cfg)); if (err) return err; }
    const chosen = d.ex === '__new' ? findExId(get().cfg, d.nn) ?? '__new' : d.ex; // a typed name an exercise already has is that exercise
    const target = d.cat ? d.cat.id : chosen;
    if (target !== '__new' && get().experiments.some(x => x.ex === target && x.id !== d.id)) return `${exInfo(get().cfg, target).n} is already on the Experiment list.`;
    const ex = get().resolveExerciseChoice(d, chosen);
    const item = { id: d.id || uid('E'), ex, ph: d.ph || null, note: (d.note || '').trim().slice(0, 200) };
    const list = get().experiments;
    get().setExperiments(d.id ? list.map(x => (x.id === d.id ? item : x)) : [...list, item]);
    set({ modal: null }); flag('Saved'); return null;
  },
  // The exercise id a sheet's choice stands for, adding it to the library first when it is new: a catalog pick joins with its snapshot
  // (ADR 036), a typed name becomes a new exercise, an existing one gets the link and equipment typed for it. `chosen`: `d.ex`, or the
  // existing exercise a typed name already belongs to. The caller has already checked the choice.
  resolveExerciseChoice(d, chosen) {
    if (d.cat && !get().cfg.ex[d.cat.id]) {
      const id = d.cat.id; const { info, tags } = catalogSnapshot(d.cat, d);
      get().mutateCfg(c => { c.ex[id] = info; if (tags) c.muscleMap = { ...(c.muscleMap || {}), [id]: tags }; });
      return id;
    }
    if (chosen === '__new') return get().createExercise(d);
    const ex = d.cat ? d.cat.id : chosen; get().applyExerciseUrl(ex, d.nu); get().applyExerciseEq(ex, d.ne);
    return ex;
  },
  // A link typed for an existing exercise replaces its saved one everywhere.
  applyExerciseUrl(ex, raw) {
    if (raw == null) return; // not offered by this caller: leave the saved link alone
    const url = (raw || '').trim();
    if (url === (exInfo(get().cfg, ex).url || '')) return;
    get().mutateCfg(c => setOverride(c, ex, { url }));
  },
  applyExerciseEq(ex, eq) {
    if (eq == null) return; // not offered by this caller: leave the saved equipment alone
    if (eq === (exInfo(get().cfg, ex).eq || '')) return;
    get().mutateCfg(c => setOverride(c, ex, { eq }));
  },

  // A kind of equipment of your own for the Equipment menus. Returns its id, or null (and says why).
  addEquipment(name) {
    if (get().blocked()) return null;
    const err = eqNameError(get().cfg, name); if (err) { flag(err); return null; }
    const n = name.trim().replace(/\s+/g, ' '); const id = newEqId(get().cfg, n);
    get().mutateCfg(c => { c.equipment = { ...(c.equipment || {}), [id]: n }; });
    flag(`Added ${n}`); return id;
  },
  // Only while no exercise uses it.
  removeEquipment(id) {
    const name = get().cfg.equipment?.[id]; if (!name) return false;
    const users = Object.keys(get().cfg.ex || {}).filter(x => get().cfg.ex![x].eq === id).map(x => exInfo(get().cfg, x).n);
    if (users.length) { flag(`${name} is on ${users.slice(0, 3).join(', ')}${users.length > 3 ? ` and ${users.length - 3} more` : ''}. Change that first`); return false; }
    return get().mutateCfg(c => { const E = { ...(c.equipment || {}) }; delete E[id]; if (Object.keys(E).length) c.equipment = E; else delete c.equipment; });
  },
  // A typed name that isn't in the catalog yet becomes a custom exercise (video link and equipment optional). Returns its id.
  createExercise(d) {
    const ex = newExId(get().cfg, d.nn);
    get().mutateCfg(c => { c.ex[ex] = { n: d.nn, ...(d.nu ? { url: d.nu } : {}), ...(d.ne ? { eq: d.ne } : {}) }; });
    return ex;
  },
  // Add an exercise straight to a day of the viewed week. Only this week gets the card; the program doesn't change.
  addExerciseToDay(col, d) {
    if (get().blocked()) return null;
    if (!d.ex || (d.ex === '__new' && !d.nn)) return 'Choose an exercise, or type a name for the new one.';
    if (!isVideoUrl(d.nu)) return VIDEO_ERR;
    const pd = dayAt(get().week, col); if (pd == null) return 'That is your rest day.';
    if (d.cat) { const err = catalogPickError(get().cfg, d.cat, exIdsInUse(get(), get().cfg)); if (err) return err; }
    const ex = get().resolveExerciseChoice(d, d.ex);
    const note = (d.note || '').trim().slice(0, 200);
    const ph = d.ph || null; const exDef = (get().cfg.exPh || {})[ex]; const id = uid('X-');
    const ok = get().mutateWeek(w => {
      w.extra = [...(w.extra || []), { id, day: pd, ex, ph, note, add: true }];
      if (ph && exDef && ph !== exDef) w.ph[`${id}:0`] = ph; // picked over the exercise default: a one-week pick, like the card's phase menu
    });
    if (!ok) return null;
    set({ modal: null }); flag(`Added ${exInfo(get().cfg, ex).n} to Day ${col}`); return null;
  },
  // Everything set on one exercise, applied to every card with it: video link, equipment, default phase,
  // and (when given) name (your own exercises), 1RM ('' removes it) and muscle tags (null = back to the default).
  saveExerciseDetails(exId, d) {
    if (get().blocked()) return null;
    const url = d.url === undefined ? undefined : (d.url || '').trim();
    if (!isVideoUrl(url)) return VIDEO_ERR;
    const custom = isOwnExercise(exId); const name = d.name != null ? d.name.trim().replace(/\s+/g, ' ') : null;
    if (custom && name != null) {
      if (!name) return 'Give the exercise a name.';
      const other = findExId(get().cfg, name); if (other && other !== exId) return 'Another exercise already has that name.';
    }
    get().mutateCfg(c => {
      // Fields left out stay as they were.
      setOverride(c, exId, { ...(url !== undefined ? { url } : {}), ...(d.eq !== undefined ? { eq: d.eq || '' } : {}) });
      if (custom && name) c.ex[exId] = { ...c.ex[exId], n: name };
      const ph = d.ph;
      if (ph !== undefined && ph !== ((c.exPh || {})[exId] || '')) setExerciseDefault(c, exId, ph, get().programs, get().library);
      if (d.rm !== undefined) { const n = Number(d.rm); if (d.rm === '' || d.rm === null || !validRm(n)) delete c.rm[exId]; else c.rm[exId] = n; }
      if (d.tags !== undefined) {
        c.muscleMap = c.muscleMap || {};
        if (d.tags === null || (MUSCLE_MAP[exId] && sameTags(d.tags, MUSCLE_MAP[exId]))) delete c.muscleMap[exId]; else c.muscleMap[exId] = d.tags;
      }
    });
    set({ modal: null }); flag('Exercise saved'); return null;
  },
  // A new exercise for the library, not on any card yet. Returns an error message, or null when saved.
  createLibraryExercise(d) {
    if (get().blocked()) return null;
    const nn = (d.name || '').trim().replace(/\s+/g, ' ');
    if (!nn) return 'Give the exercise a name.';
    if (findExId(get().cfg, nn)) return 'That exercise is already in the library.';
    if (!isVideoUrl(d.url)) return VIDEO_ERR;
    const id = get().createExercise({ nn });
    return get().saveExerciseDetails(id, { ...d, name: nn });
  },
  // A catalog exercise joins the library as a snapshot (ADR 026): its name, equipment and muscles are copied into this account's config
  // under the catalog id, so the board and logs never need the catalog again. It stays a Library item.
  addCatalogExercise(item) {
    if (get().blocked()) return null;
    const { id } = item; const cfg = get().cfg;
    const err = catalogPickError(cfg, item, exIdsInUse(get(), get().cfg)); if (err) return err;
    if (cfg.ex[id]) return 'Already in your library.';
    const { info, tags } = catalogSnapshot(item);
    if (!get().mutateCfg(c => {
      c.ex[id] = info;
      if (tags) c.muscleMap = { ...(c.muscleMap || {}), [id]: tags };
    })) return null;
    flag(`Added ${info.n}`); return null;
  },
  // Your own exercises and catalog ones, and only when nothing uses them, so no card or log ends up pointing at a missing name.
  // Removing a catalog exercise takes it out of this library only; the catalog keeps it.
  deleteExercise(exId) {
    if (get().blocked()) return null;
    if (!isOwnExercise(exId) && !isCatalogId(exId)) return 'Built-in exercises can’t be deleted.';
    const u = usageOf(exId, get());
    const where = [u.programs.length && `in ${u.programs.map(k => progName(get().cfg, k)).join(' and ')}`, u.versions && 'in a saved version', u.experiments && 'on the Experiment board', u.logs && 'in your logs'].filter(Boolean);
    if (where.length) return `It is still used ${where.join(', ')}. Remove it there first.`;
    const c0 = get().cfg; const kept = { ex: c0.ex[exId], rm: c0.rm[exId], ph: c0.exPh?.[exId], tags: c0.muscleMap?.[exId] };
    if (!get().mutateCfg(c => { delete c.ex[exId]; delete c.rm[exId]; if (c.exPh) delete c.exPh[exId]; if (c.muscleMap) delete c.muscleMap[exId]; })) return null;
    set({ modal: null });
    get().noteRemoved('exercises', kept.ex?.n || exId, () => !get().cfg.ex[exId] && get().mutateCfg(c => {
      c.ex[exId] = kept.ex; if (kept.rm !== undefined) c.rm[exId] = kept.rm;
      if (kept.ph !== undefined) c.exPh = { ...(c.exPh || {}), [exId]: kept.ph };
      if (kept.tags !== undefined) c.muscleMap = { ...(c.muscleMap || {}), [exId]: kept.tags };
    }));
    return null;
  },
  deleteExperiment(id) {
    if (get().blocked()) return;
    const L = get().experiments; const i = L.findIndex(x => x.id === id); if (i < 0) return;
    const e = L[i];
    get().setExperiments(L.filter(x => x.id !== id));
    get().noteRemoved('experiments', exInfo(get().cfg, e.ex).n, () => {
      if (get().blocked() || get().experiments.some(x => x.id === id)) return false;
      const l = [...get().experiments]; l.splice(Math.min(i, l.length), 0, e); get().setExperiments(l); return true;
    });
  },
  addToDay(entryId, col) {
    const e = get().experiments.find(x => x.id === entryId); if (!e) return false;
    const pd = dayAt(get().week, col); if (pd == null) { flag('That is your rest day'); return false; }
    const ok = get().mutateWeek(w => { w.extra = [...(w.extra || []), { id: uid('X-'), day: pd, ex: e.ex, ph: e.ph ?? null, note: e.note || '' }]; });
    if (ok) flag(`Added ${exInfo(get().cfg, e.ex).n} to Day ${col}`);
    return ok;
  },
  removeExtra(slotId) {
    const s = get().slotById(slotId); if (!s || !s.experiment) return;
    const w0 = get().week; const wk = get().weekKey(); const i = (w0.extra || []).findIndex(x => x.id === slotId);
    const ok = get().mutateChecks(w => {
      clearDone(w, s); delete w.skipped[slotId]; Object.keys(w.skipped).forEach(k => { if (k.startsWith(slotId + '#')) delete w.skipped[k]; }); delete w.moved[slotId]; delete w.ph[`${slotId}:0`];
      w.extra = (w.extra || []).filter(x => x.id !== slotId); if (!w.extra.length) delete w.extra;
    });
    if (!ok || i < 0) return;
    const mn = get().moveNote;
    if (mn && (mn.slot === slotId || (mn.batch && slotId in mn.batch))) set({ moveNote: null });
    // Undo puts the card back with its skip, move and phase, then its ticks, both through the check path: the ticks go
    // in once the card is on the board again, so a ticked card logs its check-off again (the one the removal took out),
    // never twice. Only in the week it came from.
    const x0 = w0.extra![i]; const w1 = get().week;
    const lost = (k: 'done' | 'skipped' | 'moved' | 'ph') => Object.entries(w0[k] || {}).filter(([key]) => !(key in (w1[k] || {})));
    const keep = { skipped: lost('skipped'), moved: lost('moved'), ph: lost('ph') }; const ticks = lost('done');
    get().noteRemoved('board:' + wk, `${exInfo(get().cfg, x0.ex).n} from this week`, () => {
      if (get().weekKey() !== wk || (get().week.extra || []).some(x => x.id === slotId)) return false;
      if (!get().mutateChecks(w => {
        const l = [...(w.extra || [])]; l.splice(Math.min(i, l.length), 0, x0); w.extra = l;
        keep.skipped.forEach(([k]) => { w.skipped[k] = true; });
        keep.moved.forEach(([k, v]) => { w.moved[k] = v; });
        keep.ph.forEach(([k, v]) => { w.ph[k] = v; });
      })) return false;
      if (ticks.length) get().mutateChecks(w => { ticks.forEach(([k]) => { w.done[k] = true; }); });
      return true;
    });
  },
  addWarmup(n, rx) {
    const name = String(n || '').trim().slice(0, 60); if (!name) return false;
    return get().mutateCfg(c => { c.warmup = [...warmupOf(c), { id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, n: name, rx: String(rx || '').trim().slice(0, 40) }]; });
  },
  removeWarmup(id, d) {
    const L = warmupOf(get().cfg); const i = L.findIndex(x => x.id === id); if (i < 0) return;
    const x0 = L[i];
    if (!get().mutateCfg(c => { c.warmup = warmupOf(c).filter(x => x.id !== id); })) return;
    get().noteRemoved(`warmup:${d ?? ''}`, `${x0.n} from the warm-up`, () => !warmupOf(get().cfg).some(x => x.id === id) && get().mutateCfg(c => {
      const l = [...warmupOf(c)]; l.splice(Math.min(i, l.length), 0, x0); c.warmup = l;
    }));
  },
});
