import { exInfo } from '../lib/data.js';
import { addDays, ymd } from '../shared/dates.js';
import { DAYS, altDay, autoEntry, colOf, dayAt, injuryPreventionOn, isSkipped, moveClashes, newEntryId, orderAfterUntick, orderOf, overflowSlots, programFor, restDateCap, restDatesOf, restInPlace, restOwnDate, restsOf, workoutsOf } from '../lib/logic.js';
import type { ProgKey, Week, WeekLayout } from '../types.ts';
import type { Flag, ProgramSlice, StoreGet, StoreSet } from './types.ts';

let swapFlashTimer: ReturnType<typeof setTimeout> | null = null;
const SWAP_FLASH_MS = 1800; // how long the two swapped days stay outlined

// Rest days, day order and rest date belong to the program being shown: switching programs parks them under the one left and
// brings back the ones parked for the one chosen, so a rest day ticked on one program never shows on the other.
export function swapLayout(w: Week, from: ProgKey, to: ProgKey) {
  const stash = { ...(w.stash || {}) };
  const leaving: WeekLayout = {}; if (w.rest) leaving.rest = w.rest; if (w.order) leaving.order = w.order; if (w.restOn) leaving.restOn = w.restOn;
  if (Object.keys(leaving).length) stash[from] = leaving; else delete stash[from];
  const back = stash[to]; delete stash[to];
  delete w.rest; delete w.order; delete w.restOn;
  if (back) Object.assign(w, back);
  if (Object.keys(stash).length) w.stash = stash; else delete w.stash;
}

// Rest days, day swaps, phases and the week's program, and moving a card to another day.
export const programSlice = (set: StoreSet, get: StoreGet, flag: Flag): ProgramSlice => ({
  // Cards a rest day on column n would push off the board and that are still in play (not skipped). None when the rest takes an
  // empty day's place (restInPlace): nothing shifts then.
  restOverflow(n) {
    const w = get().week; const slots = get().activeSlots();
    if (restsOf(w).includes(n) || restInPlace(w, slots, n)) return [];
    return overflowSlots(w, slots, n).filter(s => !isSkipped(s, w));
  },
  // Tick or untick a rest day. A week can have several, each with its own date. A rest on an empty day takes its place in the
  // week. Otherwise it pushes later workouts one day later; one workout that no longer fits is skipped for the week (with a
  // message), two or more are refused unless skipOverflow is set. Unticking puts everything back (skipped workouts show again).
  setRestDay(n, { skipOverflow = false } = {}) {
    const w = get().week; const rests = restsOf(w); const on = rests.includes(n); const slots = get().activeSlots();
    const inPlace = on ? null : restInPlace(w, slots, n);
    const over = on || inPlace ? [] : overflowSlots(w, slots, n).filter(s => !isSkipped(s, w)); // same as restOverflow, without computing restInPlace again
    const workouts = workoutsOf(w, over);
    if (workouts.length > 1 && !skipOverflow) { flag(`A rest day on Day ${n} would push ${workouts.length} workouts off the week. Move them or skip them for this week first.`); return false; }
    set({ moveNote: null, orderNote: null });
    const ok = get().mutateWeek(x => {
      const rest = restsOf(x); const dates = restDatesOf(x);
      if (on) {
        const left = rest.filter(r => r !== n); const back = orderAfterUntick(x, slots, n);
        if (back) { if (back.every((v, k) => v === k + 1)) delete x.order; else x.order = back; }
        delete dates[n];
        if (left.length) { x.rest = left; if (Object.keys(dates).length) x.restOn = dates; else delete x.restOn; } else { delete x.rest; delete x.restOn; }
      } else {
        x.rest = [...rest, n].sort((a, b) => a - b);
        x.restOn = { ...dates, [n]: restOwnDate(get().weekStart, n) };
        if (inPlace) { if (inPlace.every((v, k) => v === k + 1)) delete x.order; else x.order = inPlace; }
      }
    });
    if (ok && over.length) {
      get().skipCards(over.map(s => s.id)); // only once the rest is written
      const names = (l: typeof over) => { const ns = [...new Set(l.flatMap(s => s.items.map(it => exInfo(get().cfg, it.ex).n)))]; return ns.length > 2 ? `${ns.slice(0, 2).join(', ')} and ${ns.length - 2} more` : ns.join(' and '); };
      if (workouts.length === 1) flag(`Day ${n} is a rest day now. The workout that moved off the end of the week (${names(over)}) was skipped. Untick Rest to see it again.`);
    }
    return ok;
  },
  // Change the date of a rest day (it must be a day of this week, no later than today).
  setRestDate(n, date) {
    const w = get().week; const ws = ymd(get().weekStart);
    if (!restsOf(w).includes(n) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < ws || date > ymd(addDays(get().weekStart, 6)) || date > restDateCap(get().weekStart)) return false;
    return get().mutateWeek(x => { x.restOn = { ...restDatesOf(x), [n]: date }; });
  },
  // Swap displayed column d with its neighbor d + dir, for this week. Swapping with a rest column moves that rest day.
  swapDays(d, dir) {
    const e = d + dir; if (e < 1 || e > DAYS.length) return false;
    const w = get().week; const rest = restsOf(w); const dRest = rest.includes(d), eRest = rest.includes(e);
    if (dRest && eRest) return false;
    const restInvolved = dRest || eRest;
    const ok = get().mutateWeek(x => {
      if (restInvolved) {
        const was = restsOf(x); const dates = restDatesOf(x);
        x.rest = was.map(r => (r === d ? e : r === e ? d : r)).sort((a, b) => a - b);
        const moved = Object.fromEntries(was.filter(r => dates[r]).map(r => [r === d ? e : r === e ? d : r, dates[r]])); // each date stays with its rest
        if (Object.keys(moved).length) x.restOn = moved; else delete x.restOn;
      }
      else {
        const a = dayAt(x, d) as number, b = dayAt(x, e) as number; const o = [...orderOf(x)];
        const i = o.indexOf(a), j = o.indexOf(b); [o[i], o[j]] = [o[j], o[i]];
        if (o.every((v, k) => v === k + 1)) delete x.order; else x.order = o;
      }
    });
    if (!ok) return false;
    set({ moveNote: null, orderNote: null, mDay: e, swapFlash: [d, e] });
    if (swapFlashTimer) clearTimeout(swapFlashTimer);
    swapFlashTimer = setTimeout(() => set({ swapFlash: null }), SWAP_FLASH_MS);
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
    const warn = clashes.length > 0 && injuryPreventionOn(cfg);
    set({ moveNote: warn ? { slot: slotId, from, fromShown, to: day, week: get().weekKey(), lines: clashes, alt: altDay(cfg, week, slots, s, day, fromShown) } : null });
    if (!warn) flag(`Moved to Day ${day}`); // a heads-up is its own notice
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
});
