import { isVideoUrl, VIDEO_ERR } from '../lib/data.js';
import { DAY_NAMES } from '../shared/dates.js';
import { DEFAULT_STRETCHES, DEFAULT_GROUP, doneKey, newStretchId, normStretchWeek, normStretches, STRETCH_DAYS, withoutStretch } from '../lib/stretches.js';
import { SLOTS, newSupplementId } from '../lib/supplements.js';
import { MUSCLES } from '../lib/muscles.js';
import type { StretchTier, SupplementSlot } from '../types.ts';
import type { Flag, StoreGet, StoreSet, WellnessSlice } from './types.ts';
import { validOz, validGoal, normSupplements, MAX_TRAIN_MIN, fmtOz } from '../lib/water.js';

// The same supplement: name and brand, any case (a catalog supplement has a brand; your own has none).
const sameSupplement = (x: { n: string; brand?: string }, n: string, brand?: string) => x.n.toLowerCase() === n.toLowerCase() && (x.brand || '').toLowerCase() === (brand || '').toLowerCase();

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
    // A catalog stretch keeps its catalog id and name whatever else changes (ADR 026): the sheet shows no Name field for it.
    const cur = d.id ? get().stretches.find(x => x.id === d.id) : undefined;
    const url = (d.url || '').trim();
    if (!isVideoUrl(url)) return VIDEO_ERR;
    const same = get().stretches.find(x => x.n.toLowerCase() === n.toLowerCase() && x.id !== d.id);
    if (same) return 'Another stretch already has that name.';
    const tier = (d.tier === 'primary' || d.tier === 'secondary' ? d.tier : '') as StretchTier;
    const group = (d.group || '').trim().slice(0, 40) || DEFAULT_GROUP; const note = (d.note || '').trim().slice(0, 200);
    get().mutateStretches(x => {
      const item = { id: d.id || newStretchId(x.items, n), n: cur?.catalogId ? cur.n : n, group, tier, ...(url ? { url } : {}), ...(note ? { note } : {}), ...(cur?.catalogId ? { catalogId: cur.catalogId } : {}) };
      const i = x.items.findIndex(y => y.id === item.id);
      if (i >= 0) x.items[i] = item; else x.items.push(item);
    });
    set({ modal: null }); flag('Stretch saved'); return null;
  },
  // A catalog stretch joins the list as a snapshot (ADR 026): its name, grouped by its main muscle, kept in the library until you put it
  // on a day (Library only). It keeps its catalog id, so it shows as Library.
  addCatalogStretch(c) {
    if (get().blocked()) return null;
    const n = c.name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!n || !c.id.startsWith('c:') || c.id.length > 100) return 'That catalog item can’t be added.';
    const items = get().stretches;
    if (items.some(x => x.catalogId === c.id)) return 'Already in your stretches.';
    if (items.some(x => x.n.toLowerCase() === n.toLowerCase())) return `You already have a stretch called ${n}.`;
    const main = c.data.muscles?.p?.[0];
    const group = main && MUSCLES[main] ? MUSCLES[main].n : DEFAULT_GROUP;
    if (!get().mutateStretches(x => { x.items.push({ id: newStretchId(x.items, n), n, group, tier: '', catalogId: c.id }); })) return null;
    flag(`Added ${n}`); return null;
  },
  // Takes its check-offs out of the week on screen; other weeks keep theirs, which no longer match anything.
  // Undo puts it back where it was, with its ticks in that week if it is still the one on screen.
  deleteStretch(id) {
    const i = get().stretches.findIndex(y => y.id === id); if (i < 0) return;
    const item = get().stretches[i]; const wk = get().weekKey();
    const ticks = Object.keys(get().strWeek.done).filter(k => k.slice(2) === id);
    if (!get().mutateStretches(x => { x.items = x.items.filter(y => y.id !== id); })) return;
    get().mutateStrWeek(w => { w.done = withoutStretch(w, id).done; });
    set({ modal: null });
    get().noteRemoved('stretches', item.n, () => {
      if (get().stretches.some(y => y.id === id) || !get().mutateStretches(x => { x.items.splice(Math.min(i, x.items.length), 0, item); })) return false;
      if (ticks.length && get().weekKey() === wk) get().mutateStrWeek(w => { ticks.forEach(k => { w.done[k] = true; }); });
      return true;
    });
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
  deleteStretchExp(id) {
    const i = get().stretchExps.findIndex(y => y.id === id); if (i < 0) return;
    const e = get().stretchExps[i];
    if (!get().mutateStretches(x => { x.experiments = x.experiments.filter(y => y.id !== id); })) return;
    get().noteRemoved('stretchexps', e.n, () => !get().stretchExps.some(y => y.id === id) && get().mutateStretches(x => { x.experiments.splice(Math.min(i, x.experiments.length), 0, e); }));
  },
  // Add an experiment to a day of the viewed week: a card for that day only.
  addStretchToDay(expId, day) {
    const e = get().stretchExps.find(x => x.id === expId); if (!e || !(day >= 0 && day < STRETCH_DAYS)) return false;
    const ok = get().mutateStrWeek(w => { w.extra.push({ id: uid('SX'), day, n: e.n, ...(e.url ? { url: e.url } : {}), ...(e.note ? { note: e.note } : {}) }); });
    if (ok) flag(`Added ${e.n}`);
    return ok;
  },
  // Undo puts it back with its tick, in the same week (the notice belongs to that week and day).
  removeStretchExtra(id) {
    const w0 = get().strWeek; const i = w0.extra.findIndex(x => x.id === id); if (i < 0) return;
    const x0 = w0.extra[i]; const wk = get().weekKey(); const ticks = Object.keys(w0.done).filter(k => k.slice(2) === id);
    if (!get().mutateStrWeek(w => { w.extra = w.extra.filter(x => x.id !== id); Object.keys(w.done).forEach(k => { if (k.slice(2) === id) delete w.done[k]; }); })) return;
    get().noteRemoved(`sday:${wk}:${x0.day}`, `${x0.n} from ${DAY_NAMES[x0.day]}`, () => get().weekKey() === wk && !get().strWeek.extra.some(x => x.id === id) && get().mutateStrWeek(w => {
      w.extra.splice(Math.min(i, w.extra.length), 0, x0); ticks.forEach(k => { w.done[k] = true; });
    }));
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
  // Undo puts it back in that section, if it has not been scheduled somewhere since.
  removeSupplement(id) {
    const x0 = get().supp.items.find(x => x.id === id); if (!x0 || !x0.slot) return false;
    const slot = x0.slot;
    if (!get().setSupplementSlot(id, '')) return false;
    get().noteRemoved('suppslot:' + slot, `${x0.n} from ${SLOTS.find(([k]) => k === slot)?.[1] || slot}`, () => get().supp.items.find(x => x.id === id)?.slot === '' && get().setSupplementSlot(id, slot));
    return true;
  },
  // A catalog supplement joins the library as a snapshot (ADR 026, 029): name (cut to 60 characters) and brand, kept as Library only until
  // you schedule it, with your own dose. Never a dose from the catalog.
  addCatalogSupplement(c) {
    if (get().blocked()) return null;
    const full = c.name.trim().replace(/\s+/g, ' ');
    const n = full.length > 60 ? `${full.slice(0, 59).trimEnd()}…` : full;
    const brand = (c.brand || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!n || !c.id.startsWith('c:') || c.id.length > 100) return 'That catalog item can’t be added.';
    const items = get().supp.items;
    if (items.some(x => x.catalogId === c.id)) return 'Already in your supplements.';
    if (items.some(x => sameSupplement(x, n, brand))) return `You already have ${brand ? `${n} from ${brand}` : n}.`;
    if (!get().mutateSupp(s => { s.items.push({ id: newSupplementId(s.items, n), n, slot: '', ...(brand ? { brand } : {}), catalogId: c.id }); })) return null;
    flag(`Added ${n}`); return null;
  },
  // From the library sheet. Returns an error message, or null when saved. A catalog supplement keeps its name, brand and catalog id
  // (ADR 026): the sheet shows no Name field for it. Two supplements may share a name when their brands differ.
  saveSupplement(d) {
    if (get().blocked()) return null;
    const cur = d.id ? get().supp.items.find(x => x.id === d.id) : undefined;
    const n = cur?.catalogId ? cur.n : String(d.n || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!n) return 'Give the supplement a name.';
    if (get().supp.items.some(x => sameSupplement(x, n, cur?.brand) && x.id !== d.id)) return 'Another supplement already has that name.';
    const slot = (SLOTS.some(([k]) => k === d.slot) ? d.slot : '') as SupplementSlot;
    const dose = String(d.dose || '').trim().slice(0, 40); const note = String(d.note || '').trim().slice(0, 200);
    get().mutateSupp(s => {
      const item = { id: d.id || newSupplementId(s.items, n), n, slot, ...(dose ? { dose } : {}), ...(note ? { note } : {}), ...(cur?.catalogId ? { ...(cur.brand ? { brand: cur.brand } : {}), catalogId: cur.catalogId } : {}) };
      const i = s.items.findIndex(x => x.id === item.id);
      if (i >= 0) s.items[i] = item; else s.items.push(item);
    });
    set({ modal: null }); flag('Supplement saved'); return null;
  },
  // Undo puts it back where it was, with every day it was ticked.
  deleteSupplement(id) {
    const i = get().supp.items.findIndex(x => x.id === id); if (i < 0) return;
    const item = get().supp.items[i];
    const days = Object.keys(get().supp.taken).filter(d => get().supp.taken[d][id]);
    if (!get().mutateSupp(s => {
      s.items = s.items.filter(x => x.id !== id);
      Object.keys(s.taken).forEach(d => { delete s.taken[d][id]; if (!Object.keys(s.taken[d]).length) delete s.taken[d]; });
    })) return;
    set({ modal: null });
    get().noteRemoved('supplements', item.n, () => !get().supp.items.some(x => x.id === id) && get().mutateSupp(s => {
      s.items.splice(Math.min(i, s.items.length), 0, item);
      days.forEach(d => { s.taken[d] = { ...(s.taken[d] || {}), [id]: true }; });
    }));
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
    const oz = (get().supp.water[date] || [])[i]; if (oz == null) return false;
    if (!get().mutateSupp(s => { const l = [...(s.water[date] || [])]; l.splice(i, 1); if (l.length) s.water[date] = l; else delete s.water[date]; })) return false;
    // Drinks have no ids: Undo only while the day's list is as the removal left it, so a drink added again by hand is not doubled.
    const left = (get().supp.water[date] || []).join();
    get().noteRemoved('water:' + date, `${fmtOz(oz)} oz of water`, () => (get().supp.water[date] || []).join() === left && get().mutateSupp(s => { const l = [...(s.water[date] || [])]; l.splice(Math.min(i, l.length), 0, oz); s.water[date] = l; }));
    return true;
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
