import { BUILTIN, slotsFor, newExId, isVideoUrl, VIDEO_ERR } from '../lib/data.js';
import { progName, dayAt, DAYS, colOf, currentLayout, isFinished } from '../lib/logic.js';
import { addDays, weekStartOf, ymd } from '../shared/dates.js';
import type { PhaseChoice, Flag, StoreGet, StoreSet, EditorSlice } from './types.ts';
import type { ExerciseInfo, LibraryItem, Program, ProgramItem, ProgramSlot, PhaseKey, ProgKey } from '../types.ts';
import { progBody, sameProg, libDate } from '../lib/export.js';

export const SECTIONS = ['Optional', 'Regular', 'Supersets', 'Plyometric', 'Home']; // Optional and Home cards don't count toward finishing a day (countsForFinish)
const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// A slot saved without an id takes one from its position when the board reads it (`slotsFor` in lib/data.ts), and phase
// defaults and the week's ticks are keyed by that id. Write it down before a reorder, so they stay with the card that moved.
const pinIds = (prog: Program, day: number) => {
  if (prog.key === 'A' || prog.key === 'B') prog.days[day - 1].slots.forEach((sl, si) => { sl.id ||= `${prog.key}-d${day}s${si + 1}`; });
};
export const blankItem = (): { ex: string; ph: PhaseChoice; w: number | null; bw: boolean; rx: string; note: string } => ({ ex: '', ph: 'strength', w: null, bw: false, rx: '', note: '' });

// A new card goes after the last card in the same section; a new section goes before Home (Home goes last).
export function insertSlot(target: ProgramSlot[], slot: ProgramSlot) {
  let at = -1; target.forEach((x, j) => { if (x.sec === slot.sec) at = j; });
  if (at < 0) at = slot.sec === 'Optional' ? -1 : slot.sec === 'Home' ? target.length - 1 : target.findIndex(x => x.sec === 'Home') - 1; // a new Optional section goes first, like the sled
  if (at < -1) at = target.length - 1;
  target.splice(at + 1, 0, slot);
}

// Program tab state + actions. `flag` is the save-status helper from the app store.
export const editorSlice = (set: StoreSet, get: StoreGet, flag: Flag): EditorSlice => ({
  edProg: null, // 'A' | 'B' (in the rotation) or 'L:<id>' (a library program); null = the one on the board
  edDay: 1,

  // Resolved editor target: falls back to the board's program when unset or the library item is gone.
  edKey() {
    const { edProg, library } = get();
    if (!edProg || (edProg.startsWith('L:') && !library.some(it => it.id === edProg.slice(2)))) return get().activeProgKey();
    return edProg;
  },
  edItem() { const k = get().edKey(); return k.startsWith('L:') ? get().library.find(it => it.id === k.slice(2)) || null : null; },
  edProgram() { const it = get().edItem(); return it ? { ...it.prog, key: 'N' } : get().programs[get().edKey()]; },
  edName() { const it = get().edItem(); return it ? it.name : progName(get().cfg, get().edKey()); },

  // The board's + Add exercise: the add sheet, aimed at the program on the board and the program day shown in
  // column `col`. The target travels with the sheet, so the Program tab's own selection is untouched.
  openAddToProgram(col) {
    const pd = dayAt(get().week, col);
    if (pd == null) { flag('That is your rest day'); return; }
    const ak = get().activeProgKey();
    set({ modal: { type: 'slot', idx: null, col, target: { key: get().programs[ak] ? ak : 'A', day: pd } } });
  },
  setEdProg: edProg => set({ edProg }),
  setEdDay: edDay => set({ edDay }),

  saveEdited(prog) {
    const it = get().edItem();
    if (it) { const body = progBody(prog); get().setLibrary(get().library.map(x => (x.id === it.id ? { ...x, prog: body } : x))); }
    else get().saveProgram(get().edKey(), prog);
  },
  // Clone the program being edited, change it, save it.
  editProgram(fn) { if (get().blocked()) return false; const prog = structuredClone(get().edProgram()); fn(prog); get().saveEdited(prog); return true; },
  setLibrary(library) { set({ library }); get().saveLibrary(); },

  moveEdSlot(i, dir) {
    get().editProgram(prog => { const sl = prog.days[get().edDay - 1].slots; const j = i + dir; if (j < 0 || j >= sl.length) return; pinIds(prog, get().edDay); [sl[i], sl[j]] = [sl[j], sl[i]]; });
  },
  reorderEdSlot(from, to) {
    get().editProgram(prog => { const sl = prog.days[get().edDay - 1].slots; if (from === to || from < 0 || to < 0 || from >= sl.length || to >= sl.length) return; pinIds(prog, get().edDay); sl.splice(to, 0, ...sl.splice(from, 1)); });
  },
  removeEdSlot(i) { get().editProgram(prog => { prog.days[get().edDay - 1].slots.splice(i, 1); }); },
  setDaySub(v) { return get().editProgram(prog => { const day = prog.days[get().edDay - 1]; if (v.trim()) day.sub = v.trim(); else delete day.sub; }); },

  renameProgram(k, raw) {
    if (get().blocked()) return false;
    const v = raw.trim().slice(0, 40);
    get().mutateCfg(c => { c.progNames = { ...(c.progNames || {}) }; if (v && v !== `Program ${k}`) c.progNames[k] = v; else delete c.progNames[k]; });
    flag('Renamed');
  },
  renameLibItem(raw) {
    if (get().blocked()) return false;
    const it = get().edItem(); const v = raw.trim().slice(0, 60);
    if (!it || !v) return false;
    get().setLibrary(get().library.map(x => (x.id === it.id ? { ...x, name: v } : x))); flag('Renamed');
  },

  libSnapshot(name, prog, from, auto) {
    const it: LibraryItem = { id: newId(), name, from: from as ProgKey, at: new Date().toISOString(), prog: progBody(prog) as Program };
    if (auto) it.auto = true;
    set({ library: [...get().library, it] });
    return it;
  },
  saveCurrentAs(name) {
    if (get().blocked()) return;
    const k = get().edKey(); const cur = get().programs[k];
    get().libSnapshot(name.trim() || `${progName(get().cfg, k)} · ${libDate(new Date().toISOString())}`, cur, k, false);
    get().saveLibrary(); flag('Copy saved');
  },
  // Load a library version (or 'orig') into A or B. Whatever is there now is saved to the library first.
  loadVersion(target, slot) {
    if (get().blocked() || (slot !== 'A' && slot !== 'B')) return;
    const cur = get().programs[slot]; const custom = !get().isOriginal(cur, slot); const orig = get().originalProgram(slot);
    const src = target === 'orig' ? null : get().library.find(it => it.id === target);
    const next = target === 'orig' ? orig : (src || {}).prog;
    if (!next) return;
    if (custom && !get().library.some(it => sameProg(it.prog, cur))) {
      get().libSnapshot(`${progName(get().cfg, slot)} before loading · ${libDate(new Date().toISOString())}`, cur, slot, true); get().saveLibrary();
    }
    // Syncing, the blank original is saved as the account's program: with no document an account with log entries would fall back to the built-in plan.
    if (target === 'orig' && orig === BUILTIN[slot]) { set(s => ({ programs: { ...s.programs, [slot]: BUILTIN[slot] } })); get().removeDoc('programs/' + slot); }
    else get().saveProgram(slot, structuredClone(next));
    set({ edProg: slot });
    flag(src ? `${src.name} is now in ${progName(get().cfg, slot)}` : 'Loaded');
  },
  deleteLibItem(id) {
    if (get().blocked()) return;
    get().setLibrary(get().library.filter(it => it.id !== id));
    if (get().edProg === 'L:' + id) set({ edProg: null });
    flag('Deleted');
  },
  createProgram(name, from) {
    if (get().blocked()) return false;
    const srcProg = get().programs[from] || get().programs.A;
    const it = get().libSnapshot(name.trim(), srcProg, from, false); it.created = true;
    // The copy gets its own slot ids so check-offs and phase defaults never mix with the program it came from;
    // the source's saved phase defaults carry over to the new ids.
    const pre = 'P' + it.id.slice(-5); const src = slotsFor(srcProg); const phDef: Record<string, PhaseKey | null> = {}; let k = 0;
    it.prog.days.forEach((d, di) => d.slots.forEach((sl, si) => {
      const old = src[k++]; const nid = `${pre}-d${di + 1}s${si + 1}`;
      if (old) old.items.forEach((_, i) => { const v = get().cfg.phDef[`${old.id}:${i}`]; if (v) phDef[`${nid}:${i}`] = v; });
      sl.id = nid;
    }));
    if (Object.keys(phDef).length) get().mutateCfg(c => { Object.assign(c.phDef, phDef); });
    set({ library: get().library.map(x => (x.id === it.id ? it : x)), edProg: 'L:' + it.id, edDay: 1, modal: null });
    get().saveLibrary(); flag('Program created');
    return true;
  },

  // Save the add/edit exercise sheet. Returns an error message, or null when saved.
  saveSlot(d) {
    if (get().blocked()) return null;
    for (const it of d.items) {
      if (!it.ex || (it.ex === '__new' && !it.nn)) return 'Choose an exercise, or type a name for the new one.';
      if (!isVideoUrl(it.nu)) return VIDEO_ERR;
    }
    const newEx: Record<string, Partial<ExerciseInfo>> = {};
    const slugFor = (name: string) => newExId(get().cfg, name, newEx);
    const items = d.items.map((it: any) => {
      let ex = it.ex;
      if (ex === '__new') { ex = slugFor(it.nn); newEx[ex] = { n: it.nn, ...(it.nu ? { url: it.nu } : {}), ...(it.ne ? { eq: it.ne } : {}) }; }
      else get().applyExerciseUrl(ex, it.nu);
      const o: ProgramItem = { ex, ph: it.ph || null, w: it.w }; if (it.bw) o.bw = true; if (it.rx) o.rx = it.rx; if (it.note) o.note = it.note; return o;
    });
    if (Object.keys(newEx).length) get().mutateCfg(c => { Object.assign(c.ex!, newEx); });
    const k = d.target ? d.target.key : get().edKey(); const edDay = d.target ? d.target.day : get().edDay;
    const days = d.idx == null && d.days ? [...new Set(d.days)].filter(x => DAYS.includes(x)).sort((a, b) => a - b) : [d.day];
    if (!days.length) return 'Pick at least one day.';
    const newSlotId = (n: number) => `${k.startsWith('L:') ? 'N' : k}-x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${days.length > 1 ? n : ''}`;
    const slot: ProgramSlot = { id: d.id || newSlotId(0), sec: d.sec, items };
    if (d.tier) slot.tier = d.tier; if (d.type !== 'single') slot.type = d.type; if (d.note) slot.note = d.note;
    const orig = d.idx != null ? get().edProgram().days[edDay - 1].slots[d.idx] : null;
    // A new card starts this week, or next week when its day is already finished on this week's board, so adding it
    // never reopens a finished day, offers it as a leftover, or changes an earlier week. An edited card keeps its start.
    const startOf = (day: number) => {
      const now = weekStartOf(new Date()); const wk = ymd(now);
      if (get().weekKey() !== wk || k !== get().activeProgKey()) return wk; // the board shows another week, or another program
      const done = isFinished(currentLayout(get().week, get().activeSlots())[colOf(get().week, day)] || [], get().week);
      return done ? ymd(addDays(now, 7)) : wk;
    };
    if (orig) { if (orig.from) slot.from = orig.from; }
    else slot.from = startOf(days[0]);
    const apply = (prog: Program) => {
      if (days.length > 1) { days.forEach((day, n) => insertSlot(prog.days[day - 1].slots, { ...structuredClone(slot), id: n ? newSlotId(n) : slot.id, from: startOf(day) })); return; }
      if (d.idx != null) prog.days[edDay - 1].slots.splice(d.idx, 1);
      const target = prog.days[days[0] - 1].slots;
      if (orig && days[0] === edDay && orig.sec === slot.sec) target.splice(d.idx as number, 0, slot);
      else insertSlot(target, slot);
    };
    if (d.target) { const prog = structuredClone(get().programs[k]); apply(prog); get().saveProgram(k, prog); } // from the board
    else get().editProgram(apply);
    get().closeModal();
    flag(days.length > 1 ? `Saved to Days ${days.join(', ')}` : days[0] === edDay ? 'Saved' : `Saved to Day ${days[0]}`);
    return null;
  },
});
