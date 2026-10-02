import { create } from 'zustand';
import { BUILTIN, resolveProgram, padLibrary, exInfo, newExId } from '../lib/data.js';
import { monday, ymd, addDays } from '../lib/dates.js';
import {
  DEFAULT_CFG, normWeek, activeProgKey, programFor, phaseOf, lastLog, describe,
  setCardDone, setItemDone, clearDone, isSkipped, currentLayout, dayAt, colOf, orderOf, DAYS, restBlocked, moveClashes, altDay, defaultLogDate, autoLogs, weekSlots,
} from '../lib/logic.js';
import { LS, makeSaveQueue } from '../lib/storage.js';
import { editorSlice } from './editorSlice.js';
import { settingsSlice } from './settingsSlice.js';
import { WEEK_RE, entryWeek, weekSummary } from '../lib/trends.js';
import {
  loadXLSX, buildCsv, buildOverallWorkbook, buildWeekWorkbook, buildDataFile, utf8b64,
  backupCfg, backupError, weekFingerprint, GH_SERVER, GH_TOOL, ghCfg, dataFingerprint, parseDataFile,
} from '../lib/export.js';
import { commitFiles, readFile, validRepo } from '../lib/github.js';

// Non-reactive handles for the async plumbing. `db` mirrors the optional Firestore-like host
// binding from the original app (window.claude.use('db')); without it everything uses localStorage.
let db = null;
let unsubWeek = null;
let flagT = null, flagHold = 0;
let initStarted = false;
let histPromise = null;

// Outside the Claude host, downloads are a plain blob link.
const blobSave = {
  save: async ({ filename, data }) => {
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'saved' };
  },
};

// The GitHub token for the standalone app. Kept in this browser only, outside the config, because the
// config is written into the backup files.
const TOKEN_KEY = 'ironlog-gh-token';
const readToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } };
// Standalone (e.g. GitHub Pages) rather than inside the Claude host, which backs up through its connector.
const standalone = typeof window !== 'undefined' && !window.claude;

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const queue = makeSaveQueue({ getDb: () => db, onFlag: t => flag(t) });

// Status line. Messages stay until the next tap or key press (no timer, WCAG 2.2.3), and a routine
// "Saved" / "Loading…" never replaces a message you haven't had the chance to act on yet.
export function flag(t) {
  const routine = t === 'Saved' || t === 'Loading…' || t === '';
  if (routine && flagHold) return;
  flagHold = !routine && !/^Not saved|^Could/.test(t);
  useAppStore.setState({ saveFlag: t });
  clearTimeout(flagT);
  if (!t) return;
  // Arm after this event finishes, so the tap that caused the message doesn't clear it.
  flagT = setTimeout(() => {
    const clear = () => {
      ['pointerdown', 'keydown'].forEach(ev => document.removeEventListener(ev, clear, true));
      flagHold = false;
      useAppStore.setState(s => (s.saveFlag === t ? { saveFlag: '' } : {}));
    };
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, clear, true));
  }, 0);
}

export const useAppStore = create((set, get) => ({
  ...editorSlice(set, get, flag),
  ...settingsSlice(set, get, flag),
  cfg: structuredClone(DEFAULT_CFG),
  weekStart: monday(new Date()),
  week: normWeek(null),
  logs: {}, // exId -> [entries]
  tab: 'board',
  mDay: null, // day shown on phones; null = pick the first day with open work
  library: [], // saved program versions
  experiments: [], // exercises to try: [{id, ex, ph, note}]
  body: [], // body weight: [{wk, d, w}], one per week
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  storeMode: 'loading',
  saveFlag: '',
  ready: { cfg: false, logs: false, week: false, programs: false, lib: false, body: false, exp: false },
  moveNote: null, // heads-up after a move puts the same exercise on the same or a neighboring day
  modal: null, // {type:'log', slotId, idx} | {type:'detail', exId}
  weekHist: null, // every saved week, loaded on demand for Progress and exports
  historyLoading: false,
  dl: undefined, // downloads handle: undefined = not checked yet, null = unavailable
  mcp: undefined, // connector handle for GitHub backup (Claude-hosted only)
  backupBusy: false,
  backupMsg: null, // {kind:'info'|'ok'|'err', text, url?}
  snoozeBackup: false,
  ghDirect: standalone, // back up with the viewer's own GitHub token
  ghToken: standalone ? readToken() : '',

  // Muscles tab view state; kept here so it survives switching tabs, like the original.
  bodyView: null, // 'A' | 'B'; null = the program on the board
  bodySel: null, // selected muscle key
  bodySec: true, // count secondary work as half a set
  setBodyView: bodyView => set({ bodyView }),
  selectMuscle: bodySel => set({ bodySel }),
  setBodySec: bodySec => set({ bodySec }),
  saveTags(exId, tags) {
    if (get().mutateCfg(c => { c.muscleMap = c.muscleMap || {}; c.muscleMap[exId] = tags; })) { set({ modal: null }); flag('Muscles saved'); }
  },
  resetTags(exId) {
    if (get().mutateCfg(c => { if (c.muscleMap) delete c.muscleMap[exId]; })) set({ modal: null });
  },

  snapshot: () => { const s = get(); return { cfg: s.cfg, logs: s.logs, programs: s.programs, library: s.library, body: s.body, experiments: s.experiments }; },

  // Callers that arrive while a load is running wait for that same load.
  loadHistory() {
    if (histPromise) return histPromise;
    set({ historyLoading: true });
    histPromise = (async () => {
      const out = {};
      try {
        if (db) { const snap = await db.collection('weeks').get(); snap.docs.forEach(d => { if (d.exists) out[d.id] = d.data(); }); }
        else {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('ironlog:weeks/')) { const v = LS.get(k.slice(8)); if (v) out[k.slice(14)] = v; }
          }
        }
      } catch { /* show what loaded */ }
      set({ weekHist: out, historyLoading: false });
    })().finally(() => { histPromise = null; });
    return histPromise;
  },
  // All saved weeks, with the week on screen taken live from state.
  async allWeeks() {
    if (!get().weekHist) await get().loadHistory();
    return { ...(get().weekHist || {}), [get().weekKey()]: get().week };
  },

  isReady: () => { const r = get().ready; return r.cfg && r.logs && r.week && r.programs && r.lib && r.body && r.exp; },
  weekKey: () => ymd(get().weekStart),
  activeProgKey: () => activeProgKey(get().cfg, get().week, get().weekStart),
  activeProgram: () => { const s = get(); return s.programs[s.activeProgKey()] || s.programs.A; },
  activeSlots: () => weekSlots(get().activeProgram(), get().week),
  slotById: id => get().activeSlots().find(x => x.id === id),

  // Every write is refused until all data has loaded, so a half-loaded week never overwrites the saved one.
  blocked() { if (get().isReady()) return false; flag('Still loading your data…'); return true; },

  // Opening Progress reloads the saved weeks so the history is never stale.
  setTab: tab => set(tab === 'progress' ? { tab, weekHist: null } : { tab }),
  setMDay: mDay => set({ mDay }),
  openModal: modal => set({ modal }),
  closeModal: () => set({ modal: null }),

  saveCfg() { queue.save('config/main', get().cfg); },
  saveWeek() { queue.save('weeks/' + get().weekKey(), get().week); },
  saveBody() { queue.save('body/main', { entries: get().body }); },
  saveLibrary() { queue.save('library/main', { items: get().library }); },
  saveExperiments() { queue.save('experiments/main', { items: get().experiments }); },
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

  // A change to check-offs from the board: exercises that became done log their planned numbers,
  // and ones that were unchecked (or skipped) lose that entry.
  mutateChecks(fn) {
    const slots = get().activeSlots(); const before = get().week;
    if (!get().mutateWeek(fn)) return false;
    const changed = autoLogs(get().cfg, get().logs, slots, before, get().week, get().weekKey(), defaultLogDate(get().weekStart));
    if (Object.keys(changed).length) {
      set(state => ({ logs: { ...state.logs, ...changed } }));
      Object.keys(changed).forEach(id => get().saveLog(id));
    }
    return true;
  },
  checkCard(slotId, on) { const s = get().slotById(slotId); if (s) get().mutateChecks(w => setCardDone(w, s, on)); },
  checkItem(slotId, idx, on) { const s = get().slotById(slotId); if (s) get().mutateChecks(w => setItemDone(w, s, idx, on)); },
  checkDay(day, on) {
    const slots = get().activeSlots();
    get().mutateChecks(w => currentLayout(w, slots)[day].forEach(s => { if (!isSkipped(s, w)) setCardDone(w, s, on); }));
  },
  skipCard(slotId) {
    const s = get().slotById(slotId); let skipped = false;
    const ok = get().mutateChecks(w => {
      w.skipped = w.skipped || {};
      if (w.skipped[slotId]) delete w.skipped[slotId];
      else { w.skipped[slotId] = true; skipped = true; if (s) clearDone(w, s); else delete w.done[slotId]; }
    });
    if (ok) flag(skipped ? 'Skipped for this week' : 'Skip undone');
  },
  // Yesterday's leftovers: skip or move a batch of cards at once.
  skipCards(ids) {
    const ok = get().mutateChecks(w => ids.forEach(id => { const s = get().slotById(id); w.skipped[id] = true; if (s) clearDone(w, s); }));
    if (ok) flag(`Skipped ${ids.length} for this week`);
  },
  moveCards(ids, day) {
    const week0 = get().week; const pd = dayAt(week0, day);
    if (pd == null) { flag('That is your rest day'); return; }
    const cards = ids.map(id => get().slotById(id)).filter(Boolean); if (!cards.length) return;
    const batch = Object.fromEntries(cards.map(s => [s.id, week0.moved[s.id] ?? null])); // what undo puts back
    if (!get().mutateWeek(w => cards.forEach(s => { if (pd === s.day) delete w.moved[s.id]; else w.moved[s.id] = pd; }))) return;
    const { cfg, week } = get(); const slots = get().activeSlots();
    const lines = [...new Set(cards.flatMap(s => moveClashes(cfg, week, slots, s, day)))];
    const fromShown = colOf(week0, week0.moved[cards[0].id] || cards[0].day);
    set({ moveNote: lines.length ? { batch, fromShown, to: day, week: get().weekKey(), lines } : null });
    flag(`Moved ${cards.length} to Day ${day}${lines.length ? ' · heads-up' : ''}`);
  },
  // Experiment board: a list of exercises to try, added to a day of the viewed week as a card for that week.
  setExperiments(experiments) { set({ experiments }); get().saveExperiments(); },
  saveExperiment(d) {
    if (get().blocked()) return null;
    if (!d.ex || (d.ex === '__new' && !d.nn)) return 'Choose an exercise, or type a name for the new one.';
    if (d.ex === '__new' && d.nu && !/^https?:\/\//.test(d.nu)) return 'Video link should start with https://';
    let ex = d.ex;
    if (ex === '__new') { ex = newExId(get().cfg, d.nn); get().mutateCfg(c => { c.ex[ex] = { n: d.nn, ...(d.nu ? { url: d.nu } : {}) }; }); }
    const item = { id: d.id || uid('E'), ex, ph: d.ph || null, note: (d.note || '').trim() };
    const list = get().experiments;
    get().setExperiments(d.id ? list.map(x => (x.id === d.id ? item : x)) : [...list, item]);
    set({ modal: null }); flag('Saved'); return null;
  },
  deleteExperiment(id) { if (get().blocked()) return; get().setExperiments(get().experiments.filter(x => x.id !== id)); flag('Deleted'); },
  addToDay(entryId, col) {
    const e = get().experiments.find(x => x.id === entryId); if (!e) return false;
    const pd = dayAt(get().week, col); if (pd == null) { flag('That is your rest day'); return false; }
    const ok = get().mutateWeek(w => { w.extra = [...(w.extra || []), { id: uid('X-'), day: pd, ex: e.ex, ph: e.ph ?? null, note: e.note || '' }]; });
    if (ok) flag(`Added ${exInfo(get().cfg, e.ex).n} to Day ${col}`);
    return ok;
  },
  removeExtra(slotId) {
    const s = get().slotById(slotId); if (!s || !s.experiment) return;
    const ok = get().mutateChecks(w => {
      clearDone(w, s); delete w.skipped[slotId]; delete w.moved[slotId]; delete w.ph[`${slotId}:0`];
      w.extra = (w.extra || []).filter(x => x.id !== slotId); if (!w.extra.length) delete w.extra;
    });
    if (!ok) return;
    if (get().moveNote && get().moveNote.slot === slotId) set({ moveNote: null });
    flag('Removed from this week');
  },
  setWarm(day, wid, on) {
    const pd = dayAt(get().week, day); if (pd == null) return;
    get().mutateWeek(w => { w.warm[pd] = w.warm[pd] || {}; w.warm[pd][wid] = on; });
  },
  // Tick or untick the rest day. One per week; ticking another day moves it.
  setRestDay(n) {
    const w = get().week;
    if (w.rest !== n && restBlocked(w, get().activeSlots())) { flag('Day 7 has exercises, so there is no room to add a rest day. Move or clear them, or swap the empty day back to the end.'); return false; }
    set({ moveNote: null });
    const date = defaultLogDate(get().weekStart);
    return get().mutateWeek(x => { if (x.rest === n) { delete x.rest; delete x.restOn; } else { x.rest = n; x.restOn = x.restOn || date; } });
  },
  // Swap displayed column d with its neighbor d + dir, for this week. Swapping with the rest column moves the rest day.
  swapDays(d, dir) {
    const e = d + dir; if (e < 1 || e > DAYS.length) return false;
    const w = get().week; const restInvolved = w.rest === d || w.rest === e;
    const ok = get().mutateWeek(x => {
      if (restInvolved) x.rest = x.rest === d ? e : d;
      else {
        const a = dayAt(x, d), b = dayAt(x, e); const o = [...orderOf(x)];
        const i = o.indexOf(a), j = o.indexOf(b); [o[i], o[j]] = [o[j], o[i]];
        if (o.every((v, k) => v === k + 1)) delete x.order; else x.order = o;
      }
    });
    if (!ok) return false;
    set({ moveNote: null, mDay: e });
    flag(restInvolved ? `Rest day moved to Day ${get().week.rest}` : `Day ${d} swapped with Day ${e}`);
    return true;
  },
  setPhase(slotId, idx, ph) { get().mutateWeek(w => { w.ph[`${slotId}:${idx}`] = ph; }); },
  setWeekProg(k) { const auto = programFor(get().cfg, get().weekStart); get().mutateWeek(w => { w.prog = k === auto ? null : k; }); },
  setMode(mode) { get().mutateCfg(c => { c.mode = mode; }); },

  moveSlot(slotId, day) {
    const s = get().slotById(slotId); if (!s) return;
    const week0 = get().week;
    const pd = dayAt(week0, day); // `day` is the displayed column; cards are stored by program day
    if (pd == null) { flag('That is your rest day'); return; }
    const from = week0.moved[slotId] || s.day;
    const ok = get().mutateWeek(w => { if (pd === s.day) delete w.moved[slotId]; else w.moved[slotId] = pd; });
    if (!ok) return;
    const { cfg, week } = get();
    const slots = get().activeSlots(); const clashes = moveClashes(cfg, week, slots, s, day);
    const fromShown = colOf(week0, from);
    set({ moveNote: clashes.length ? { slot: slotId, from, fromShown, to: day, week: get().weekKey(), lines: clashes, alt: altDay(cfg, week, slots, s, day, fromShown) } : null });
    flag(clashes.length ? `Moved to Day ${day} · heads-up` : `Moved to Day ${day}`);
  },
  undoMove() {
    const n = get().moveNote; if (!n || n.week !== get().weekKey()) return;
    if (n.batch) {
      set({ moveNote: null });
      if (get().mutateWeek(w => Object.entries(n.batch).forEach(([id, v]) => { if (v == null) delete w.moved[id]; else w.moved[id] = v; }))) flag(`Moved back to Day ${n.fromShown}`);
      return;
    }
    const s = get().slotById(n.slot); set({ moveNote: null });
    if (s && get().mutateWeek(w => { if (n.from === s.day) delete w.moved[n.slot]; else w.moved[n.slot] = n.from; })) flag(`Moved back to Day ${n.fromShown}`);
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
    // Real numbers replace the planned ones a check-off logged for this card this week.
    const planned = e => e.auto && e.slot === entry.slot && e.wk === entry.wk;
    const arr = [...(get().logs[ex] || []).filter(e => !planned(e)), structuredClone(entry)].sort((a, b) => a.d.localeCompare(b.d));
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

  // Erase parts of the data: {logs, weeks, body, programs, settings}. Display options, the GitHub token
  // and the GitHub backup settings are kept; backups already made aren't touched.
  async eraseData(parts) {
    if (get().blocked()) return false;
    if (parts.weeks) {
      const all = await get().allWeeks();
      Object.keys(all).forEach(k => { if (WEEK_RE.test(k)) get().removeDoc('weeks/' + k); });
      set({ week: normWeek(null), weekHist: null, moveNote: null, mDay: null });
    }
    if (parts.logs) { Object.keys(get().logs).forEach(id => get().removeDoc('logs/' + id)); set({ logs: {} }); }
    if (parts.body) { set({ body: [] }); get().saveBody(); }
    if (parts.programs) {
      ['A', 'B'].forEach(k => get().removeDoc('programs/' + k));
      set({ programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], experiments: [] }); get().saveLibrary(); get().saveExperiments();
    }
    if (parts.settings) {
      const { backup, ghBackup } = get().cfg; const cfg = structuredClone(DEFAULT_CFG);
      if (backup) cfg.backup = backup;
      if (ghBackup) cfg.ghBackup = { ...ghBackup, hash: null };
      set({ cfg }); get().saveCfg();
    }
    set({ modal: null, backupMsg: null });
    flag('Data erased');
    return true;
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

  exporting: null, // which export is running: 'csv' | 'xlsx-all' | 'xlsx-week' | 'data'

  async runExport(kind, fn) {
    const dl = get().dl; if (!dl || get().exporting) return;
    set({ exporting: kind });
    try { await fn(dl); flag('Exported'); }
    catch (e) {
      const c = e && e.code;
      if (c === 'declined') { /* user closed the save prompt */ }
      else if (c === 'rate_limited') flag('A save prompt is already open');
      else if (kind === 'csv') { flag('Export isn’t available here'); set({ dl: null }); }
      else flag(e && e.message && !c ? e.message : 'Export isn’t available here');
    } finally { set({ exporting: null }); }
  },
  exportCsv() { return get().runExport('csv', dl => dl.save({ filename: `iron-log-${ymd(new Date())}.csv`, data: buildCsv(get().snapshot()) })); },
  downloadExcel(which) {
    return get().runExport(`xlsx-${which}`, async dl => {
      const X = await loadXLSX(); const S = get().snapshot();
      const wb = which === 'week' ? buildWeekWorkbook(X, S, get().weekKey(), get().week) : buildOverallWorkbook(X, S, await get().allWeeks());
      const data = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
      await dl.save({ filename: which === 'week' ? `iron-log-week-${get().weekKey()}.xlsx` : `iron-log-${ymd(new Date())}.xlsx`, data });
    });
  },
  downloadData() {
    return get().runExport('data', async dl => {
      const d = buildDataFile(get().snapshot(), await get().allWeeks());
      await dl.save({ filename: `iron-log-data-${ymd(new Date())}.json`, data: JSON.stringify(d, null, 1) });
    });
  },
  snooze: () => set({ snoozeBackup: true }),

  async backupToGitHub() {
    const mcp = get().mcp; if (!mcp || get().backupBusy) return;
    set({ backupBusy: true, backupMsg: { kind: 'info', text: 'Building Excel files…' } });
    const b = backupCfg(get().cfg); b.hashes = { ...b.hashes };
    const [owner, repo] = String(b.repo).split('/'); let sent = 0;
    try {
      if (!owner || !repo) throw new Error('Set the backup repo as owner/name in Settings.');
      const X = await loadXLSX(); const weeks = await get().allWeeks(); const S = get().snapshot();
      const b64 = wb => X.write(wb, { type: 'base64', bookType: 'xlsx', compression: true });
      const upserts = [
        { path: 'iron-log.xlsx', content: b64(buildOverallWorkbook(X, S, weeks)), encoding: 'base64' },
        { path: 'iron-log-data.json', content: utf8b64(JSON.stringify(buildDataFile(S, weeks), null, 1)), encoding: 'base64' },
      ];
      const hashes = { ...b.hashes }; const changed = [];
      Object.keys(weeks).filter(k => WEEK_RE.test(k)).sort().forEach(k => {
        const w = weeks[k]; const r = weekSummary(S.cfg, S.programs, k, w);
        const hasLogs = Object.values(S.logs).some(L => L.some(e => entryWeek(e) === k));
        if (!r.ex && !hasLogs) return;
        const fp = weekFingerprint(S, k, w); if (hashes[k] === fp) return;
        upserts.push({ path: `weeks/${k}.xlsx`, content: b64(buildWeekWorkbook(X, S, k, w)), encoding: 'base64' }); hashes[k] = fp; changed.push(k);
      });
      // The connector accepts about 1 MB per call, so large first backups go in several commits.
      const batches = []; let cur = [], curSize = 0;
      upserts.forEach(u => { if (cur.length && curSize + u.content.length > 700000) { batches.push(cur); cur = []; curSize = 0; } cur.push(u); curSize += u.content.length; });
      if (cur.length) batches.push(cur);
      if (batches.some(bt => bt.length === 1 && bt[0].content.length > 950000)) throw new Error('One of the workbooks is too large to send. Ask Claude to split the backup.');
      const base = `Backup ${ymd(new Date())}: overall workbook + data file${changed.length ? ` + ${changed.length} week file${changed.length > 1 ? 's' : ''}` : ''}`;
      let url = `https://github.com/${owner}/${repo}`;
      for (let i = 0; i < batches.length; i++) {
        set({ backupMsg: { kind: 'info', text: `Sending ${batches[i].length} file${batches[i].length > 1 ? 's' : ''} to ${owner}/${repo}${batches.length > 1 ? ` (part ${i + 1} of ${batches.length})` : ''}…` } });
        const msg = batches.length > 1 ? `${base} (part ${i + 1} of ${batches.length})` : base;
        const res = await mcp.callTool(GH_SERVER, GH_TOOL, { tools: [{ tool_slug: 'GITHUB_COMMIT_MULTIPLE_FILES', arguments: { owner, repo, branch: b.branch || 'main', message: msg, upserts: batches[i] } }], sync_response_to_workbench: false, thought: 'Back up Iron Log training data to the private data repo.', current_step: 'BACKUP' }, { cache: false });
        const p = res && res.payload; const r0 = p && p.data && p.data.results && p.data.results[0];
        if (!(r0 && r0.response && r0.response.successful)) {
          const why = (r0 && (r0.error || (r0.response && r0.response.error))) || (p && p.error) || 'GitHub rejected the backup.';
          throw new Error((typeof why === 'string' ? why.slice(0, 300) : 'GitHub rejected the backup.') + (sent ? ` (${sent} file${sent > 1 ? 's were' : ' was'} saved before this.)` : ''));
        }
        const d = r0.response.data || {}; url = d.commit_url || (d.commit && d.commit.html_url) || url;
        sent += batches[i].length;
        // Record progress so a retry skips weeks that already went through.
        batches[i].forEach(u => { const m = u.path.match(/^weeks\/(.+)\.xlsx$/); if (m) b.hashes[m[1]] = hashes[m[1]]; });
      }
      get().mutateCfg(c => { c.backup = { ...b, hashes, last: { at: new Date().toISOString(), url, files: upserts.length } }; });
      set({ backupMsg: { kind: 'ok', text: `Backed up ${upserts.length} file${upserts.length > 1 ? 's' : ''}.`, url } });
    } catch (e) {
      set({ backupMsg: { kind: 'err', text: backupError(e) } });
      if (sent) get().mutateCfg(c => { c.backup = { ...b }; });
    } finally { set({ backupBusy: false }); }
  },

  // Whichever GitHub backup this view has: the Claude connector, or a token pasted in on this device.
  canBackup: () => !!(get().mcp || (get().ghDirect && get().ghToken)),
  backupNow: () => (get().mcp ? get().backupToGitHub() : get().backupDirect()),
  lastBackup: () => (get().mcp ? backupCfg(get().cfg).last : ghCfg(get().cfg).last) || null,

  setGhToken(raw) {
    const v = String(raw || '').trim();
    if (!v) { set({ backupMsg: { kind: 'err', text: 'Paste the token first.' } }); return false; }
    try { localStorage.setItem(TOKEN_KEY, v); } catch { /* storage unavailable: keep it for this visit */ }
    set({ ghToken: v, backupMsg: { kind: 'ok', text: 'Token saved in this browser.' } });
    return true;
  },
  forgetGhToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    set({ ghToken: '', backupMsg: { kind: 'info', text: 'Token removed from this browser.' } });
  },
  setGhRepo(raw) {
    const v = String(raw || '').trim();
    if (!validRepo(v)) { set({ backupMsg: { kind: 'err', text: 'Use the form owner/repo, for example jacgit18/iron-log.' } }); return false; }
    if (get().mutateCfg(c => { c.ghBackup = { ...ghCfg(c), repo: v, hash: null }; })) set({ backupMsg: null });
    return true;
  },

  // One commit with the Excel workbook and the full data file, on the backup branch.
  async backupDirect() {
    if (get().backupBusy || get().blocked()) return;
    const token = get().ghToken; const g = ghCfg(get().cfg);
    if (!token) { set({ backupMsg: { kind: 'err', text: 'Paste a GitHub token in Settings first.' } }); return; }
    set({ backupBusy: true, backupMsg: { kind: 'info', text: 'Building the Excel and data files…' } });
    try {
      const X = await loadXLSX(); const weeks = await get().allWeeks(); const S = get().snapshot();
      const data = buildDataFile(S, weeks); const fp = dataFingerprint(data);
      if (g.last && fp === g.hash) { set({ backupMsg: { kind: 'ok', text: 'Nothing new since the last backup.', url: g.last.url } }); return; }
      set({ backupMsg: { kind: 'info', text: `Sending to ${g.repo}…` } });
      const files = [
        { path: 'iron-log.xlsx', content: X.write(buildOverallWorkbook(X, S, weeks), { type: 'base64', bookType: 'xlsx', compression: true }) },
        { path: 'iron-log-data.json', content: utf8b64(JSON.stringify(data, null, 1)) },
      ];
      const { url } = await commitFiles({ token, repo: g.repo, branch: g.branch, files, message: `Backup ${ymd(new Date())}` });
      get().mutateCfg(c => { c.ghBackup = { ...ghCfg(c), hash: fp, last: { at: new Date().toISOString(), url } }; });
      set({ backupMsg: { kind: 'ok', text: `Backed up to the ${g.branch} branch of ${g.repo}.`, url } });
    } catch (e) {
      set({ backupMsg: { kind: 'err', text: (e && e.message) || 'Backup failed.' } });
    } finally { set({ backupBusy: false }); }
  },
  // Reads the latest data file from the backup branch and opens the usual import review.
  async restoreFromGitHub() {
    if (get().backupBusy || get().blocked()) return;
    const g = ghCfg(get().cfg);
    set({ backupBusy: true, backupMsg: { kind: 'info', text: `Reading the backup from ${g.repo}…` } });
    try {
      const text = await readFile({ token: get().ghToken, repo: g.repo, branch: g.branch, path: 'iron-log-data.json' });
      set({ importDraft: { data: parseDataFile(text), name: `Backup from ${g.repo}`, kind: 'json' }, importError: '', modal: { type: 'import' }, backupMsg: null });
    } catch (e) {
      set({ backupMsg: { kind: 'err', text: (e && e.message) || 'Couldn’t read the backup.' } });
    } finally { set({ backupBusy: false }); }
  },

  async init() {
    if (initStarted) return; // StrictMode runs mount effects twice in dev; subscribe once
    initStarted = true;
    const host = window.claude && window.claude.use ? window.claude : null;
    (async () => { try { set({ dl: host ? await host.use('downloads') : blobSave }); } catch { set({ dl: null }); } })();
    (async () => { try { set({ mcp: host ? await host.use('mcp') : null }); } catch { set({ mcp: null }); } })();
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
        library: padLibrary((LS.get('library/main') || {}).items || []),
        experiments: (LS.get('experiments/main') || {}).items || [],
        logs,
        programs: { A: resolveProgram('A', LS.get('programs/A')), B: resolveProgram('B', LS.get('programs/B')) },
        ready: { ...state.ready, cfg: true, logs: true, programs: true, lib: true, body: true, exp: true },
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
      set(state => ({ library: s.exists ? padLibrary([...((s.data() || {}).items || [])]) : [], ...markReady('lib')(state) }));
    }, () => flag('Couldn’t load saved programs. Reload the page.'));
    db.doc('experiments/main').onSnapshot(s => {
      if (s.metadata.hasPendingWrites) return;
      set(state => ({ experiments: s.exists ? [...((s.data() || {}).items || [])] : [], ...markReady('exp')(state) }));
    }, () => flag('Couldn’t load your experiments. Reload the page.'));
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
