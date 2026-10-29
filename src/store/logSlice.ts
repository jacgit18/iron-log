import { exInfo } from '../lib/data.js';
import { fmtShort, parseDate } from '../shared/dates.js';
import { defaultLogDate, describe, lastSession, newEntryId, phaseOf, setItemDone } from '../lib/logic.js';
import { setExerciseDefault, setOverride } from './librarySlice.js';
import { entryId, findEntry } from '../lib/export.js';
import { bwSorted } from '../lib/body.js';
import { GOAL_KEYS, bestLift, goalPhaseLabel, liftGoalsOf } from '../lib/liftGoal.js';
import { normEntry, nowStamp, validFreq, validLiftGoalLb } from '../shared/validate.js';
import type { LogEntry } from '../types.ts';
import type { Flag, LogSlice, StoreGet, StoreSet } from './types.ts';

// Writing and editing log entries, and the lift and frequency goals.
export const logSlice = (set: StoreSet, get: StoreGet, flag: Flag): LogSlice => ({
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
    const last = lastSession(logs, s.items[idx].ex, phaseOf(cfg, week, s, idx)); if (!last) return;
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
    const goals = liftGoalsOf(get().cfg, it.ex, get().body).filter(([k]) => k === 'any' || k === (entry.ph || null));
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
  setLiftGoal(exId, key, raw, by, from, scale = false) {
    if (get().blocked()) return false;
    if (!GOAL_KEYS.includes(key)) { flag('Pick a phase for the goal'); return false; }
    const n = Number(raw); if (!validLiftGoalLb(n)) { flag('Enter a goal weight in lb'); return false; }
    if (by && !/^\d{4}-\d{2}-\d{2}$/.test(by)) { flag('Enter the goal date as a date'); return false; }
    const G = (get().cfg.liftGoals || {})[exId] || {};
    if (key !== from && G[key]) { flag(`There's already a ${goalPhaseLabel(key).toLowerCase()} goal`); return false; }
    const w = Math.round(n * 10) / 10; const old = G[from ?? key];
    const best = bestLift(get().logs[exId], key);
    const start = old && old.w === w && (from ?? key) === key ? old.start : (best ? best.w : 0); // changing only the date keeps the start
    // Scaling with body weight is anchored to your latest logged body weight, kept when only the date changes.
    let anchor: { bw: number; bwd: string } | null = null;
    if (scale) {
      const keep = old && old.bw && old.bwd && old.w === w ? { bw: old.bw, bwd: old.bwd } : null;
      const last = bwSorted(get().body).at(-1);
      if (!keep && !last) { flag('Log your body weight first'); return false; }
      anchor = keep || { bw: Number(last!.w), bwd: last!.d };
    }
    get().mutateCfg(c => {
      const g = { ...((c.liftGoals || {})[exId] || {}) }; if (from && from !== key) delete g[from];
      g[key] = { w, start, ...(by ? { by } : {}), ...(anchor || {}) };
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
  // How many times a week you want to do an exercise (1 to 7).
  setFreqGoal(exId, raw) {
    if (get().blocked()) return false;
    const n = Number(raw); if (!validFreq(n)) { flag('Pick 1 to 7 times a week'); return false; }
    if (!exId) { flag('Pick an exercise'); return false; }
    get().mutateCfg(c => { c.freqGoals = { ...(c.freqGoals || {}), [exId]: n }; });
    flag('Goal saved'); return true;
  },
  clearFreqGoal(exId) {
    const n = get().cfg.freqGoals?.[exId]; if (n == null) return;
    if (!get().mutateCfg(c => { const G = { ...(c.freqGoals || {}) }; delete G[exId]; if (Object.keys(G).length) c.freqGoals = G; else delete c.freqGoals; })) return;
    get().noteRemoved('freqgoal', `the ${exInfo(get().cfg, exId).n} frequency goal`, () => get().cfg.freqGoals?.[exId] == null && get().mutateCfg(c => { c.freqGoals = { ...(c.freqGoals || {}), [exId]: n }; }));
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
});
