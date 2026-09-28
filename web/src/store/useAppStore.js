import { create } from 'zustand';
import { BUILTIN, resolveProgram } from '../lib/data.js';
import { monday, ymd } from '../lib/dates.js';
import {
  DEFAULT_CFG, normWeek, activeProgKey,
  setCardDone, setItemDone, clearDone,
} from '../lib/logic.js';
import { LS, makeSaveQueue } from '../lib/storage.js';

// Non-reactive handles the store's async plumbing needs but that no component should
// re-render on. `db` mirrors the optional Firestore-like host binding from the original
// app (window.claude.use('db')); everything falls back to localStorage without it.
let db = null;
let unsubWeek = null;
let flagT = null, flagHold = 0;

const queue = makeSaveQueue({
  getDb: () => db,
  onFlag: t => setFlag(t),
});

function setFlag(t) {
  const now = Date.now();
  if ((t === 'Saved' || t === 'Loading…' || t === '') && now < flagHold) return;
  if (t !== 'Saved' && t !== 'Loading…' && t !== '' && !/^Not saved|^Could/.test(t)) flagHold = now + 2500;
  useAppStore.setState({ saveFlag: t });
  clearTimeout(flagT);
  if (t === 'Saved') flagT = setTimeout(() => useAppStore.setState(s => s.saveFlag === t ? { saveFlag: '' } : {}), 1500);
  else if (flagHold > now) flagT = setTimeout(() => useAppStore.setState(s => s.saveFlag === t ? { saveFlag: '' } : {}), 3500);
}

const weekKeyOf = weekStart => ymd(weekStart);

export const useAppStore = create((set, get) => ({
  cfg: structuredClone(DEFAULT_CFG),
  weekStart: monday(new Date()),
  week: normWeek(null),
  logs: {}, // exId -> [entries]
  tab: 'board',
  mDay: null, // day shown on phones
  library: [], // saved program versions
  body: [], // body weight: [{wk, d, w}], one per week
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  storeMode: 'loading',
  saveFlag: '',
  ready: { cfg: false, logs: false, week: false, programs: false, lib: false, body: false },

  isReady: () => { const r = get().ready; return r.cfg && r.logs && r.week && r.programs && r.lib && r.body; },
  weekKey: () => weekKeyOf(get().weekStart),
  activeProgKey: () => activeProgKey(get().cfg, get().week, get().weekStart),
  activeProgram: () => { const s = get(); return s.programs[s.activeProgKey()] || s.programs.A; },

  setTab: tab => set({ tab, ...(tab === 'progress' ? {} : {}) }),
  setMDay: mDay => set({ mDay }),

  applyProgram(k, data) { set(state => ({ programs: { ...state.programs, [k]: resolveProgram(k, data) } })); },

  saveCfg() { queue.save('config/main', get().cfg); },
  saveWeek() { queue.save('weeks/' + get().weekKey(), get().week); },
  saveBody() { queue.save('body/main', { entries: get().body }); },
  saveLibrary() { queue.save('library/main', { items: get().library }); },
  saveLog(exId) { queue.save('logs/' + exId, { entries: get().logs[exId] || [] }); },

  setCfg(patch) { set(state => ({ cfg: { ...state.cfg, ...patch } })); get().saveCfg(); },
  setBody(body) { set({ body }); get().saveBody(); },
  setLibrary(library) { set({ library }); get().saveLibrary(); },
  setLog(exId, entries) { set(state => ({ logs: { ...state.logs, [exId]: entries } })); get().saveLog(exId); },

  // Mutates a draft of `week` via the pure helpers in logic.js, then persists it.
  mutateWeek(fn) {
    const week = structuredClone(get().week);
    fn(week);
    set({ week });
    get().saveWeek();
  },
  checkCard(slot, on) { get().mutateWeek(w => setCardDone(w, slot, on)); },
  checkItem(slot, idx, on) { get().mutateWeek(w => setItemDone(w, slot, idx, on)); },
  skipCard(slotId, slot) {
    get().mutateWeek(w => {
      w.skipped = w.skipped || {};
      if (w.skipped[slotId]) delete w.skipped[slotId];
      else { w.skipped[slotId] = true; if (slot) clearDone(w, slot); else delete w.done[slotId]; }
    });
  },

  gotoWeek(which) {
    set({ mDay: null });
    const cur = get().weekStart;
    const next = which === 'today' ? monday(new Date()) : new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + (which === 'prev' ? -7 : 7));
    set({ weekStart: next });
    subscribeWeek();
  },

  async init() {
    initDownloads_noop();
    try { db = (window.claude && window.claude.use) ? await window.claude.use('db') : null; } catch (e) { db = null; }
    if (!db) {
      const cfgRaw = LS.get('config/main');
      const bodyEntries = (LS.get('body/main') || {}).entries || [];
      const libItems = (LS.get('library/main') || {}).items || [];
      const logs = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ironlog:logs/')) { const l = LS.get(k.slice(8)); if (l && l.entries) logs[k.slice(13)] = l.entries; }
        }
      } catch (e) { /* ignore */ }
      set(state => ({
        storeMode: 'local',
        cfg: cfgRaw ? { ...structuredClone(DEFAULT_CFG), ...cfgRaw } : state.cfg,
        body: bodyEntries,
        library: libItems,
        logs,
        programs: { A: resolveProgram('A', LS.get('programs/A')), B: resolveProgram('B', LS.get('programs/B')) },
        ready: { ...state.ready, cfg: true, logs: true, programs: true, lib: true, body: true },
      }));
      subscribeWeek();
      return;
    }
    set({ storeMode: 'db' });
    db.collection('programs').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      const m = {}; s.docs.forEach(d => m[d.id] = d.data());
      set(state => ({ programs: { A: resolveProgram('A', m.A), B: resolveProgram('B', m.B) }, ready: { ...state.ready, programs: true } }));
    }, () => setFlag('Couldn’t load your programs. Reload the page.'));
    db.doc('body/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ body: s.exists ? [...((s.data() || {}).entries || [])] : [], ready: { ...state.ready, body: true } }));
    }, () => setFlag('Couldn’t load body weight. Reload the page.'));
    db.doc('library/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ library: s.exists ? [...((s.data() || {}).items || [])] : [], ready: { ...state.ready, lib: true } }));
    }, () => setFlag('Couldn’t load saved programs. Reload the page.'));
    db.doc('config/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ cfg: s.exists ? { ...structuredClone(DEFAULT_CFG), ...structuredClone(s.data()) } : state.cfg, ready: { ...state.ready, cfg: true } }));
    }, () => setFlag('Couldn’t load settings. Reload the page.'));
    db.collection('logs').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      const next = {}; s.docs.forEach(d => { next[d.id] = [...((d.data() || {}).entries || [])]; });
      set(state => ({ logs: next, ready: { ...state.ready, logs: true } }));
    }, () => setFlag('Couldn’t load your log. Reload the page.'));
    subscribeWeek();
  },
}));

function initDownloads_noop() { /* placeholder until export.js is ported */ }

function subscribeWeek() {
  if (unsubWeek) { unsubWeek(); unsubWeek = null; }
  const key = useAppStore.getState().weekKey();
  if (!db) {
    const week = normWeek(LS.get('weeks/' + key));
    const ready = useAppStore.getState().storeMode === 'local';
    useAppStore.setState(state => ({ week, mDay: ready ? null : state.mDay, ready: { ...state.ready, week: ready } }));
    return;
  }
  useAppStore.setState(state => ({ week: normWeek(null), ready: { ...state.ready, week: false } }));
  let first = true;
  unsubWeek = db.doc('weeks/' + key).onSnapshot(s => {
    if (key !== useAppStore.getState().weekKey()) return;
    if (s.metadata.hasPendingWrites) return;
    const week = normWeek(s.exists ? s.data() : null);
    useAppStore.setState(state => ({ week, mDay: first ? null : state.mDay, ready: { ...state.ready, week: true } }));
    first = false;
  }, () => setFlag('Couldn’t load this week. Reload the page.'));
}
