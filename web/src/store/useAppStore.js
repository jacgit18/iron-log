import { create } from 'zustand';
import { BUILTIN, resolveProgram, slotsFor } from '../lib/data.js';
import { monday, ymd, addDays } from '../lib/dates.js';
import {
  DEFAULT_CFG, normWeek, activeProgKey, programFor, phaseOf, lastLog, describe,
  setCardDone, setItemDone, clearDone, isSkipped, isOpen, currentLayout, moveClashes, defaultLogDate,
} from '../lib/logic.js';
import { LS, makeSaveQueue } from '../lib/storage.js';

// Non-reactive handles for the async plumbing. `db` mirrors the optional Firestore-like host
// binding from the original app (window.claude.use('db')); without it everything uses localStorage.
let db = null;
let unsubWeek = null;
let flagT = null, flagHold = 0;
let initStarted = false;

const queue = makeSaveQueue({ getDb: () => db, onFlag: t => flag(t) });

export function flag(t) {
  const now = Date.now();
  if ((t === 'Saved' || t === 'Loading…' || t === '') && now < flagHold) return;
  if (t !== 'Saved' && t !== 'Loading…' && t !== '' && !/^Not saved|^Could/.test(t)) flagHold = now + 2500;
  useAppStore.setState({ saveFlag: t });
  clearTimeout(flagT);
  const clear = () => useAppStore.setState(s => (s.saveFlag === t ? { saveFlag: '' } : {}));
  if (t === 'Saved') flagT = setTimeout(clear, 1500);
  else if (flagHold > now) flagT = setTimeout(clear, 3500);
}

export const useAppStore = create((set, get) => ({
  cfg: structuredClone(DEFAULT_CFG),
  weekStart: monday(new Date()),
  week: normWeek(null),
  logs: {}, // exId -> [entries]
  tab: 'board',
  mDay: null, // day shown on phones; null = pick the first day with open work
  library: [], // saved program versions
  body: [], // body weight: [{wk, d, w}], one per week
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  storeMode: 'loading',
  saveFlag: '',
  ready: { cfg: false, logs: false, week: false, programs: false, lib: false, body: false },
  moveNote: null, // heads-up after a move puts the same exercise on the same or a neighboring day
  modal: null, // {type:'log', slotId, idx} | {type:'detail', exId}

  isReady: () => { const r = get().ready; return r.cfg && r.logs && r.week && r.programs && r.lib && r.body; },
  weekKey: () => ymd(get().weekStart),
  activeProgKey: () => activeProgKey(get().cfg, get().week, get().weekStart),
  activeProgram: () => { const s = get(); return s.programs[s.activeProgKey()] || s.programs.A; },
  activeSlots: () => slotsFor(get().activeProgram()),
  slotById: id => get().activeSlots().find(x => x.id === id),

  // Every write is refused until all data has loaded, so a half-loaded week never overwrites the saved one.
  blocked() { if (get().isReady()) return false; flag('Still loading your data…'); return true; },

  setTab: tab => set({ tab }),
  setMDay: mDay => set({ mDay }),
  openModal: modal => set({ modal }),
  closeModal: () => set({ modal: null }),

  saveCfg() { queue.save('config/main', get().cfg); },
  saveWeek() { queue.save('weeks/' + get().weekKey(), get().week); },
  saveBody() { queue.save('body/main', { entries: get().body }); },
  saveLibrary() { queue.save('library/main', { items: get().library }); },
  saveLog(exId) { queue.save('logs/' + exId, { entries: get().logs[exId] || [] }); },
  saveProgram(k, prog) {
    const body = structuredClone(prog); delete body.key;
    set(state => ({ programs: { ...state.programs, [k]: { ...body, key: k } } }));
    queue.save('programs/' + k, body);
  },
  saveDoc: (path, data) => queue.save(path, data),
  removeDoc: path => queue.removeDoc(path),

  mutateCfg(fn) {
    if (get().blocked()) return false;
    const cfg = structuredClone(get().cfg); fn(cfg); set({ cfg }); get().saveCfg(); return true;
  },
  mutateWeek(fn) {
    if (get().blocked()) return false;
    const week = structuredClone(get().week); fn(week); set({ week }); get().saveWeek(); return true;
  },

  checkCard(slotId, on) { const s = get().slotById(slotId); if (s) get().mutateWeek(w => setCardDone(w, s, on)); },
  checkItem(slotId, idx, on) { const s = get().slotById(slotId); if (s) get().mutateWeek(w => setItemDone(w, s, idx, on)); },
  checkDay(day, on) {
    const slots = get().activeSlots();
    get().mutateWeek(w => currentLayout(w, slots)[day].forEach(s => { if (!isSkipped(s, w)) setCardDone(w, s, on); }));
  },
  skipCard(slotId) {
    const s = get().slotById(slotId); let skipped = false;
    const ok = get().mutateWeek(w => {
      w.skipped = w.skipped || {};
      if (w.skipped[slotId]) delete w.skipped[slotId];
      else { w.skipped[slotId] = true; skipped = true; if (s) clearDone(w, s); else delete w.done[slotId]; }
    });
    if (ok) flag(skipped ? 'Skipped for this week' : 'Skip undone');
  },
  setWarm(day, wid, on) { get().mutateWeek(w => { w.warm[day] = w.warm[day] || {}; w.warm[day][wid] = on; }); },
  setPhase(slotId, idx, ph) { get().mutateWeek(w => { w.ph[`${slotId}:${idx}`] = ph; }); },
  setWeekProg(k) { const auto = programFor(get().cfg, get().weekStart); get().mutateWeek(w => { w.prog = k === auto ? null : k; }); },
  setMode(mode) { get().mutateCfg(c => { c.mode = mode; }); },
  pullUnfinished() {
    const slots = get().activeSlots();
    get().mutateWeek(w => slots.forEach(s => { if (s.day < 5 && (w.moved[s.id] || s.day) < 5 && isOpen(s, w)) w.moved[s.id] = 5; }));
  },

  moveSlot(slotId, day) {
    const s = get().slotById(slotId); if (!s) return;
    const from = get().week.moved[slotId] || s.day;
    const ok = get().mutateWeek(w => { if (day === s.day) delete w.moved[slotId]; else w.moved[slotId] = day; });
    if (!ok) return;
    const { cfg, week } = get();
    const clashes = moveClashes(cfg, week, get().activeSlots(), s, day);
    set({ moveNote: clashes.length ? { slot: slotId, from, to: day, week: get().weekKey(), lines: clashes } : null });
    flag(clashes.length ? `Moved to Day ${day} · heads-up` : `Moved to Day ${day}`);
  },
  undoMove() {
    const n = get().moveNote; if (!n || n.week !== get().weekKey()) return;
    const s = get().slotById(n.slot); set({ moveNote: null });
    if (s && get().mutateWeek(w => { if (n.from === s.day) delete w.moved[n.slot]; else w.moved[n.slot] = n.from; })) flag(`Moved back to Day ${n.from}`);
  },
  dismissMove: () => set({ moveNote: null }),

  gotoWeek(which) {
    const cur = get().weekStart;
    set({ mDay: null, moveNote: null, weekStart: which === 'today' ? monday(new Date()) : addDays(cur, which === 'prev' ? -7 : 7) });
    subscribeWeek();
  },

  // Append a log entry (kept sorted by date), optionally checking the exercise off.
  addEntry(slotId, idx, entry, { check } = {}) {
    if (get().blocked()) return false;
    const s = get().slotById(slotId); if (!s) return false;
    const ex = s.items[idx].ex;
    const arr = [...(get().logs[ex] || []), structuredClone(entry)].sort((a, b) => a.d.localeCompare(b.d));
    set(state => ({ logs: { ...state.logs, [ex]: arr } })); get().saveLog(ex);
    if (check) get().mutateWeek(w => setItemDone(w, s, idx, true));
    return true;
  },
  quickLog(slotId, idx) {
    const s = get().slotById(slotId); if (!s) return;
    const { cfg, week, logs } = get();
    const last = lastLog(logs, s.items[idx].ex, phaseOf(cfg, week, s, idx)); if (!last) return;
    const e = { d: defaultLogDate(get().weekStart), ph: last.ph || null, w: last.w, s: last.s, slot: slotId, wk: get().weekKey() };
    if (last.sec != null) e.sec = last.sec; else e.r = last.r;
    if (Array.isArray(last.sets)) e.sets = structuredClone(last.sets);
    if (get().addEntry(slotId, idx, e, { check: true })) flag(`Logged ${describe(e)}`);
  },
  // The log sheet's save: entry + optional phase change / phase default / 1RM / check-off.
  submitLog(slotId, idx, { entry, ph, makeDefault, rm, done }) {
    if (get().blocked()) return false;
    const s = get().slotById(slotId); if (!s) return false;
    const it = s.items[idx]; const key = `${slotId}:${idx}`;
    get().addEntry(slotId, idx, entry);
    const { cfg, week } = get();
    const cfgChange = (makeDefault && ph) || (rm === null ? cfg.rm[it.ex] != null : (rm > 0 && rm !== cfg.rm[it.ex]));
    if (cfgChange) get().mutateCfg(c => {
      if (makeDefault && ph) c.phDef[key] = ph;
      if (rm === null) delete c.rm[it.ex]; else if (rm > 0) c.rm[it.ex] = rm;
    });
    get().mutateWeek(w => {
      if (ph && ph !== phaseOf(cfg, week, s, idx)) w.ph[key] = ph;
      if (makeDefault && ph) delete w.ph[key];
      if (done) setItemDone(w, s, idx, true);
    });
    return true;
  },
  deleteLog(exId, i) {
    if (get().blocked()) return;
    const arr = [...(get().logs[exId] || [])]; arr.splice(i, 1);
    set(state => ({ logs: { ...state.logs, [exId]: arr } })); get().saveLog(exId);
  },

  saveBodyWeight(v) {
    if (get().blocked()) return false;
    const n = Number(v); if (!(n > 0 && n < 1500)) { flag('Enter your weight in lb'); return false; }
    const wk = get().weekKey(); const today = ymd(new Date());
    const d = (today >= wk && today <= ymd(addDays(get().weekStart, 6))) ? today : wk;
    set(state => ({ body: [...state.body.filter(e => e.wk !== wk), { wk, d, w: Math.round(n * 10) / 10 }].sort((a, b) => a.wk.localeCompare(b.wk)) }));
    get().saveBody(); flag('Body weight saved'); return true;
  },
  deleteBodyWeight(wk) {
    if (get().blocked()) return;
    set(state => ({ body: state.body.filter(x => x.wk !== wk) })); get().saveBody(); flag('Deleted');
  },

  async init() {
    if (initStarted) return; // StrictMode runs mount effects twice in dev; subscribe once
    initStarted = true;
    try { db = (window.claude && window.claude.use) ? await window.claude.use('db') : null; } catch { db = null; }
    if (!db) {
      const cfgRaw = LS.get('config/main');
      const logs = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ironlog:logs/')) { const l = LS.get(k.slice(8)); if (l && l.entries) logs[k.slice(13)] = l.entries; }
        }
      } catch { /* storage unavailable */ }
      set(state => ({
        storeMode: 'local',
        cfg: cfgRaw ? { ...structuredClone(DEFAULT_CFG), ...cfgRaw } : state.cfg,
        body: (LS.get('body/main') || {}).entries || [],
        library: (LS.get('library/main') || {}).items || [],
        logs,
        programs: { A: resolveProgram('A', LS.get('programs/A')), B: resolveProgram('B', LS.get('programs/B')) },
        ready: { ...state.ready, cfg: true, logs: true, programs: true, lib: true, body: true },
      }));
      subscribeWeek();
      return;
    }
    set({ storeMode: 'db' });
    const markReady = k => state => ({ ready: { ...state.ready, [k]: true } });
    db.collection('programs').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      const m = {}; s.docs.forEach(d => { m[d.id] = d.data(); });
      set(state => ({ programs: { A: resolveProgram('A', m.A), B: resolveProgram('B', m.B) }, ...markReady('programs')(state) }));
    }, () => flag('Couldn’t load your programs. Reload the page.'));
    db.doc('body/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ body: s.exists ? [...((s.data() || {}).entries || [])] : [], ...markReady('body')(state) }));
    }, () => flag('Couldn’t load body weight. Reload the page.'));
    db.doc('library/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ library: s.exists ? [...((s.data() || {}).items || [])] : [], ...markReady('lib')(state) }));
    }, () => flag('Couldn’t load saved programs. Reload the page.'));
    db.doc('config/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ cfg: s.exists ? { ...structuredClone(DEFAULT_CFG), ...structuredClone(s.data()) } : state.cfg, ...markReady('cfg')(state) }));
    }, () => flag('Couldn’t load settings. Reload the page.'));
    db.collection('logs').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      const next = {}; s.docs.forEach(d => { next[d.id] = [...((d.data() || {}).entries || [])]; });
      set(state => ({ logs: next, ...markReady('logs')(state) }));
    }, () => flag('Couldn’t load your log. Reload the page.'));
    subscribeWeek();
  },
}));

function subscribeWeek() {
  if (unsubWeek) { unsubWeek(); unsubWeek = null; }
  const key = useAppStore.getState().weekKey();
  if (!db) {
    const ready = useAppStore.getState().storeMode === 'local';
    useAppStore.setState(state => ({ week: normWeek(LS.get('weeks/' + key)), mDay: ready ? null : state.mDay, ready: { ...state.ready, week: ready } }));
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
  }, () => flag('Couldn’t load this week. Reload the page.'));
}
