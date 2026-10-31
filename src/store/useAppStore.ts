import { create } from 'zustand';
import type { AppState } from './types.ts';
import type { GroceryMonth, Logs, Program, Stretch, Week } from '../types.ts';
import { BUILTIN, BLANK, resolveProgram, padLibrary, exInfo, listBuiltinExercises } from '../lib/data.js';
import { weekStartOf, ymd, addDays } from '../shared/dates.js';
import {
  DEFAULT_CFG, normWeek, weekProgKey, weekProgram, ranFor, isFrozen,
  weekSlots,
  normExperiments,
} from '../lib/logic.js';
import { LS, makeSaveQueue, onDamaged, removeLegacyGitHubToken } from '../lib/storage.js';
import { FLAG_KEY, apiSyncEnabled } from '../sync/flag.js';
import { reportCaught } from '../sync/reportErrors.js';
import { groceryAdopted, markGroceryAdopted, readLegacyMarker } from '../sync/legacyMarker.js';
import { mergeGroceryMonth3, mergeStretchWeek3, mergeWeek3 } from '../sync/merge.js';
import { stable } from '../sync/canon.js';
import type { ApiDb } from '../sync/apiDb.js';
import { bodySlice } from './bodySlice.js';
import { editorSlice } from './editorSlice.js';
import { exportSlice } from './exportSlice.js';
import { boardSlice } from './boardSlice.js';
import { librarySlice } from './librarySlice.js';
import { logSlice } from './logSlice.js';
import { programSlice, swapLayout } from './programSlice.js';
import { backupSlice } from './backupSlice.js';
import { startAutoBackup } from './autoBackupRunner.js';
import { settingsSlice } from './settingsSlice.js';
import { wellnessSlice } from './wellnessSlice.js';
import { deviceGrocery, grocerySlice } from './grocerySlice.js';
import { dietSlice } from './dietSlice.js';
import { recipesSlice } from './recipesSlice.js';
import { removedSlice } from './removedSlice.js';
import { MONTH_RE, monthEmpty, normGrocery, normGroceryMonth } from '../lib/grocery.js';
import { normStretches, normStretchWeek } from '../lib/stretches.js';
import { normSupplements } from '../lib/water.js';
import { WEEK_RE } from '../lib/trends.js';
import { sameProg, normConfig } from '../lib/export.js';
import { mimeFor } from '../lib/mime.js';
import { parseRoute } from '../lib/route.js';
import { loadView, saveView, openFromUrl } from '../lib/viewState.js';
import { useToday } from './useToday.js';
import { normEntries, normBody, normProgram, normLibrary, SCHEMA_VERSION } from '../shared/validate.js';
import { normDietEntries } from '../shared/diet.js';
import { normRecipes } from '../shared/recipes.js';

// Non-reactive handles for the async plumbing. `db` mirrors the optional Firestore-like host
// binding from the original app (window.claude.use('db')); without it everything uses localStorage.
let db: any = null; // the host's database handle (Firestore-like), or null for local storage
let syncApi: ApiDb | null = null; // set when the handle is the API-backed one (flag on)
let unsubWeek: (() => void) | null = null;
let flagT: ReturnType<typeof setTimeout> | null = null, flagX: ReturnType<typeof setTimeout> | null = null, flagHold: boolean | number = 0;
let initStarted = false;
let histPromise: Promise<void> | null = null;
let histFailed = false; // the last history load lost some weeks to an error

// Outside the Claude host, downloads are a plain blob link.
const blobSave = {
  save: async ({ filename, data }: { filename: string; data: BlobPart }) => {
    const url = URL.createObjectURL(new Blob([data], { type: mimeFor(filename) }));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { status: 'saved' };
  },
};

// A week save that synced merged in another device's changes (ADR 031): the board takes the merged week once nothing more of it is
// waiting, and a save queued meanwhile (made from the week before the merge) gets the merge too, so it does not take them back out.
// A grocery month is merged the same way (ADR 039), and the catalogue the server now holds (another device's items) is taken too.
const groceryMonthOf = (path: string) => (path.startsWith('grocery/') && MONTH_RE.test(path.slice(8)) ? path.slice(8) : null);
const rebaseWeek = (path: string, sent: unknown, next: unknown, stored: unknown) =>
  path.startsWith('weeks/') ? mergeWeek3(sent, next, stored).week : path.startsWith('stretchweeks/') ? mergeStretchWeek3(sent, next, stored).week
    : groceryMonthOf(path) ? mergeGroceryMonth3(sent, next, stored).week : next;
function takeStoredWeek(path: string, doc: unknown) {
  const st = useAppStore.getState(); const wk = st.weekKey(); const month = groceryMonthOf(path);
  if (path === 'weeks/' + wk) { const week = normWeek(doc); if (stable(week) !== stable(normWeek(st.week))) useAppStore.setState({ week }); }
  else if (path === 'stretchweeks/' + wk) { const strWeek = normStretchWeek(doc); if (stable(strWeek) !== stable(normStretchWeek(st.strWeek))) useAppStore.setState({ strWeek }); }
  else if (path === 'grocery/main') { const grocery = normGrocery(doc); if (stable(grocery) !== stable(st.grocery)) useAppStore.setState({ grocery }); }
  else if (month) { const m = normGroceryMonth(doc); if (stable(m) !== stable(st.groceryMonths[month] ?? null)) useAppStore.setState(s => ({ groceryMonths: withMonth(s.groceryMonths, month, m) })); }
}
// The months with one replaced; an empty month is the fresh list, so it is left out.
const withMonth = (months: Record<string, GroceryMonth>, key: string, m: GroceryMonth | null) => {
  const next = { ...months };
  if (m && !monthEmpty(m)) next[key] = m; else delete next[key];
  return next;
};
const queue = makeSaveQueue({
  getDb: () => db, onFlag: (t: string) => flag(t),
  onFailed: (paths: string[], refused: boolean) => useAppStore.setState(s => ({ unsaved: paths, refusals: s.refusals + (refused ? 1 : 0) })),
  onStored: takeStoredWeek, rebase: rebaseWeek,
  onError: (err: unknown) => { console.error(err); reportCaught(err); },
});

// Status line. Messages stay until the next tap or key press (no timer, WCAG 2.2.3), and a routine
// "Saved" / "Loading…" never replaces a message you haven't had the chance to act on yet.
// A stored program comes back only if it has the right shape, cleaned; otherwise the built-in one.
const loadProgram = (k: 'A' | 'B', data: unknown) => resolveProgram(k, normProgram(data, k));

// A signed-in account with no saved program has a blank board, log entries or not: everyone builds their own program (ADR 021,
// replacing ADR 016's "keep the built-in plan once you have entries"). Decided once both the programs and the logs have loaded.
// Only a program that is still the built-in or the blank one is swapped; a saved or just-edited program is never touched.
const programDocs = new Set<string>();
// Returns the programs this state should show; the same object when nothing changes. Applied in the same update that marks the programs
// and the logs ready, so the board never shows the built-in plan for an instant before it turns blank.
function settledPrograms(st: { ready: { programs: boolean; logs: boolean }; logs: Logs; programs: AppState['programs'] }): AppState['programs'] {
  if (!st.ready.programs || !st.ready.logs) return st.programs;
  let programs = st.programs;
  (['A', 'B'] as const).forEach(k => {
    if (programDocs.has(k) || queue.pending('programs/' + k)) return;
    if (programs[k] !== BUILTIN[k] && programs[k] !== BLANK[k]) return;
    if (programs[k] !== BLANK[k]) programs = { ...programs, [k]: BLANK[k] };
  });
  return programs;
}
// The stretch routine works the same way (ADR 021): a stretch list with no saved document is empty, history or not. Decided in the same
// update that marks the data ready; a saved or just-edited list is never replaced.
const BLANK_STRETCHES: Stretch[] = [];
let shownDefaultStretches: Stretch[] | null = null;
let stretchDocExists = false;
function settledStretches(st: { ready: { str: boolean; strHist: boolean; logs: boolean }; logs: Logs; stretches: Stretch[] }): Stretch[] {
  if (!st.ready.str || !st.ready.strHist || !st.ready.logs) return st.stretches;
  if (stretchDocExists || queue.pending('stretches/main')) return st.stretches;
  if (st.stretches !== shownDefaultStretches && st.stretches !== BLANK_STRETCHES) return st.stretches;
  return BLANK_STRETCHES;
}
export function flag(t: string) {
  const routine = t === 'Saved' || t === 'Loading…' || t === '';
  if (routine && flagHold) return;
  flagHold = !routine && !/^Not saved|^Could/.test(t);
  useAppStore.setState({ saveFlag: t });
  if (flagT) clearTimeout(flagT);
  if (flagX) clearTimeout(flagX);
  if (!t) return;
  // A message goes by itself after a few seconds (longer for a longer one), so it never sits over the page waiting for a tap.
  // A failure ("Not saved", "Could not ...") stays until the next tap: it says something is wrong.
  if (!/^Not saved|^Could/.test(t)) flagX = setTimeout(() => { flagHold = false; useAppStore.setState(s => (s.saveFlag === t ? { saveFlag: '' } : {})); }, Math.max(6000, 3000 + t.length * 60));
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

const restored = loadView(ymd(new Date()));
// A home-screen shortcut (./?open=daily) wins over the remembered tab; the parameter is then dropped so a refresh does not re-apply it.
const shortcutTab = typeof location === 'undefined' ? undefined : openFromUrl(location.search);
if (shortcutTab) try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* ignore */ }
const hashTab = typeof location === 'undefined' ? undefined : parseRoute(location.hash)?.tab; // an address like #/progress/trends opens that tab (brief navigation-urls)
let keepMDay = restored.mDay != null; // the first week load must not clear a restored phone day
const loadedMDay = (state: AppState) => { const m = keepMDay ? state.mDay : null; keepMDay = false; return m; };

const allReady = (r: AppState['ready']) => r.cfg && r.logs && r.week && r.programs && r.lib && r.body && r.exp && r.str && r.strHist && r.strWeek && r.supp && r.groc && r.grocMonths;

export const useAppStore = create<AppState>((set, get) => ({
  ...bodySlice(set, get, flag),
  ...boardSlice(set, get, flag),
  ...editorSlice(set, get, flag),
  ...exportSlice(set, get, flag),
  ...librarySlice(set, get, flag),
  ...logSlice(set, get, flag),
  ...programSlice(set, get, flag),
  ...settingsSlice(set, get, flag),
  ...backupSlice(set, get, flag),
  ...wellnessSlice(set, get, flag),
  ...grocerySlice(set, get),
  ...recipesSlice(set, get),
  ...dietSlice(set, get),
  ...removedSlice(set, get, flag),
  cfg: structuredClone(DEFAULT_CFG),
  weekStart: weekStartOf(new Date()),
  week: normWeek(null),
  logs: {}, // exId -> [entries]
  unsaved: [], // doc paths whose last write was refused (storage full, permission): kept until a write succeeds
  refusals: 0, // writes refused so far this session
  sync: null, // how syncing through the API is going; null when it is off
  tab: shortcutTab || hashTab || restored.tab || 'board',
  mDay: restored.mDay ?? null, // day shown on phones; null = pick the first day with open work
  library: [], // saved program versions
  experiments: [], // exercises to try: [{id, ex, ph, note}]
  recipes: [], // recipes you wrote or copied (ADR 084)
  diet: [], // things you ate (ADR 086): saved as diet/main, newest last
  body: [], // body weight: [{wk, d, w}], one per week
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  storeMode: 'loading',
  saveFlag: '',
  ready: { cfg: false, logs: false, week: false, programs: false, lib: false, body: false, exp: false, str: false, strHist: false, strWeek: false, supp: false, groc: false, grocMonths: false },
  uncheckNote: null, // after an uncheck removed logged entries: {week, text, entries: {exId: [entry]}, done: {key: wasDone}}
  skipNote: null, // after a card is skipped: {week, slotId, text, done: [keys the skip cleared]}
  moveNote: null, // heads-up after a move puts the same exercise on the same or a neighboring day
  swapFlash: null,
  orderNote: null, // after a day is finished: {kind, week, doneCol, prev, next, lines, applied}; prev/next are {order, rest} for kind 'order', {slot, moved} for kind 'card'
  orderSkip: [], // 'week:column' suggestions dismissed this session
  modal: null, // {type:'log', slotId, idx} | {type:'detail', exId}
  weekHist: null, // every saved week, loaded on demand for Progress and exports
  historyLoading: false,
  dl: undefined, // downloads handle: undefined = not checked yet, null = unavailable

  // Muscle map selection; the Progress page clears it when you leave.
  bodySel: null, // selected muscle key
  bodySec: true, // count secondary work as half a set
  selectMuscle: bodySel => set({ bodySel }),
  setBodySec: bodySec => set({ bodySec }),
  saveTags(exId, tags) {
    if (get().mutateCfg(c => { c.muscleMap = c.muscleMap || {}; c.muscleMap[exId] = tags; })) { set({ modal: null }); flag('Muscles saved'); }
  },
  resetTags(exId) {
    const own = get().cfg.muscleMap?.[exId]; if (!own) return;
    if (!get().mutateCfg(c => { if (c.muscleMap) delete c.muscleMap[exId]; })) return;
    set({ modal: null });
    get().noteRemoved('muscles', `your muscle tags for ${exInfo(get().cfg, exId).n}`, () => !get().cfg.muscleMap?.[exId] && get().mutateCfg(c => { c.muscleMap = { ...(c.muscleMap || {}), [exId]: own }; }));
  },

  snapshot: () => { const s = get(); return { cfg: s.cfg, logs: s.logs, programs: s.programs, library: s.library, body: s.body, experiments: s.experiments, recipes: s.recipes, diet: s.diet, stretches: s.stretches, stretchExps: s.stretchExps, supp: s.supp, grocery: { ...s.grocery, months: s.groceryMonths } }; },

  // The snapshot plus every saved stretch week (the week on screen taken live), for the data file.
  async stretchWeeksAll() {
    const out: Record<string, any> = {};
    try {
      if (db) { const snap = await db.collection('stretchweeks').get(); snap.docs.forEach((d: any) => { if (d.exists) out[d.id] = d.data(); }); }
      else {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ironlog:stretchweeks/')) { const v = LS.get(k.slice(8)); if (v) out[k.slice(21)] = v; }
        }
      }
    } catch { /* back up what loaded */ }
    return out;
  },
  async stretchWeekKeys() { return Object.keys(await get().stretchWeeksAll()); },
  async fullSnapshot() { return { ...get().snapshot(), stretchWeeks: { ...(await get().stretchWeeksAll()), [get().weekKey()]: get().strWeek } }; },

  // Callers that arrive while a load is running wait for that same load.
  loadHistory() {
    if (histPromise) return histPromise;
    set({ historyLoading: true });
    histPromise = (async () => {
      await dataSourceKnown(); // reading before the data source is known would return local or empty weeks
      const out: Record<string, any> = {}; histFailed = false;
      try {
        if (db) { const snap = await db.collection('weeks').get(); snap.docs.forEach((d: any) => { if (d.exists) out[d.id] = d.data(); }); }
        else {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('ironlog:weeks/')) { const v = LS.get(k.slice(8)); if (v) out[k.slice(14)] = v; }
          }
        }
      } catch { histFailed = true; /* show what loaded */ }
      set({ weekHist: out, historyLoading: false });
      get().recordPastWeeks();
    })().finally(() => { histPromise = null; });
    return histPromise;
  },
  // Weeks saved before ADR 022 have no record of what they ran, so they would keep following today's programs and mode. Each one that
  // is over and has a tick, skip or move gets its record from what it shows now, once, so it stops changing from here on.
  recordPastWeeks() {
    const { weekHist, cfg, programs } = get();
    if (!weekHist || !get().isReady()) return;
    const thisSun = ymd(weekStartOf(new Date())); const upd: Record<string, Week> = {};
    Object.entries(weekHist).forEach(([k, raw]) => {
      if (!WEEK_RE.test(k) || k >= thisSun || k === get().weekKey()) return;
      const w = normWeek(raw);
      if (w.ran || !(Object.keys(w.done).length || Object.keys(w.skipped).length || Object.keys(w.moved).length)) return;
      upd[k] = { ...w, ran: ranFor(weekProgram(cfg, programs, w, k), weekProgKey(cfg, w, k), w, k) };
    });
    if (!Object.keys(upd).length) return;
    Object.entries(upd).forEach(([k, w]) => queue.save('weeks/' + k, w));
    set(s => ({ weekHist: { ...s.weekHist, ...upd } }));
  },
  // All saved weeks, with the week on screen taken live from state.
  async allWeeks() {
    if (!get().weekHist) await get().loadHistory();
    return { ...(get().weekHist || {}), [get().weekKey()]: get().week };
  },

  isReady: () => allReady(get().ready),
  weekKey: () => ymd(get().weekStart),
  // The shown week's program: what it ran once it is over (ADR 022), else today's.
  activeProgKey: () => weekProgKey(get().cfg, get().week, get().weekKey()),
  activeProgram: () => { const s = get(); return weekProgram(s.cfg, s.programs, s.week, s.weekKey()); },
  shownFromRecord: () => isFrozen(get().week, get().weekKey(), new Date()),
  activeSlots: () => weekSlots(get().activeProgram(), get().week, get().weekKey()),
  slotById: id => get().activeSlots().find(x => x.id === id),
  // The log sheet needs both its card and the exercise at that position; a program replaced from elsewhere can remove either.
  logTargetExists: (slotId, idx) => { const s = get().slotById(slotId); return !!(s && s.items[idx]); },

  // Every write is refused until all data has loaded, so a half-loaded week never overwrites the saved one.
  blocked() { if (get().isReady()) return false; flag('Still loading your data…'); return true; },
  originalProgram: k => (db ? BLANK[k] : BUILTIN[k]),
  // Syncing, a saved blank program is a copy, so compare by content; the built-in plan still on a board from before ADR 021 counts as the
  // account's own, so loading another version first keeps a copy of it in the library.
  isOriginal: (p, k) => (db ? p === BLANK[k] || sameProg(p, BLANK[k]) : p === BUILTIN[k]),

  // Opening Progress reloads the saved weeks so the history is never stale.
  setTab: tab => set(tab === 'progress' ? { tab, weekHist: null } : { tab }),
  setMDay: mDay => set({ mDay }),
  openModal: modal => set({ modal }),
  closeModal: () => set({ modal: null }),

  saveCfg() { queue.save('config/main', get().cfg); },
  saveWeek() {
    const key = get().weekKey(); queue.save('weeks/' + key, get().week);
    // Keep a loaded history in step, so an export, backup, import or erase after visiting another week sees this edit.
    if (get().weekHist) set(s => ({ weekHist: { ...s.weekHist, [key]: s.week } }));
  },
  saveBody() { queue.save('body/main', { schema: SCHEMA_VERSION, entries: get().body }); },
  saveLibrary() { queue.save('library/main', { schema: SCHEMA_VERSION, items: get().library }); },
  saveExperiments() { queue.save('experiments/main', { schema: SCHEMA_VERSION, items: get().experiments }); },
  saveLog(exId) { queue.save('logs/' + exId, { schema: SCHEMA_VERSION, entries: get().logs[exId] || [] }); },
  saveProgram(k, prog) {
    const body = structuredClone(prog); delete body.key;
    set(state => ({ programs: { ...state.programs, [k]: { ...body, key: k as Program['key'] } } }));
    queue.save('programs/' + k, body);
    get().refreshRan();
  },
  saveDoc: (path, data) => queue.save(path, data),
  removeDoc: path => queue.removeDoc(path),

  mutateCfg(fn) {
    if (get().blocked()) return false;
    const shown = get().activeProgKey();
    const cfg = structuredClone(get().cfg); fn(cfg); set({ cfg }); get().saveCfg();
    // A mode or schedule change can swap the program this week shows without the pill: its rest days go with it.
    const now = get().activeProgKey();
    if (now !== shown) get().mutateWeek(w => swapLayout(w, shown, now));
    return true;
  },
  mutateWeek(fn) {
    if (get().blocked()) return false;
    const week = structuredClone(get().week); fn(week);
    // Write down what the week runs (ADR 022), from the program it shows: so once it is over, later program changes leave it alone.
    week.ran = ranFor(weekProgram(get().cfg, get().programs, week, get().weekKey()), weekProgKey(get().cfg, week, get().weekKey()), week, get().weekKey());
    set({ week }); get().saveWeek(); return true;
  },
  // This week's record follows its program until the week is over (the board shows today's program all week), so a program edit, a
  // mode change or loading the week rewrites it; else a card added or removed after the last tick would flip back once the week ends.
  refreshRan() {
    const s = get(); const key = s.weekKey(); const now = ymd(weekStartOf(new Date()));
    if (!s.isReady()) return;
    if (key !== now) { void refreshSavedRan(now); return; }
    if (!s.week.ran) return;
    const ran = ranFor(weekProgram(s.cfg, s.programs, s.week, key), weekProgKey(s.cfg, s.week, key), s.week, key);
    if (JSON.stringify(ran) === JSON.stringify(s.week.ran)) return;
    set({ week: { ...s.week, ran } }); get().saveWeek();
  },

  gotoWeek(which) {
    const cur = get().weekStart;
    set({ mDay: null, moveNote: null, orderNote: null, swapFlash: null, weekStart: which === 'today' ? weekStartOf(new Date()) : addDays(cur, which === 'prev' ? -7 : 7) });
    subscribeWeek();
  },

  retryUnsaved() { queue.retryFailed(); },

  // Erase parts of the data: {logs, weeks, body, programs, settings}. Display options are kept; files you exported aren't touched.
  async eraseData(parts) {
    if (get().blocked()) return false;
    if (parts.weeks) {
      const all = await get().allWeeks();
      Object.keys(all).forEach(k => { if (WEEK_RE.test(k)) get().removeDoc('weeks/' + k); });
      set({ week: normWeek(null), weekHist: null, moveNote: null, orderNote: null, uncheckNote: null, skipNote: null, mDay: null });
    }
    if (parts.logs) { Object.keys(get().logs).forEach(id => get().removeDoc('logs/' + id)); set({ logs: {}, uncheckNote: null }); } // its Undo would bring them back
    if (parts.body) { set({ body: [] }); get().saveBody(); }
    if (parts.programs) {
      ['A', 'B'].forEach(k => get().removeDoc('programs/' + k));
      // Back to the starting program: syncing that is the blank one, never the owner's plan (ADR 016).
      set({ programs: { A: get().originalProgram('A'), B: get().originalProgram('B') }, library: [], experiments: [] }); get().saveLibrary(); get().saveExperiments();
    }
    if (parts.settings) {
      const cfg = structuredClone(DEFAULT_CFG);
      set({ cfg }); get().saveCfg();
    }
    set({ modal: null });
    flag('Data erased');
    return true;
  },

  async init() {
    if (initStarted) return; // StrictMode runs mount effects twice in dev; subscribe once
    initStarted = true;
    startAutoBackup(useAppStore); // one copy of the data a day, the last 7, in this browser
    removeLegacyGitHubToken(); // one-time cleanup of the retired GitHub backup token
    const host = window.claude && window.claude.use ? (window.claude as { use: (name: string) => Promise<any> }) : null;
    (async () => { try { set({ dl: host ? await host.use('downloads') : blobSave }); } catch { set({ dl: null }); } })();
    try { db = (window.claude && window.claude.use) ? await window.claude.use('db') : null; } catch { db = null; }
    // With the flag on (and no host database), the same handle is backed by the API: see src/sync/apiDb.ts.
    if (!db && apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC)) {
      try {
        const { createBrowserApiDb } = await import('../sync/browser.js');
        // A new account's old weeks need their record too. The grocery list follows the account like everything else (ADR 039): the
        // new account's comes with the pull, and the list this browser held from before syncing was the old owner's, so it is never
        // added to the new account.
        syncApi = createBrowserApiDb({ onOwnerChange: () => { markGroceryAdopted('other-account'); LS.remove('ran-recorded/db'); } });
        db = syncApi;
        syncApi.onStatus(sync => useAppStore.setState({ sync }));
        useAppStore.setState({ sync: syncApi.status() });
        syncApi.start();
      } catch (err) { console.error('SYNC INIT FAILED', err); reportCaught(err); db = null; syncApi = null; } // the app still works from this browser's storage
    }
    if (!db) {
      const cfgRaw = LS.get('config/main');
      const logs: Logs = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('ironlog:logs/')) { const l = LS.get(k.slice(8)); if (l && l.entries) { const L = normEntries(l.entries); if (L.length) logs[k.slice(13)] = L; } }
        }
      } catch { /* storage unavailable */ }
      set(state => ({
        storeMode: 'local',
        cfg: cfgRaw ? { ...structuredClone(DEFAULT_CFG), ...normConfig(cfgRaw) } : state.cfg,
        body: normBody((LS.get('body/main') || {}).entries),
        library: padLibrary(normLibrary((LS.get('library/main') || {}).items)),
        experiments: normExperiments((LS.get('experiments/main') || {}).items),
        recipes: normRecipes((LS.get('recipes/main') || {}).items),
        diet: normDietEntries((LS.get('diet/main') || {}).items),
        stretches: normStretches(LS.get('stretches/main')).items,
        stretchExps: normStretches(LS.get('stretches/main')).experiments,
        supp: normSupplements(LS.get('supplements/main')),
        logs,
        programs: { A: loadProgram('A', LS.get('programs/A')), B: loadProgram('B', LS.get('programs/B')) },
        ready: { ...state.ready, cfg: true, logs: true, programs: true, lib: true, body: true, exp: true, str: true, strHist: true, supp: true },
      }));
      get().loadGrocery();
      if (typeof window.addEventListener === 'function') window.addEventListener('storage', fromOtherTab);
      subscribeWeek();
      return;
    }
    listBuiltinExercises(false); // synced: the library is the account's own exercises (ADR 024)
    set({ storeMode: 'db' });
    const markReady = (k: any) => (state: any) => ({ ready: { ...state.ready, [k]: true } });
    db.collection('programs').onSnapshot((s: any) => {
      const m: Record<string, any> = {}; s.docs.forEach((d: any) => { m[d.id] = d.data(); });
      const pick = (state: any, k: any) => (queue.pending('programs/' + k) ? state.programs[k] : loadProgram(k, m[k]));
      programDocs.clear(); Object.keys(m).forEach(k => programDocs.add(k));
      set(state => {
        const next = { programs: { A: pick(state, 'A'), B: pick(state, 'B') }, ...markReady('programs')(state) };
        return { ...next, programs: settledPrograms({ ...state, ...next }) };
      });
      get().refreshRan(); // a program changed on another device: this week's record follows it
    }, () => flag('Couldn’t load your programs. Reload the page.'));
    db.doc('body/main').onSnapshot((s: any) => {
      if (queue.pending('body/main')) return;
      set(state => ({ body: s.exists ? normBody((s.data() || {}).entries) : [], ...markReady('body')(state) }));
    }, () => flag('Couldn’t load body weight. Reload the page.'));
    db.doc('library/main').onSnapshot((s: any) => {
      if (queue.pending('library/main')) return;
      set(state => ({ library: s.exists ? padLibrary(normLibrary((s.data() || {}).items)) : [], ...markReady('lib')(state) }));
    }, () => flag('Couldn’t load saved programs. Reload the page.'));
    db.doc('experiments/main').onSnapshot((s: any) => {
      if (queue.pending('experiments/main')) return;
      set(state => ({ experiments: s.exists ? normExperiments((s.data() || {}).items) : [], ...markReady('exp')(state) }));
    }, () => flag('Couldn’t load your experiments. Reload the page.'));
    db.doc('diet/main').onSnapshot((s: any) => {
      if (queue.pending('diet/main')) return;
      set({ diet: s.exists ? normDietEntries((s.data() || {}).items) : [] });
    }, () => flag('Couldn’t load your food log. Reload the page.'));
    db.doc('recipes/main').onSnapshot((s: any) => {
      if (queue.pending('recipes/main')) return;
      set({ recipes: s.exists ? normRecipes((s.data() || {}).items) : [] });
    }, () => flag('Couldn’t load your recipes. Reload the page.'));
    db.doc('stretches/main').onSnapshot((s: any) => {
      if (queue.pending('stretches/main')) return;
      const d = normStretches(s.exists ? s.data() : null);
      stretchDocExists = !!s.exists; if (!s.exists) shownDefaultStretches = d.items;
      set(state => {
        const upd = { stretches: d.items, stretchExps: d.experiments, ...markReady('str')(state) };
        return { ...upd, stretches: settledStretches({ ...state, ...upd }) };
      });
    }, () => flag('Couldn’t load your stretches. Reload the page.'));
    // The stretch weeks are part of the data the app waits for before anything is written (ready.strHist).
    db.collection('stretchweeks').onSnapshot(() => {
      set(state => {
        const upd = markReady('strHist')(state);
        return { ...upd, stretches: settledStretches({ ...state, ...upd }) };
      });
    }, () => flag('Couldn’t load your stretches. Reload the page.'));
    db.doc('supplements/main').onSnapshot((s: any) => {
      if (queue.pending('supplements/main')) return;
      set(state => ({ supp: normSupplements(s.exists ? s.data() : null), ...markReady('supp')(state) }));
    }, () => flag('Couldn’t load supplements. Reload the page.'));
    // The grocery list (ADR 039): the catalogue, and every month in one collection. A month this device is still writing keeps what it holds.
    db.doc('grocery/main').onSnapshot((s: any) => {
      if (queue.pending('grocery/main')) return;
      set(state => ({ grocery: normGrocery(s.exists ? s.data() : null), ...markReady('groc')(state) }));
    }, () => flag('Couldn’t load your grocery list. Reload the page.'));
    db.collection('grocery').onSnapshot((s: any) => {
      const next: Record<string, GroceryMonth> = {};
      s.docs.forEach((d: any) => { if (MONTH_RE.test(d.id)) next[d.id] = normGroceryMonth(d.data()); });
      set(state => {
        let months: Record<string, GroceryMonth> = {};
        new Set([...Object.keys(next), ...Object.keys(state.groceryMonths)]).forEach(k => {
          months = withMonth(months, k, queue.pending('grocery/' + k) ? state.groceryMonths[k] ?? null : next[k] ?? null);
        });
        return { groceryMonths: months, ...markReady('grocMonths')(state) };
      });
    }, () => flag('Couldn’t load your grocery list. Reload the page.'));
    db.doc('config/main').onSnapshot((s: any) => {
      if (queue.pending('config/main')) return;
      set(state => ({ cfg: s.exists ? { ...structuredClone(DEFAULT_CFG), ...normConfig(structuredClone(s.data())) } : state.cfg, ...markReady('cfg')(state) }));
    }, () => flag('Couldn’t load settings. Reload the page.'));
    // Every snapshot is applied, so another device's change is never skipped (Firestore sends nothing more when this
    // device's own write is confirmed). Only an exercise this device is still writing keeps what it holds: that is newer.
    db.collection('logs').onSnapshot((s: any) => {
      const next: Logs = {}; s.docs.forEach((d: any) => { next[d.id] = normEntries((d.data() || {}).entries); });
      set(state => {
        const logs: Logs = {};
        new Set([...Object.keys(next), ...Object.keys(state.logs)]).forEach(id => {
          const v = queue.pending('logs/' + id) ? state.logs[id] : next[id];
          if (v) logs[id] = v;
        });
        const upd = { logs, ...markReady('logs')(state) };
        return { ...upd, programs: settledPrograms({ ...state, ...upd }), stretches: settledStretches({ ...state, ...upd }) };
      });
    }, () => flag('Couldn’t load your log. Reload the page.'));
    subscribeWeek();
  },
}));

// Saved data that could not be read: LS kept a copy before anything could write over it. Say so (it stays until a tap) and report the
// key, never the data. Subscribed only now that the store exists: a key found damaged while the modules loaded (the admin flag) is told
// at once, and flag() needs the store.
onDamaged(k => {
  flag('Could not read some saved data. A copy was kept');
  reportCaught(new Error(`Damaged saved data: ${k}`));
});

// Saved on this device: another tab (or the installed app next to a browser tab) wrote this data. Take its copy, so
// this tab's next save of it doesn't put back what it held before.
export function fromOtherTab(e: { key?: string | null; newValue?: string | null } | null) {
  if (!e || !e.key || !e.key.startsWith('ironlog:')) return;
  const path = e.key.slice(8); let v = null;
  try { v = e.newValue == null ? null : JSON.parse(e.newValue); } catch { return; }
  const st = useAppStore.getState(); const set = useAppStore.setState; const wk = st.weekKey();
  if (path.startsWith('logs/')) {
    const id = path.slice(5); const logs = { ...st.logs };
    if (v && v.entries) logs[id] = v.entries; else delete logs[id];
    set({ logs });
  } else if (path === 'weeks/' + wk) set({ week: normWeek(v) });
  else if (path.startsWith('weeks/')) { if (st.weekHist) set(s => ({ weekHist: { ...s.weekHist, [path.slice(6)]: v } })); }
  else if (path === 'config/main') set(s => ({ cfg: v ? { ...structuredClone(DEFAULT_CFG), ...v } : s.cfg }));
  else if (path === 'body/main') set({ body: (v || {}).entries || [] });
  else if (path === 'library/main') set({ library: padLibrary(normLibrary((v || {}).items)) });
  else if (path === 'experiments/main') set({ experiments: normExperiments((v || {}).items) });
  else if (path === 'recipes/main') set({ recipes: normRecipes((v || {}).items) });
  else if (path === 'diet/main') set({ diet: normDietEntries((v || {}).items) });
  else if (path === 'programs/A' || path === 'programs/B') { const k = path.slice(9); set(s => ({ programs: { ...s.programs, [k]: loadProgram(k as 'A' | 'B', v) } })); useAppStore.getState().refreshRan(); }
  else if (path === 'stretches/main') { const d = normStretches(v); set({ stretches: d.items, stretchExps: d.experiments }); }
  else if (path === 'supplements/main') set({ supp: normSupplements(v) });
  else if (path === 'stretchweeks/' + wk) set({ strWeek: normStretchWeek(v) });
  else if (path === 'grocery/main') set({ grocery: normGrocery(v) });
  else if (groceryMonthOf(path)) { const k = groceryMonthOf(path)!; set(s => ({ groceryMonths: withMonth(s.groceryMonths, k, v ? normGroceryMonth(v) : null) })); }
}

// ADR 039: the grocery list used to stay on the device (ADR 019). With a database, the list this browser still holds reaches the account
// once, added to whatever the account has (matched by name and store, so nothing is doubled; the account's own lines win). An account
// with no data takes it with the one-time upload of everything else (LegacyCard), so this waits until that upload was made or turned
// down, or cannot happen (the account has data). Never for a device handed to another account (onOwnerChange marks it done).
export function adoptDeviceGrocery(): 'added' | 'nothing' | 'waiting' {
  const st = useAppStore.getState();
  if (!db || st.storeMode !== 'db' || !st.isReady() || groceryAdopted()) return 'waiting';
  if (syncApi && (!st.sync || !st.sync.ready || (!st.sync.holdsData && !readLegacyMarker()))) return 'waiting';
  const mine = deviceGrocery();
  if (!mine) { markGroceryAdopted('nothing'); return 'nothing'; }
  markGroceryAdopted('added'); // first: the store update below runs this subscription again
  st.addGrocery(mine);
  return 'added';
}
useAppStore.subscribe((s, prev) => {
  if (s.storeMode === 'db' && (s.ready !== prev.ready || s.sync !== prev.sync) && !groceryAdopted()) adoptDeviceGrocery();
});

// Remember the tab and phone day across a refresh.
useAppStore.subscribe((s, prev) => {
  if (s.tab !== prev.tab || s.mDay !== prev.mDay) saveView(ymd(useToday.getState().today), s);
});
// Once the data is in: this week's record catches up (the week may have loaded before the programs did), and past weeks saved before
// ADR 022 get their record, once per device and data source, not only when Progress first loads the history: else a program loaded or
// edited before that would rewrite them first. The flag is set only after a load that lost nothing.
const RAN_FLAG = (s: AppState) => 'ran-recorded/' + s.storeMode;
useAppStore.subscribe((s, prev) => {
  if (s.ready === prev.ready || !allReady(s.ready) || allReady(prev.ready)) return;
  s.refreshRan();
  if (LS.get(RAN_FLAG(s))) return;
  void s.loadHistory().then(() => { const st = useAppStore.getState(); if (st.weekHist && !histFailed) LS.set(RAN_FLAG(st), true); });
});
// An installed app left open past the end of the week moves on to the new week, but only if you
// were looking at the week that just ended; browsing elsewhere stays put.
useToday.subscribe((s, prev) => {
  const st = useAppStore.getState();
  if (ymd(st.weekStart) === ymd(weekStartOf(prev.today)) && ymd(weekStartOf(s.today)) !== ymd(st.weekStart)) { if (st.modal && (st.modal.type === 'log' || st.modal.type === 'dayadd')) st.closeModal(); st.gotoWeek('today'); } // those sheets point at last week's cards
});

// Resolves once init knows where data lives (this browser or the host database).
function dataSourceKnown() {
  return new Promise<void>(res => {
    if (useAppStore.getState().storeMode !== 'loading') { res(); return; }
    const un = useAppStore.subscribe(s => { if (s.storeMode !== 'loading') { un(); res(); } });
  });
}

let unsubStrWeek: (() => void) | null = null;
function subscribeStretchWeek() {
  if (unsubStrWeek) { unsubStrWeek(); unsubStrWeek = null; }
  const key = useAppStore.getState().weekKey();
  if (!db) {
    const ready = useAppStore.getState().storeMode === 'local';
    useAppStore.setState(state => ({ strWeek: normStretchWeek(LS.get('stretchweeks/' + key)), ready: { ...state.ready, strWeek: ready } }));
    return;
  }
  useAppStore.setState(state => ({ strWeek: normStretchWeek(null), ready: { ...state.ready, strWeek: false } }));
  unsubStrWeek = db.doc('stretchweeks/' + key).onSnapshot((s: any) => {
    if (key !== useAppStore.getState().weekKey() || queue.pending('stretchweeks/' + key)) return;
    useAppStore.setState(state => ({ strWeek: normStretchWeek(s.exists ? s.data() : null), ready: { ...state.ready, strWeek: true } }));
  }, () => flag('Couldn’t load this week’s stretches. Reload the page.'));
}

// refreshRan for this week while the board shows another one: its saved record follows the program edit too, so it doesn't wait for
// this week's next load or tick (it may get neither before the week is over). Reads the saved document, never the loaded history:
// syncing, that copy isn't kept current, and the save writes the whole week, so it would drop ticks made on another device since.
async function refreshSavedRan(key: string) {
  const path = 'weeks/' + key; let raw: unknown;
  if (!db) raw = LS.get(path);
  else { try { const d = await db.doc(path).get(); raw = d.exists ? d.data() : null; } catch { return; /* the week's next load catches up */ } }
  const s = useAppStore.getState();
  if (s.weekKey() === key) { s.refreshRan(); return; } // back on this week meanwhile: the week on screen is the one to update
  if (queue.pending(path)) return;
  const w = normWeek(raw as Partial<Week> | null); if (!w.ran) return;
  const ran = ranFor(weekProgram(s.cfg, s.programs, w, key), weekProgKey(s.cfg, w, key), w, key);
  if (JSON.stringify(ran) === JSON.stringify(w.ran)) return;
  const week = { ...w, ran }; queue.save(path, week);
  if (s.weekHist) useAppStore.setState(st => ({ weekHist: { ...st.weekHist, [key]: week } }));
}

function subscribeWeek() {
  subscribeStretchWeek();
  if (unsubWeek) { unsubWeek(); unsubWeek = null; }
  const key = useAppStore.getState().weekKey(); const thisWeek = ymd(weekStartOf(new Date()));
  if (!db) {
    const ready = useAppStore.getState().storeMode === 'local';
    useAppStore.setState(state => ({ week: normWeek(LS.get('weeks/' + key)), mDay: ready ? loadedMDay(state) : state.mDay, ready: { ...state.ready, week: ready } }));
    if (key === thisWeek) useAppStore.getState().refreshRan(); // loading another week changes no program, so this week's record is fine
    return;
  }
  useAppStore.setState(state => ({ week: normWeek(null), ready: { ...state.ready, week: false } }));
  let first = true;
  unsubWeek = db.doc('weeks/' + key).onSnapshot((s: any) => {
    if (key !== useAppStore.getState().weekKey() || queue.pending('weeks/' + key)) return;
    const week = normWeek(s.exists ? s.data() : null);
    useAppStore.setState(state => ({ week, mDay: first ? loadedMDay(state) : state.mDay, ready: { ...state.ready, week: true } }));
    if (first && key === thisWeek) useAppStore.getState().refreshRan();
    first = false;
  }, () => flag('Couldn’t load this week. Reload the page.'));
}

/** The sync handle (status, the quarantine) when syncing through the API is on, else null. */
export const getSyncApi = () => syncApi;
