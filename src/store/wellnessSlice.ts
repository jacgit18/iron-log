import { isVideoUrl, VIDEO_ERR } from '../lib/data.js';
import { DEFAULT_STRETCHES, DEFAULT_GROUP, doneKey, newStretchId, normStretchWeek, normStretches, STRETCH_DAYS, withoutStretch } from '../lib/stretches.js';
import { SLOTS, newSupplementId } from '../lib/supplements.js';
import type { Flag, StoreGet, StoreSet, WellnessSlice } from './types.ts';
import { validOz, validGoal, normSupplements, MAX_TRAIN_MIN } from '../lib/water.js';

const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const r1 = (n: number) => Math.round(n * 10) / 10;

// Stretches tab (routine and library, Experiment list, the week's check-offs) and Supplements tab (water log).
// `flag` is the save-status helper from the app store.
export const wellnessSlice = (set: StoreSet, get: StoreGet, flag: Flag): WellnessSlice => ({
  stretches: structuredClone(DEFAULT_STRETCHES), // the library: [{id, n, url, note, group, tier}]
  stretchExps: [], // stretches to try: [{id, n, url, note}]
  strWeek: normStretchWeek(null), // the viewed week's check-offs
  supp: normSupplements(null), // {waterGoal, water: {date: [oz]}}

  boardView: 'workout', // Board tab: 'workout' or 'stretches'
  setBoardView: boardView => set({ boardView }),
  dailyView: 'supplements', // which section of the Daily tab is open
  setDailyView: dailyView => set({ dailyView }),

  saveStretches() { get().saveDoc('stretches/main', { items: get().stretches, experiments: get().stretchExps }); },
  saveStrWeek() { get().saveDoc('stretchweeks/' + get().weekKey(), get().strWeek); },
  saveSupp() { get().saveDoc('supplements/main', get().supp); },
  mutateStretches(fn) {
    if (get().blocked()) return false;
    const d = structuredClone({ items: get().stretches, experiments: get().stretchExps }); fn(d);
    set({ stretches: d.items, stretchExps: d.experiments }); get().saveStretches(); return true;
  },
  mutateStrWeek(fn) {
    if (get().blocked()) return false;
    const w = structuredClone(get().strWeek); fn(w); set({ strWeek: w }); get().saveStrWeek(); return true;
  },
  mutateSupp(fn) {
    if (get().blocked()) return false;
    const s = structuredClone(get().supp); fn(s); set({ supp: s }); get().saveSupp(); return true;
  },
  // Applies a saved stretches doc (from storage or an import).
  setStretchDoc(doc) { const d = normStretches(doc); set({ stretches: d.items, stretchExps: d.experiments }); },

  /* Check-offs. `day` is 0-6 within the viewed week (Sunday first). */
  setStretchDone(day, id, on) { get().mutateStrWeek(w => { if (on) w.done[doneKey(day, id)] = true; else delete w.done[doneKey(day, id)]; }); },
  setStretchesDone(day, ids, on) { get().mutateStrWeek(w => ids.forEach(id => { if (on) w.done[doneKey(day, id)] = true; else delete w.done[doneKey(day, id)]; })); },

  // Skip (or un-skip) a whole day. Its ticks are kept, so undoing the skip brings them back.
  skipStretchDay(day, on) {
    if (get().mutateStrWeek(w => { if (on) w.skipped[day] = true; else delete w.skipped[day]; })) flag(on ? 'Day skipped' : 'Skip undone');
  },

  /* The library. Returns an error message, or null when saved. */
  saveStretch(d) {
    if (get().blocked()) return null;
    const n = (d.n || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!n) return 'Give the stretch a name.';
    const url = (d.url || '').trim();
    if (!isVideoUrl(url)) return VIDEO_ERR;
    const same = get().stretches.find(x => x.n.toLowerCase() === n.toLowerCase() && x.id !== d.id);
    if (same) return 'Another stretch already has that name.';
    const tier = d.tier === 'primary' || d.tier === 'secondary' ? d.tier : '';
    const group = (d.group || '').trim().slice(0, 40) || DEFAULT_GROUP; const note = (d.note || '').trim().slice(0, 200);
    get().mutateStretches(x => {
      const item = { id: d.id || newStretchId(x.items, n), n, group, tier, ...(url ? { url } : {}), ...(note ? { note } : {}) };
      const i = x.items.findIndex(y => y.id === item.id);
      if (i >= 0) x.items[i] = item; else x.items.push(item);
    });
    set({ modal: null }); flag('Stretch saved'); return null;
  },
  // Takes its check-offs out of the week on screen; other weeks keep theirs, which no longer match anything.
  deleteStretch(id) {
    if (!get().mutateStretches(x => { x.items = x.items.filter(y => y.id !== id); })) return;
    get().mutateStrWeek(w => { w.done = withoutStretch(w, id).done; });
    set({ modal: null }); flag('Deleted');
  },
  // Move a stretch up or down within its tier and group.
  moveStretch(id, dir) {
    get().mutateStretches(x => {
      const i = x.items.findIndex(y => y.id === id); if (i < 0) return;
      const me = x.items[i]; let j = i + dir;
      while (j >= 0 && j < x.items.length && !(x.items[j].tier === me.tier && x.items[j].group === me.group)) j += dir;
      if (j < 0 || j >= x.items.length) return;
      [x.items[i], x.items[j]] = [x.items[j], x.items[i]];
    });
  },

  /* Experiments: stretches to try, added to one day of the viewed week. */
  saveStretchExp(d) {
    if (get().blocked()) return null;
    const n = (d.n || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!n) return 'Give the stretch a name.';
    const url = (d.url || '').trim();
    if (!isVideoUrl(url)) return VIDEO_ERR;
    const note = (d.note || '').trim().slice(0, 200);
    get().mutateStretches(x => {
      const item = { id: d.id || uid('SE'), n, ...(url ? { url } : {}), ...(note ? { note } : {}) };
      const i = x.experiments.findIndex(y => y.id === item.id);
      if (i >= 0) x.experiments[i] = item; else x.experiments.push(item);
    });
    set({ modal: null }); flag('Saved'); return null;
  },
  deleteStretchExp(id) { if (get().mutateStretches(x => { x.experiments = x.experiments.filter(y => y.id !== id); })) flag('Deleted'); },
  // Add an experiment to a day of the viewed week: a card for that day only.
  addStretchToDay(expId, day) {
    const e = get().stretchExps.find(x => x.id === expId); if (!e || !(day >= 0 && day < STRETCH_DAYS)) return false;
    const ok = get().mutateStrWeek(w => { w.extra.push({ id: uid('SX'), day, n: e.n, ...(e.url ? { url: e.url } : {}), ...(e.note ? { note: e.note } : {}) }); });
    if (ok) flag(`Added ${e.n}`);
    return ok;
  },
  removeStretchExtra(id) {
    if (get().mutateStrWeek(w => { w.extra = w.extra.filter(x => x.id !== id); Object.keys(w.done).forEach(k => { if (k.slice(2) === id) delete w.done[k]; }); })) flag('Removed from this day');
  },

  /* Supplement library and schedule: Morning, Noon, Night. The same list every day; ticks are kept per date. */
  // From the Supplements tab: a new supplement straight into a section.
  addSupplement(slot, name, dose) {
    if (!SLOTS.some(([k]) => k === slot)) return false;
    const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60); if (!n) { flag('Give the supplement a name'); return false; }
    const dz = String(dose || '').trim().slice(0, 40);
    return get().mutateSupp(s => { s.items.push({ id: newSupplementId(s.items, n), n, slot, ...(dz ? { dose: dz } : {}) }); });
  },
  // Takes it off the schedule (slot ''), or puts a library one into a section. It stays in the library either way.
  setSupplementSlot(id, slot) { return get().mutateSupp(s => { const x = s.items.find(i => i.id === id); if (x && (slot === '' || SLOTS.some(([k]) => k === slot))) x.slot = slot; }); },
  removeSupplement(id) { return get().setSupplementSlot(id, ''); },
  // From the library sheet. Returns an error message, or null when saved.
  saveSupplement(d) {
    if (get().blocked()) return null;
    const n = String(d.n || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!n) return 'Give the supplement a name.';
    if (get().supp.items.some(x => x.n.toLowerCase() === n.toLowerCase() && x.id !== d.id)) return 'Another supplement already has that name.';
    const slot = SLOTS.some(([k]) => k === d.slot) ? d.slot : '';
    const dose = String(d.dose || '').trim().slice(0, 40); const note = String(d.note || '').trim().slice(0, 200);
    get().mutateSupp(s => {
      const item = { id: d.id || newSupplementId(s.items, n), n, slot, ...(dose ? { dose } : {}), ...(note ? { note } : {}) };
      const i = s.items.findIndex(x => x.id === item.id);
      if (i >= 0) s.items[i] = item; else s.items.push(item);
    });
    set({ modal: null }); flag('Supplement saved'); return null;
  },
  deleteSupplement(id) {
    if (!get().mutateSupp(s => {
      s.items = s.items.filter(x => x.id !== id);
      Object.keys(s.taken).forEach(d => { delete s.taken[d][id]; if (!Object.keys(s.taken[d]).length) delete s.taken[d]; });
    })) return;
    set({ modal: null }); flag('Deleted');
  },
  // Move up or down among the ones in the same section (or the same library-only group).
  moveSupplement(id, dir) {
    get().mutateSupp(s => {
      const i = s.items.findIndex(x => x.id === id); if (i < 0) return;
      let j = i + dir; while (j >= 0 && j < s.items.length && s.items[j].slot !== s.items[i].slot) j += dir;
      if (j < 0 || j >= s.items.length) return;
      [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
    });
  },
  setSupplementTaken(date, id, on) {
    return get().mutateSupp(s => {
      const t = { ...(s.taken[date] || {}) }; if (on) t[id] = true; else delete t[id];
      if (Object.keys(t).length) s.taken[date] = t; else delete s.taken[date];
    });
  },

  /* Water. `date` is 'YYYY-MM-DD'; each drink is kept on its own so the last one can be taken back. */
  addWater(date, oz) {
    const n = Number(oz); if (!validOz(n)) { flag('Enter ounces, up to 200'); return false; }
    return get().mutateSupp(s => { s.water[date] = [...(s.water[date] || []), r1(n)]; });
  },
  removeWater(date, i) {
    return get().mutateSupp(s => { const l = [...(s.water[date] || [])]; l.splice(i, 1); if (l.length) s.water[date] = l; else delete s.water[date]; });
  },
  setWaterGoal(raw) {
    const n = Number(raw); if (!validGoal(n)) { flag('Enter a daily goal between 8 and 500 oz'); return false; }
    return get().mutateSupp(s => { s.waterGoal = r1(n); s.waterMode = 'fixed'; });
  },
  // Extra water for a hot day or for training minutes. Clears the day's entry when both are off.
  setWaterBoost(date, patch) {
    if (patch.mins !== undefined && patch.mins !== '') {
      const m = Number(patch.mins); if (!Number.isFinite(m) || m < 0 || m > MAX_TRAIN_MIN) { flag(`Enter training minutes, up to ${MAX_TRAIN_MIN}`); return false; }
    }
    return get().mutateSupp(s => {
      const b = { ...((s.boost || {})[date] || {}) }; s.boost = { ...(s.boost || {}) };
      if (patch.hot !== undefined) { if (patch.hot) b.hot = true; else delete b.hot; }
      if (patch.mins !== undefined) { const m = Math.round(Number(patch.mins)); if (m > 0) b.mins = m; else delete b.mins; }
      if (Object.keys(b).length) s.boost[date] = b; else delete s.boost[date];
    });
  },
  setWaterByWeight() { return get().mutateSupp(s => { s.waterMode = 'weight'; }); },
});
