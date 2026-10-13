import { create } from 'zustand';
import type { AppState, OrderNote, OrderState } from './types.ts';
import type { Cfg, FlatSlot, LibraryItem, LogEntry, Logs, PhaseKey, ProgKey, Program, Stretch, Week, WeekLayout } from '../types.ts';
import { catalogPickError, catalogSnapshot } from '../lib/catalogExercise.js';
import { BUILTIN, BLANK, warmupOf, resolveProgram, padLibrary, slotsFor, EX, exInfo, newExId, findExId, isVideoUrl, VIDEO_ERR, listBuiltinExercises, isOwnExercise, isCatalogId } from '../lib/data.js';
import { weekStartOf, ymd, addDays, fmtShort, parseDate } from '../shared/dates.js';
import {
  DEFAULT_CFG, normWeek, progName, weekProgKey, weekProgram, ranFor, isFrozen, programFor, phaseOf, lastLog, describe,
  setCardDone, setItemDone, clearDone, clearForSkip, isSkipped, currentLayout, dayAt, colOf, orderOf, DAYS, overflowSlots, restsOf, moveClashes, altDay, defaultLogDate, autoLogs, weekSlots,
  planFix, isFinished, autoEntry, newEntryId, normExperiments,
} from '../lib/logic.js';
import { LS, makeSaveQueue, removeLegacyGitHubToken } from '../lib/storage.js';
import { FLAG_KEY, apiSyncEnabled } from '../sync/flag.js';
import { mergeStretchWeek3, mergeWeek3 } from '../sync/merge.js';
import { stable } from '../sync/canon.js';
import type { ApiDb } from '../sync/apiDb.js';
import { editorSlice } from './editorSlice.js';
import { settingsSlice } from './settingsSlice.js';
import { wellnessSlice } from './wellnessSlice.js';
import { grocerySlice } from './grocerySlice.js';
import { removedSlice } from './removedSlice.js';
import { isAdminNow } from '../features.js';
import { normStretches, normStretchWeek } from '../lib/stretches.js';
import { normSupplements } from '../lib/water.js';
import { WEEK_RE } from '../lib/trends.js';
import {
  loadXLSX, buildCsv, buildOverallWorkbook, buildWeekWorkbook, buildDataFile,
  sameProg, entryId, findEntry, normConfig,
} from '../lib/export.js';
import { mimeFor } from '../lib/mime.js';
import { bwSorted } from '../lib/body.js';
import { usageOf } from '../lib/exerciseLibrary.js';
import { MUSCLE_MAP } from '../lib/muscles.js';
import { bestLift, liftGoalsOf, goalPhaseLabel, GOAL_KEYS } from '../lib/liftGoal.js';
import { loadView, saveView, openFromUrl } from '../lib/viewState.js';
import { useToday } from './useToday.js';
import { validRm, validLiftGoalLb, validBodyLb, normEntry, normEntries, normBody, normProgram, normLibrary, nowStamp, SCHEMA_VERSION } from '../shared/validate.js';

// Non-reactive handles for the async plumbing. `db` mirrors the optional Firestore-like host
// binding from the original app (window.claude.use('db')); without it everything uses localStorage.
let db: any = null; // the host's database handle (Firestore-like), or null for local storage
let syncApi: ApiDb | null = null; // set when the handle is the API-backed one (flag on)
let unsubWeek: (() => void) | null = null;
let flagT: ReturnType<typeof setTimeout> | null = null, flagHold: boolean | number = 0;
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


const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// What you set on an exercise (video link, equipment) applies everywhere it appears. cfg.ex keeps only
// what differs from the built-in entry; clearing a built-in value stores '' (or false) so the merge hides it.
// Your own exercise (synced, that includes one saved under a built-in id) keeps every value, so its cfg.ex entry never empties out.
function setOverride(c: Cfg, exId: string, vals: Record<string, unknown>) {
  const own = isOwnExercise(exId);
  const base: Record<string, any> = EX[exId] || {}; const o: Record<string, any> = { ...(c.ex[exId] || {}) };
  Object.entries(vals).forEach(([k, v]) => { if (v && (own || v !== base[k])) o[k] = v; else if (v) delete o[k]; else if (base[k]) o[k] = ''; else delete o[k]; });
  if (own && !o.n) o.n = EX[exId]?.n || exId;
  if (Object.keys(o).length) c.ex[exId] = o; else delete c.ex[exId];
}

// An exercise's default phase for every card. Slot defaults saved for that exercise would outrank it, so they go;
// a slot default saved afterwards wins again.
function setExerciseDefault(c: Cfg, exId: string, ph: PhaseKey | null | '', programs: Record<string, Program>, library: LibraryItem[]) {
  c.exPh = c.exPh || {};
  if (ph) c.exPh[exId] = ph; else delete c.exPh[exId];
  if (!ph) return;
  const progs = [...Object.values(programs), ...library.map(it => ({ ...it.prog, key: 'N' }))];
  progs.forEach(p => { try { slotsFor(p as Program).forEach(sl => sl.items.forEach((x, i) => { if (x.ex === exId) delete c.phDef[`${sl.id}:${i}`]; })); } catch { /* a malformed saved program */ } });
}

const sameTags = (a: Record<string, any>, b: Record<string, any>) => JSON.stringify([[...(a.p || [])].sort(), [...(a.s || [])].sort(), !!a.mob]) === JSON.stringify([[...(b.p || [])].sort(), [...(b.s || [])].sort(), !!b.mob]);

// Rest days, day order and rest date belong to the program being shown: switching programs parks them under the one left and
// brings back the ones parked for the one chosen, so a rest day ticked on one program never shows on the other.
function swapLayout(w: Week, from: ProgKey, to: ProgKey) {
  const stash = { ...(w.stash || {}) };
  const leaving: WeekLayout = {}; if (w.rest) leaving.rest = w.rest; if (w.order) leaving.order = w.order; if (w.restOn) leaving.restOn = w.restOn;
  if (Object.keys(leaving).length) stash[from] = leaving; else delete stash[from];
  const back = stash[to]; delete stash[to];
  delete w.rest; delete w.order; delete w.restOn;
  if (back) Object.assign(w, back);
  if (Object.keys(stash).length) w.stash = stash; else delete w.stash;
}
// Write a day order and rest days onto a week (the normal order is stored as no order). restOn stays with the rest days.
const writeOrder = (w: Week, { order, rest }: { order: number[]; rest: number[] }) => {
  if (order.every((v, k) => v === k + 1)) delete w.order; else w.order = [...order];
  if (rest.length) w.rest = [...rest]; else { delete w.rest; delete w.restOn; }
};
// One card's place for the week: `moved` is its week.moved value, null for its own day.
const writeMoved = (w: Week, { slot, moved }: { slot: string; moved: number | null }) => { if (moved == null) delete w.moved[slot]; else w.moved[slot] = moved; };
// What a suggestion note holds now: { order, rest } for a day order, { slot, moved } for one card.
const noteState = (n: OrderNote, w: Week): OrderState => (n.kind === 'card' ? { slot: n.next.slot, moved: w.moved[n.next.slot] ?? null } : { order: [...orderOf(w)], rest: restsOf(w) });
const sameState = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// The note for a planFix result: `next` is what Apply writes, `prev` what Put back restores.
const noteFor = (plan: any, week: Week, slots: FlatSlot[], wk: string, doneCol: number): OrderNote => {
  const note = { kind: plan.kind, week: wk, doneCol, lines: plan.lines, applied: false };
  if (plan.kind === 'card') {
    const s = slots.find(x => x.id === plan.slot)!;
    return { ...note, prev: { slot: plan.slot, moved: week.moved[plan.slot] ?? null }, next: { slot: plan.slot, moved: plan.pd === s.day ? null : plan.pd } };
  }
  return { ...note, prev: { order: [...orderOf(week)], rest: restsOf(week) }, next: { order: plan.order, rest: plan.rest } };
};
const sameNote = (a: OrderNote, b: OrderNote) => sameState([a.kind, a.lines, a.next], [b.kind, b.lines, b.next]);
// A week save that synced merged in another device's changes (ADR 031): the board takes the merged week once nothing more of it is
// waiting, and a save queued meanwhile (made from the week before the merge) gets the merge too, so it does not take them back out.
const rebaseWeek = (path: string, sent: unknown, next: unknown, stored: unknown) =>
  path.startsWith('weeks/') ? mergeWeek3(sent, next, stored).week : path.startsWith('stretchweeks/') ? mergeStretchWeek3(sent, next, stored).week : next;
function takeStoredWeek(path: string, doc: unknown) {
  const st = useAppStore.getState(); const wk = st.weekKey();
  if (path === 'weeks/' + wk) { const week = normWeek(doc); if (stable(week) !== stable(normWeek(st.week))) useAppStore.setState({ week }); }
  else if (path === 'stretchweeks/' + wk) { const strWeek = normStretchWeek(doc); if (stable(strWeek) !== stable(normStretchWeek(st.strWeek))) useAppStore.setState({ strWeek }); }
}
const queue = makeSaveQueue({
  getDb: () => db, onFlag: (t: string) => flag(t),
  onFailed: (paths: string[], refused: boolean) => useAppStore.setState(s => ({ unsaved: paths, refusals: s.refusals + (refused ? 1 : 0) })),
  onStored: takeStoredWeek, rebase: rebaseWeek,
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

const restored = loadView(ymd(new Date()));
// A home-screen shortcut (./?open=daily) wins over the remembered tab; the parameter is then dropped so a refresh does not re-apply it.
const shortcutTab = typeof location === 'undefined' ? undefined : openFromUrl(location.search);
if (shortcutTab) try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* ignore */ }
let keepMDay = restored.mDay != null; // the first week load must not clear a restored phone day
const loadedMDay = (state: AppState) => { const m = keepMDay ? state.mDay : null; keepMDay = false; return m; };

const allReady = (r: AppState['ready']) => r.cfg && r.logs && r.week && r.programs && r.lib && r.body && r.exp && r.str && r.strHist && r.strWeek && r.supp;

export const useAppStore = create<AppState>((set, get) => ({
  ...editorSlice(set, get, flag),
  ...settingsSlice(set, get, flag),
  ...wellnessSlice(set, get, flag),
  ...grocerySlice(set, get, flag),
  ...removedSlice(set, get, flag),
  cfg: structuredClone(DEFAULT_CFG),
  weekStart: weekStartOf(new Date()),
  week: normWeek(null),
  logs: {}, // exId -> [entries]
  unsaved: [], // doc paths whose last write was refused (storage full, permission): kept until a write succeeds
  refusals: 0, // writes refused so far this session
  sync: null, // how syncing through the API is going; null when it is off
  tab: shortcutTab || restored.tab || 'board',
  mDay: restored.mDay ?? null, // day shown on phones; null = pick the first day with open work
  library: [], // saved program versions
  experiments: [], // exercises to try: [{id, ex, ph, note}]
  body: [], // body weight: [{wk, d, w}], one per week
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  storeMode: 'loading',
  saveFlag: '',
  ready: { cfg: false, logs: false, week: false, programs: false, lib: false, body: false, exp: false, str: false, strHist: false, strWeek: false, supp: false },
  uncheckNote: null, // after an uncheck removed logged entries: {week, text, entries: {exId: [entry]}, done: {key: wasDone}}
  moveNote: null, // heads-up after a move puts the same exercise on the same or a neighboring day
  orderNote: null, // after a day is finished: {kind, week, doneCol, prev, next, lines, applied}; prev/next are {order, rest} for kind 'order', {slot, moved} for kind 'card'
  orderSkip: [], // 'week:column' suggestions dismissed this session
  modal: null, // {type:'log', slotId, idx} | {type:'detail', exId}
  weekHist: null, // every saved week, loaded on demand for Progress and exports
  historyLoading: false,
  dl: undefined, // downloads handle: undefined = not checked yet, null = unavailable

  // Muscles tab view state; kept here so it survives switching tabs, like the original.
  progView: 'trends', // Progress tab: 'trends' or 'muscles'
  setProgView: progView => set({ progView }),
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

  snapshot: () => { const s = get(); return { cfg: s.cfg, logs: s.logs, programs: s.programs, library: s.library, body: s.body, experiments: s.experiments, stretches: s.stretches, stretchExps: s.stretchExps, supp: s.supp, ...(isAdminNow() ? { grocery: { ...s.grocery, months: s.groceryMonths } } : {}) }; }, // the grocery list is an admin-only feature: no one else exports or backs it up

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

  // A change to check-offs from the board: exercises that became done log their planned numbers,
  // and ones that were unchecked (or skipped) lose that entry.
  // `removeLogged`: unticking a box also removes the entries you logged yourself for that card this week.
  // A box that was unticked leaves an Undo notice (`label` names what was unticked).
  mutateChecks(fn, { removeLogged = false, label = '' } = {}) {
    const slots = get().activeSlots(); const before = get().week; const logs = get().logs;
    if (!get().mutateWeek(fn)) return false;
    const changed = autoLogs(get().cfg, logs, slots, before, get().week, get().weekKey(), defaultLogDate(get().weekStart), { removeLogged });
    if (Object.keys(changed).length) {
      set(state => ({ logs: { ...state.logs, ...changed } }));
      Object.keys(changed).forEach(id => get().saveLog(id));
    }
    // Entries you logged yourself that this removed, kept so the uncheck can be undone.
    const entries: Logs = {}; let gone = 0;
    Object.keys(changed).forEach(id => {
      const kept = new Set(changed[id].map(e => JSON.stringify(e)));
      const lost = (logs[id] || []).filter(e => !e.auto && !kept.has(JSON.stringify(e)));
      if (lost.length) { entries[id] = lost; gone += lost.length; }
    });
    const done: Record<string, boolean> = {}; const after = get().week.done || {};
    new Set([...Object.keys(before.done || {}), ...Object.keys(after)]).forEach(k => { if (!!(before.done || {})[k] !== !!after[k]) done[k] = !!(before.done || {})[k]; });
    const unticked = Object.values(done).some(Boolean);
    get().suggestOrder(slots, before);
    if (removeLogged && unticked) {
      const text = `Unchecked${label ? ' ' + label : ''}${gone ? ` · removed ${gone} logged ${gone === 1 ? 'entry' : 'entries'}` : ''}.`;
      set({ uncheckNote: { week: get().weekKey(), text, entries, done } });
    } else if (get().uncheckNote) set({ uncheckNote: null }); // any other check-off change replaces the old notice
    return true;
  },
  // A check-off change (tick or skip) that finished a column suggests a fix for the days ahead (planFix): moving the
  // rest day, one card, or the day order. A change that un-finishes that column drops one not yet applied.
  suggestOrder(slots, before) {
    const { cfg, week } = get(); const wk = get().weekKey();
    const a = currentLayout(week, slots), b = currentLayout(before, slots);
    // One not yet applied follows the board: redone for its day (a tick may have started a day it would move), or
    // dropped once that day isn't finished or nothing helps any more.
    const n = get().orderNote;
    if (n && !n.applied && n.week === wk) {
      const plan = isFinished(a[n.doneCol], week) && planFix(cfg, week, slots, n.doneCol);
      const fresh = plan && noteFor(plan, week, slots, wk, n.doneCol);
      if (!fresh) set({ orderNote: null }); else if (!sameNote(fresh, n)) set({ orderNote: fresh });
    }
    const doneCol = DAYS.find(c => isFinished(a[c], week) && !isFinished(b[c], before));
    if (doneCol == null || get().orderSkip.includes(`${wk}:${doneCol}`)) return;
    const plan = planFix(cfg, week, slots, doneCol);
    if (plan) set({ orderNote: noteFor(plan, week, slots, wk, doneCol) });
  },
  canUndoOrder() {
    const n = get().orderNote;
    return !!(n && n.applied && n.week === get().weekKey() && sameState(noteState(n, get().week), n.next));
  },
  applyOrder() {
    const n = get().orderNote; if (!n || n.applied || n.week !== get().weekKey()) return false;
    // Only while it still fits the board: a change it didn't see (another device, the week's program) drops it.
    const slots = get().activeSlots(); const plan = planFix(get().cfg, get().week, slots, n.doneCol);
    if (!plan || !sameNote(noteFor(plan, get().week, slots, n.week, n.doneCol), n)) { set({ orderNote: null }); flag('The board changed, so that suggestion no longer fits'); return false; }
    if (!get().mutateWeek(w => (n.kind === 'card' ? writeMoved(w, n.next) : writeOrder(w, n.next)))) return false;
    set({ orderNote: { ...n, applied: true }, moveNote: null });
    flag(n.kind === 'card' ? 'Moved for this week' : 'Order changed for this week');
    return true;
  },
  undoOrder() {
    const n = get().orderNote; if (!n || !get().canUndoOrder()) return false;
    if (!get().mutateWeek(w => (n.kind === 'card' ? writeMoved(w, n.prev) : writeOrder(w, n.prev)))) return false;
    set({ orderNote: null });
    flag(n.kind === 'card' ? 'Move put back' : 'Order put back');
    return true;
  },
  dismissOrder() {
    const n = get().orderNote; if (!n) return;
    set({ orderNote: null, orderSkip: n.applied ? get().orderSkip : [...get().orderSkip, `${n.week}:${n.doneCol}`] });
  },
  // Put back what the last uncheck removed: the entries, and the ticks.
  undoUncheck() {
    const n = get().uncheckNote; if (!n || n.week !== get().weekKey() || get().blocked()) return;
    set({ uncheckNote: null });
    const logs = { ...get().logs };
    Object.entries(n.entries).forEach(([id, lost]) => {
      const have = new Set((logs[id] || []).map(e => JSON.stringify(e)));
      logs[id] = [...(logs[id] || []), ...lost.filter(e => !have.has(JSON.stringify(e)))].sort((a, b) => a.d.localeCompare(b.d));
    });
    set({ logs }); Object.keys(n.entries).forEach(id => get().saveLog(id));
    // Ticking again through the check-off path, so a card without logged numbers gets its check-off entry back too.
    get().mutateChecks(w => { w.done = w.done || {}; Object.entries(n.done).forEach(([k, on]) => { if (on) w.done[k] = true; else delete w.done[k]; }); });
    flag('Put back');
  },
  dismissUncheck: () => set({ uncheckNote: null }),
  checkCard(slotId, on) { const s = get().slotById(slotId); if (s) get().mutateChecks(w => setCardDone(w, s, on), { removeLogged: true, label: s.items.map(it => exInfo(get().cfg, it.ex).n).join(' → ') }); },
  checkItem(slotId, idx, on) { const s = get().slotById(slotId); if (s) get().mutateChecks(w => setItemDone(w, s, idx, on), { removeLogged: true, label: exInfo(get().cfg, s.items[idx].ex).n }); },
  checkDay(day, on) {
    const slots = get().activeSlots();
    get().mutateChecks(w => currentLayout(w, slots)[day].forEach(s => { if (!isSkipped(s, w)) setCardDone(w, s, on); }), { removeLogged: true, label: `Day ${day}` });
  },
  skipCard(slotId) {
    const s = get().slotById(slotId); let skipped = false;
    const ok = get().mutateChecks(w => {
      w.skipped = w.skipped || {};
      if (w.skipped[slotId]) delete w.skipped[slotId];
      else { w.skipped[slotId] = true; skipped = true; if (s) clearForSkip(w, s); else delete w.done[slotId]; }
    });
    if (ok) flag(skipped ? 'Skipped for this week' : 'Skip undone');
  },
  // Yesterday's leftovers: skip or move a batch of cards at once.
  skipCards(ids) {
    const ok = get().mutateChecks(w => ids.forEach(id => { const s = get().slotById(id); w.skipped[id] = true; if (s) clearForSkip(w, s); }));
    if (ok) flag(`Skipped ${ids.length} for this week`);
  },
  moveCards(ids, day) {
    const week0 = get().week; const pd = dayAt(week0, day);
    if (pd == null) { flag('That is your rest day'); return; }
    const cards = ids.map(id => get().slotById(id)).filter((s): s is FlatSlot => !!s); if (!cards.length) return;
    const batch = Object.fromEntries(cards.map(s => [s.id, week0.moved[s.id] ?? null])); // what undo puts back
    if (!get().mutateWeek(w => cards.forEach(s => { if (pd === s.day) delete w.moved[s.id]; else w.moved[s.id] = pd; }))) return;
    set({ orderNote: null });
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
    if (!isVideoUrl(d.nu)) return VIDEO_ERR;
    const ex = d.ex === '__new' ? get().createExercise(d) : d.ex;
    if (d.ex !== '__new') { get().applyExerciseUrl(ex, d.nu); get().applyExerciseEq(ex, d.ne); }
    const item = { id: d.id || uid('E'), ex, ph: d.ph || null, note: (d.note || '').trim().slice(0, 200) };
    const list = get().experiments;
    get().setExperiments(d.id ? list.map(x => (x.id === d.id ? item : x)) : [...list, item]);
    set({ modal: null }); flag('Saved'); return null;
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
    if (d.cat) { const err = catalogPickError(get().cfg, d.cat); if (err) return err; }
    let ex: string;
    if (d.cat && !get().cfg.ex[d.cat.id]) { // picked from the catalog: joins the library with the card (ADR 036)
      const id = d.cat.id; const { info, tags } = catalogSnapshot(d.cat, d); ex = id;
      get().mutateCfg(c => { c.ex[id] = info; if (tags) c.muscleMap = { ...(c.muscleMap || {}), [id]: tags }; });
    } else if (d.ex === '__new') ex = get().createExercise(d);
    else { ex = d.cat ? d.cat.id : d.ex; get().applyExerciseUrl(ex, d.nu); get().applyExerciseEq(ex, d.ne); }
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
    const err = catalogPickError(cfg, item); if (err) return err;
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
      clearDone(w, s); delete w.skipped[slotId]; delete w.moved[slotId]; delete w.ph[`${slotId}:0`];
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
  // Cards a rest day on column n would push off the board and that are still in play (not skipped).
  restOverflow(n) { const w = get().week; return restsOf(w).includes(n) ? [] : overflowSlots(w, get().activeSlots(), n).filter(s => !isSkipped(s, w)); },
  // Tick or untick a rest day. A week can have several. Ticking one that would push workouts off the board is
  // refused unless skipOverflow is set, which skips those workouts for the week (unticking brings them back).
  setRestDay(n, { skipOverflow = false } = {}) {
    const w = get().week; const on = restsOf(w).includes(n);
    const over = get().restOverflow(n);
    if (over.length) {
      if (!skipOverflow) { flag(`A rest day on Day ${n} would push ${over.length === 1 ? 'a workout' : `${over.length} workouts`} off the week. Move ${over.length === 1 ? 'it' : 'them'} or skip ${over.length === 1 ? 'it' : 'them'} for this week first.`); return false; }
      get().skipCards(over.map(s => s.id));
    }
    set({ moveNote: null, orderNote: null });
    const date = defaultLogDate(get().weekStart);
    return get().mutateWeek(x => {
      const rest = restsOf(x);
      if (on) { const left = rest.filter(r => r !== n); if (left.length) x.rest = left; else { delete x.rest; delete x.restOn; } }
      else { x.rest = [...rest, n].sort((a, b) => a - b); x.restOn = x.restOn || date; }
    });
  },
  // Swap displayed column d with its neighbor d + dir, for this week. Swapping with a rest column moves that rest day.
  swapDays(d, dir) {
    const e = d + dir; if (e < 1 || e > DAYS.length) return false;
    const w = get().week; const rest = restsOf(w); const dRest = rest.includes(d), eRest = rest.includes(e);
    if (dRest && eRest) return false;
    const restInvolved = dRest || eRest;
    const ok = get().mutateWeek(x => {
      if (restInvolved) x.rest = restsOf(x).map(r => (r === d ? e : r === e ? d : r)).sort((a, b) => a - b);
      else {
        const a = dayAt(x, d) as number, b = dayAt(x, e) as number; const o = [...orderOf(x)];
        const i = o.indexOf(a), j = o.indexOf(b); [o[i], o[j]] = [o[j], o[i]];
        if (o.every((v, k) => v === k + 1)) delete x.order; else x.order = o;
      }
    });
    if (!ok) return false;
    set({ moveNote: null, orderNote: null, mDay: e });
    flag(restInvolved ? `Rest day moved to Day ${dRest ? e : d}` : `Day ${d} swapped with Day ${e}`);
    return true;
  },
  setPhase(slotId, idx, ph) {
    if (!get().mutateWeek(w => { w.ph[`${slotId}:${idx}`] = ph; })) return;
    // A check-off already logged for it is redone in the new phase, so Progress and the next target see what was planned.
    const s = get().slotById(slotId); if (!s || !s.items[idx]) return;
    const ex = s.items[idx].ex; const wk = get().weekKey(); const L = get().logs[ex] || [];
    const k = L.findIndex(e => e.auto && e.slot === slotId && e.wk === wk); if (k < 0) return;
    const others = { ...get().logs, [ex]: L.filter((_, j) => j !== k) };
    const arr = [...L]; arr[k] = { ...autoEntry(get().cfg, others, s, idx, get().week, wk, L[k].d), id: L[k].id || newEntryId() };
    set(state => ({ logs: { ...state.logs, [ex]: arr } })); get().saveLog(ex);
  },
  // Choosing the program of a week that is over takes today's version of it: its old record is for the other one. Choosing the
  // program it already shows changes nothing, so its record stays.
  setWeekProg(k) { const from = get().activeProgKey(); if (k === from) return; const auto = programFor(get().cfg, get().weekStart); if (get().mutateWeek(w => { swapLayout(w, from, k); w.prog = k === auto ? null : k; delete w.ran; })) set({ orderNote: null }); },
  setMode(mode) { if (get().mutateCfg(c => { c.mode = mode; })) get().refreshRan(); },

  moveSlot(slotId, day) {
    const s = get().slotById(slotId); if (!s) return;
    const week0 = get().week;
    const pd = dayAt(week0, day); // `day` is the displayed column; cards are stored by program day
    if (pd == null) { flag('That is your rest day'); return; }
    const from = week0.moved[slotId] || s.day;
    const ok = get().mutateWeek(w => { if (pd === s.day) delete w.moved[slotId]; else w.moved[slotId] = pd; });
    if (!ok) return;
    set({ orderNote: null });
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
      if (get().mutateWeek(w => Object.entries(n.batch!).forEach(([id, v]) => { if (v == null) delete w.moved[id]; else w.moved[id] = v; }))) flag(`Moved back to Day ${n.fromShown}`);
      return;
    }
    const s = get().slotById(n.slot!); set({ moveNote: null });
    if (s && get().mutateWeek(w => { if (n.from === s.day) delete w.moved[n.slot!]; else w.moved[n.slot!] = n.from as number; })) flag(`Moved back to Day ${n.fromShown}`);
  },
  dismissMove: () => set({ moveNote: null }),

  gotoWeek(which) {
    const cur = get().weekStart;
    set({ mDay: null, moveNote: null, orderNote: null, weekStart: which === 'today' ? weekStartOf(new Date()) : addDays(cur, which === 'prev' ? -7 : 7) });
    subscribeWeek();
  },

  // Append a log entry (kept sorted by date), optionally checking the exercise off.
  addEntry(slotId, idx, entry, { check } = {}) {
    if (get().blocked()) return false;
    const s = get().slotById(slotId); if (!s) return false;
    const clean = normEntry(entry); if (!clean) { flag('That session has an invalid date'); return false; }
    const ex = s.items[idx].ex;
    // Real numbers replace the planned ones a check-off logged for this card this week.
    const planned = (e: any) => e.auto && e.slot === entry.slot && e.wk === entry.wk;
    const arr = [...(get().logs[ex] || []).filter(e => !planned(e)), { ...clean, id: clean.id || newEntryId(), updatedAt: nowStamp() }].sort((a, b) => a.d.localeCompare(b.d));
    set(state => ({ logs: { ...state.logs, [ex]: arr } })); get().saveLog(ex);
    // Ticked the way the board ticks: picking the other half of an either/or drops the first one's check-off, and it can finish a day.
    if (check) get().mutateChecks(w => setItemDone(w, s, idx, true));
    return true;
  },
  quickLog(slotId, idx) {
    const s = get().slotById(slotId); if (!s) return;
    const { cfg, week, logs } = get();
    const last = lastLog(logs, s.items[idx].ex, phaseOf(cfg, week, s, idx)); if (!last) return;
    // Once per card and week: a second tap (the button stays on the card) would log the session twice.
    if ((logs[s.items[idx].ex] || []).some(e => !e.auto && e.slot === slotId && e.wk === get().weekKey())) { flag('Already logged this week'); return; }
    const e: LogEntry = { d: defaultLogDate(get().weekStart), ph: last.ph || null, w: last.w, s: last.s, slot: slotId, wk: get().weekKey() };
    if (last.sec != null) e.sec = last.sec; else e.r = last.r;
    if (Array.isArray(last.sets)) e.sets = structuredClone(last.sets);
    if (get().addEntry(slotId, idx, e, { check: true })) flag(`Logged ${describe(e)}`);
  },
  // The log sheet's save: entry + optional phase change / phase default / 1RM / check-off.
  submitLog(slotId, idx, { entry, ph, makeDefault, makeExDefault, rm, done, eq, url }) {
    if (get().blocked()) return false;
    const s = get().slotById(slotId); if (!s) return false;
    const it = s.items[idx]; const key = `${slotId}:${idx}`;
    const goals = liftGoalsOf(get().cfg, it.ex).filter(([k]) => k === 'any' || k === (entry.ph || null));
    const before = goals.map(([k]) => bestLift(get().logs[it.ex], k));
    if (!get().addEntry(slotId, idx, entry)) return false; // refused (invalid date): nothing else from the sheet is applied
    get().applyExerciseUrl(it.ex, url);
    const { cfg, week } = get();
    // Every card of this exercise in the shown week, on any day (added cards included).
    const sameEx = (get().activeSlots()).flatMap(sl => sl.items.map((x, i) => x.ex === it.ex && `${sl.id}:${i}`).filter((k): k is string => !!k));
    const eqChange = eq !== undefined && eq !== (exInfo(cfg, it.ex).eq || '');
    const cfgChange = eqChange || ((makeDefault || makeExDefault) && ph) || (rm === null ? cfg.rm[it.ex] != null : ((rm ?? 0) > 0 && rm !== cfg.rm[it.ex]));
    if (cfgChange) get().mutateCfg(c => {
      if (eqChange) setOverride(c, it.ex, { eq });
      if (makeExDefault && ph) { setExerciseDefault(c, it.ex, ph, get().programs, get().library); sameEx.forEach(k => { delete c.phDef[k]; }); }
      if (makeDefault && ph) c.phDef[key] = ph; // after the exercise default, so ticking both keeps this slot's
      if (rm === null) delete c.rm[it.ex]; else if (rm != null && rm > 0) c.rm[it.ex] = rm;
    });
    get().mutateChecks(w => {
      if (ph && ph !== phaseOf(cfg, week, s, idx)) w.ph[key] = ph;
      if (makeExDefault && ph) sameEx.forEach(k => { delete w.ph[k]; });
      if ((makeDefault || makeExDefault) && ph) delete w.ph[key];
      if (done) setItemDone(w, s, idx, true);
    });
    const hit = goals.find(([k, g], i) => { const after = bestLift(get().logs[it.ex], k); return after && after.w >= g.w && !(before[i] && before[i].w >= g.w); });
    if (hit) flag(`Goal reached: ${hit[1].w} lb on ${exInfo(get().cfg, it.ex).n}${hit[0] !== 'any' ? ` (${goalPhaseLabel(hit[0])})` : ''}`);
    return true;
  },
  // Weight you want to lift on an exercise, in one phase or any ('any'), optionally by a date. Your best so far
  // in that phase is kept as the starting point. Passing `from` moves an existing goal to a different phase.
  setLiftGoal(exId, key, raw, by, from) {
    if (get().blocked()) return false;
    if (!GOAL_KEYS.includes(key)) { flag('Pick a phase for the goal'); return false; }
    const n = Number(raw); if (!validLiftGoalLb(n)) { flag('Enter a goal weight in lb'); return false; }
    if (by && !/^\d{4}-\d{2}-\d{2}$/.test(by)) { flag('Enter the goal date as a date'); return false; }
    const G = (get().cfg.liftGoals || {})[exId] || {};
    if (key !== from && G[key]) { flag(`There's already a ${goalPhaseLabel(key).toLowerCase()} goal`); return false; }
    const w = Math.round(n * 10) / 10; const old = G[from ?? key];
    const best = bestLift(get().logs[exId], key);
    const start = old && old.w === w && (from ?? key) === key ? old.start : (best ? best.w : 0); // changing only the date keeps the start
    get().mutateCfg(c => {
      const g = { ...((c.liftGoals || {})[exId] || {}) }; if (from && from !== key) delete g[from];
      g[key] = { w, start, ...(by ? { by } : {}) };
      c.liftGoals = { ...(c.liftGoals || {}), [exId]: g };
    });
    flag('Goal saved'); return true;
  },
  clearLiftGoal(exId, key) {
    const goal = get().cfg.liftGoals?.[exId]?.[key]; if (!goal) return;
    if (!get().mutateCfg(c => {
      const G = c.liftGoals && c.liftGoals[exId]; if (!G) return;
      delete G[key]; if (!Object.keys(G).length) delete c.liftGoals![exId];
      if (!Object.keys(c.liftGoals!).length) delete c.liftGoals;
    })) return;
    // Undo only if no goal for that phase was set since.
    get().noteRemoved('liftgoal:' + exId, `the ${goalPhaseLabel(key).toLowerCase()} goal`, () => !get().cfg.liftGoals?.[exId]?.[key] && get().mutateCfg(c => {
      c.liftGoals = { ...(c.liftGoals || {}), [exId]: { ...((c.liftGoals || {})[exId] || {}), [key]: goal } };
    }));
  },
  // Replace one logged session with edited numbers (kept sorted by date). It counts as logged by hand, not as a check-off.
  // `target` is the entry as it was shown: found by identity, not position, so a list that changed meanwhile
  // (another device) can't make the edit land on a different session. It keeps its identity.
  updateLog(exId, target, entry) {
    if (get().blocked()) return false;
    const clean = normEntry(entry); if (!clean) { flag('That session has an invalid date'); return false; }
    const L = get().logs[exId] || []; const i = findEntry(L, target);
    if (i < 0) { flag('That session changed meanwhile. Open it again.'); return false; }
    const arr = [...L]; arr[i] = { ...clean, id: entryId(L[i]), updatedAt: nowStamp() };
    arr.sort((a, b) => a.d.localeCompare(b.d));
    set(state => ({ logs: { ...state.logs, [exId]: arr } })); get().saveLog(exId);
    flag('Session updated'); return true;
  },
  deleteLog(exId, target) {
    if (get().blocked()) return false;
    const L = get().logs[exId] || []; const i = findEntry(L, target);
    if (i < 0) { flag('That session changed meanwhile. Open it again.'); return false; }
    const arr = [...L]; const [gone] = arr.splice(i, 1);
    set(state => ({ logs: { ...state.logs, [exId]: arr } })); get().saveLog(exId);
    // Undo puts the same entry (same id) back, unless it is there again, or a check-off has since logged that card and week.
    get().noteRemoved('log:' + exId, `the ${fmtShort(parseDate(gone.d))} session`, () => {
      const cur = get().logs[exId] || [];
      if (get().blocked() || findEntry(cur, gone) >= 0 || (gone.auto && cur.some(e => e.slot === gone.slot && e.wk === gone.wk))) return false;
      const back = [...cur]; back.splice(Math.min(i, back.length), 0, gone); back.sort((a, b) => a.d.localeCompare(b.d));
      set(state => ({ logs: { ...state.logs, [exId]: back } })); get().saveLog(exId); return true;
    });
    return true;
  },
  // Try the writes that were refused again (after freeing space, or signing back in).
  retryUnsaved() { queue.retryFailed(); },

  // Erase parts of the data: {logs, weeks, body, programs, settings}. Display options are kept; files you exported aren't touched.
  async eraseData(parts) {
    if (get().blocked()) return false;
    if (parts.weeks) {
      const all = await get().allWeeks();
      Object.keys(all).forEach(k => { if (WEEK_RE.test(k)) get().removeDoc('weeks/' + k); });
      set({ week: normWeek(null), weekHist: null, moveNote: null, orderNote: null, uncheckNote: null, mDay: null });
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

  saveBodyWeight(v) {
    if (get().blocked()) return false;
    const n = Number(v); if (!validBodyLb(n)) { flag('Enter your weight in lb'); return false; }
    const wk = get().weekKey(); const today = ymd(new Date());
    const d = (today >= wk && today <= ymd(addDays(get().weekStart, 6))) ? today : wk;
    set(state => ({ body: [...state.body.filter(e => e.wk !== wk), { wk, d, w: Math.round(n * 10) / 10, updatedAt: nowStamp() }].sort((a, b) => a.wk.localeCompare(b.wk)) }));
    get().saveBody();
    const g = get().cfg.bwGoal; if (g && !g.start) get().mutateCfg(c => { c.bwGoal = { ...g, start: { w: Math.round(n * 10) / 10, d } }; }); // first weigh-in after setting a goal
    flag('Body weight saved'); return true;
  },
  // Target body weight, optionally by a date. Where you are now is kept as the starting point for progress.
  setBodyGoal(raw, by) {
    if (get().blocked()) return false;
    const n = Number(raw); if (!validBodyLb(n)) { flag('Enter a target weight in lb'); return false; }
    if (by && !/^\d{4}-\d{2}-\d{2}$/.test(by)) { flag('Enter the goal date as a date'); return false; }
    const L = bwSorted(get().body); const last = L[L.length - 1];
    const goal = { w: Math.round(n * 10) / 10, ...(last ? { start: { w: last.w, d: last.d } } : {}), ...(by ? { by } : {}) };
    get().mutateCfg(c => { c.bwGoal = goal; }); flag('Goal saved'); return true;
  },
  clearBodyGoal() {
    const g = get().cfg.bwGoal; if (!g || !get().mutateCfg(c => { delete c.bwGoal; })) return;
    get().noteRemoved('body', `your ${g.w} lb goal`, () => !get().cfg.bwGoal && get().mutateCfg(c => { c.bwGoal = g; }));
  },
  deleteBodyWeight(wk) {
    if (get().blocked()) return;
    const gone = get().body.find(x => x.wk === wk); if (!gone) return;
    set(state => ({ body: state.body.filter(x => x.wk !== wk) })); get().saveBody();
    // Undo only if that week has not been weighed again since.
    get().noteRemoved('body', `the ${fmtShort(parseDate(gone.d))} weigh-in`, () => {
      if (get().blocked() || get().body.some(x => x.wk === wk)) return false;
      set(state => ({ body: [...state.body, gone].sort((a, b) => a.wk.localeCompare(b.wk)) })); get().saveBody(); return true;
    });
  },

  exporting: null, // which export is running: 'csv' | 'xlsx-all' | 'xlsx-week' | 'data'

  async runExport(kind, fn) {
    const dl = get().dl; if (!dl || get().exporting) return;
    set({ exporting: kind });
    try { await fn(dl); flag('Exported'); }
    catch (err) {
      const e = err as { code?: string; message?: string } | null;
      const c = e && e.code;
      if (c === 'declined') { /* user closed the save prompt */ }
      else if (c === 'rate_limited') flag('A save prompt is already open');
      // One failed export never hides the others: every kind saves through the same `dl`, and Export all data is the one backup.
      else flag(e && e.message && !c ? e.message : 'Export isn’t available here');
    } finally { set({ exporting: null }); }
  },
  exportCsv() { return get().runExport('csv', dl => dl.save({ filename: `iron-log-${ymd(new Date())}.csv`, data: buildCsv(get().snapshot()) })); },
  // The file an export produces, built the same way for every download.
  async buildExportFile(kind) {
    if (kind === 'data') {
      const d = buildDataFile(await get().fullSnapshot(), await get().allWeeks());
      return { filename: `iron-log-data-${ymd(new Date())}.json`, data: JSON.stringify(d, null, 1) };
    }
    const which = kind === 'xlsx-week' ? 'week' : 'all';
    const X = await loadXLSX(); const S = get().snapshot();
    const wb = which === 'week' ? buildWeekWorkbook(X, S, get().weekKey(), get().week) : buildOverallWorkbook(X, S, await get().allWeeks());
    const data = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
    return { filename: which === 'week' ? `iron-log-week-${get().weekKey()}.xlsx` : `iron-log-${ymd(new Date())}.xlsx`, data };
  },
  downloadExcel(which) {
    return get().runExport(`xlsx-${which}`, async dl => { await dl.save(await get().buildExportFile(`xlsx-${which}`)); });
  },
  downloadData() {
    return get().runExport('data', async dl => { await dl.save(await get().buildExportFile('data')); });
  },

  async init() {
    if (initStarted) return; // StrictMode runs mount effects twice in dev; subscribe once
    initStarted = true;
    removeLegacyGitHubToken(); // one-time cleanup of the retired GitHub backup token
    get().loadGrocery(); // device-only: read from this browser's storage whatever the data source turns out to be
    const host = window.claude && window.claude.use ? (window.claude as { use: (name: string) => Promise<any> }) : null;
    (async () => { try { set({ dl: host ? await host.use('downloads') : blobSave }); } catch { set({ dl: null }); } })();
    try { db = (window.claude && window.claude.use) ? await window.claude.use('db') : null; } catch { db = null; }
    // With the flag on (and no host database), the same handle is backed by the API: see src/sync/apiDb.ts.
    if (!db && apiSyncEnabled(LS.get(FLAG_KEY), import.meta.env.VITE_API_SYNC)) {
      try {
        const { createBrowserApiDb } = await import('../sync/browser.js');
        syncApi = createBrowserApiDb({ onOwnerChange: () => { get().clearGrocery(); LS.remove('ran-recorded/db'); } }); // a new account's old weeks need their record too
        db = syncApi;
        syncApi.onStatus(sync => useAppStore.setState({ sync }));
        useAppStore.setState({ sync: syncApi.status() });
        syncApi.start();
      } catch (err) { console.error('SYNC INIT FAILED', err); db = null; syncApi = null; } // the app still works from this browser's storage
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
        stretches: normStretches(LS.get('stretches/main')).items,
        stretchExps: normStretches(LS.get('stretches/main')).experiments,
        supp: normSupplements(LS.get('supplements/main')),
        logs,
        programs: { A: loadProgram('A', LS.get('programs/A')), B: loadProgram('B', LS.get('programs/B')) },
        ready: { ...state.ready, cfg: true, logs: true, programs: true, lib: true, body: true, exp: true, str: true, strHist: true, supp: true },
      }));
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
  else if (path === 'programs/A' || path === 'programs/B') { const k = path.slice(9); set(s => ({ programs: { ...s.programs, [k]: loadProgram(k as 'A' | 'B', v) } })); useAppStore.getState().refreshRan(); }
  else if (path === 'stretches/main') { const d = normStretches(v); set({ stretches: d.items, stretchExps: d.experiments }); }
  else if (path === 'supplements/main') set({ supp: normSupplements(v) });
  else if (path === 'stretchweeks/' + wk) set({ strWeek: normStretchWeek(v) });
}

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
