import { BUILTIN, BLANK, slotsFor, newExId, isVideoUrl, VIDEO_ERR } from '../lib/data.js';
import { catalogName, catalogPickError, catalogSnapshot } from '../lib/catalogExercise.js';
import { exIdsInUse } from '../lib/exerciseLibrary.js';
import { progName, dayAt, DAYS, colOf, currentLayout, isFinished } from '../lib/logic.js';
import { addDays, weekStartOf, ymd } from '../shared/dates.js';
import type { PhaseChoice, Flag, StoreGet, StoreSet, EditorSlice } from './types.ts';
import type { ExerciseInfo, MuscleTags, LibraryItem, Program, ProgramItem, ProgramSlot, PhaseKey, ProgKey } from '../types.ts';
import { progBody, sameProg, libDate } from '../lib/export.js';

export const SECTIONS = ['Optional', 'Regular', 'Supersets', 'Plyometric', 'Home']; // Optional and Home cards don't count toward finishing a day (countsForFinish)
const newId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// A slot saved without an id takes one from its position when the board reads it (`slotsFor` in lib/data.ts), and phase
// defaults and the week's ticks are keyed by that id. Write it down before a reorder, so they stay with the card that moved.
const pinIds = (prog: Program, day: number) => {
  if (prog.key === 'A' || prog.key === 'B') prog.days[day - 1].slots.forEach((sl, si) => { sl.id ||= `${prog.key}-d${day}s${si + 1}`; });
};
// Give every card of `prog` a new id `<pre>-d<day>s<pos>`, so check-offs and phase defaults never mix with the program its cards came
// from. `src` is that program's cards in the same order; their saved phase defaults are returned under the new ids.
function reId(prog: Program, src: { id: string; items: unknown[] }[], pre: string, phDef: Record<string, PhaseKey | null>) {
  const out: Record<string, PhaseKey | null> = {}; let k = 0;
  prog.days.forEach((d, di) => d.slots.forEach((sl, si) => {
    const old = src[k++]; const nid = `${pre}-d${di + 1}s${si + 1}`;
    if (old) old.items.forEach((_, i) => { const v = phDef[`${old.id}:${i}`]; if (v) out[`${nid}:${i}`] = v; });
    sl.id = nid;
  }));
  return out;
}
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
    // A finished week shows what it ran, so a card added to today's program would not appear on it (ADR 022).
    if (get().shownFromRecord()) { flag('This week is over: use + Only this week'); return; }
    const ak = get().activeProgKey();
    set({ modal: { type: 'slot', idx: null, col, target: { key: get().programs[ak] ? ak : 'A', day: pd } } });
  },
  setEdProg: edProg => set({ edProg, edRemoved: null }),
  setEdDay: edDay => set({ edDay, edRemoved: null }),

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
  edRemoved: null,
  // Remove the open day's card at `i`, and keep it so the Removed notice's Undo can put it back in the same place. Ids are written down
  // first, as for a reorder: the cards after it keep their own ticks and phase defaults, and the removed card comes back with its own id.
  removeEdSlot(i) {
    const key = get().edKey(); const day = get().edDay;
    const gone: ProgramSlot[] = [];
    if (get().editProgram(prog => { pinIds(prog, day); gone.push(...prog.days[day - 1].slots.splice(i, 1)); }) && gone[0]) set({ edRemoved: { key, day, idx: i, slot: gone[0] } });
  },
  undoRemoveEdSlot() {
    const r = get().edRemoved;
    if (!r || r.key !== get().edKey() || r.day !== get().edDay) { set({ edRemoved: null }); return; }
    if (get().editProgram(prog => { const sl = prog.days[r.day - 1].slots; sl.splice(Math.min(r.idx, sl.length), 0, r.slot); })) { set({ edRemoved: null }); flag('Put back'); }
  },
  dismissEdRemoved() { set({ edRemoved: null }); },
  setDaySub(v) { return get().editProgram(prog => { const day = prog.days[get().edDay - 1]; if (v.trim()) day.sub = v.trim(); else delete day.sub; }); },

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
    else {
      const loaded = structuredClone(next) as Program;
      // The same library program can go into A and B (or a copy saved from one slot into the other). Cards with the same id in both would
      // share ticks and phase defaults, so a version whose ids the other program already uses gets new ones.
      const taken = new Set(slotsFor(get().programs[slot === 'A' ? 'B' : 'A']).map(s => s.id));
      const cards = slotsFor({ ...loaded, key: slot });
      if (src && cards.some(s => taken.has(s.id))) {
        const phDef = reId(loaded, cards, 'L' + newId().slice(-6), get().cfg.phDef);
        if (Object.keys(phDef).length) get().mutateCfg(c => { Object.assign(c.phDef, phDef); });
      }
      get().saveProgram(slot, loaded);
    }
    // A program loaded from the library brings its name: the slot is called what you named the program (ADR 021).
    if (src) get().mutateCfg(c => { c.progNames = { ...(c.progNames || {}), [slot]: src.name }; });
    set({ edProg: slot });
    flag(src ? `Loaded ${src.name} into Program ${slot}` : 'Loaded');
  },
  deleteLibItem(id) {
    if (get().blocked()) return;
    const lib = get().library; const i = lib.findIndex(it => it.id === id); if (i < 0) return;
    const it = lib[i];
    get().setLibrary(lib.filter(x => x.id !== id));
    if (get().edProg === 'L:' + id) set({ edProg: null });
    get().noteRemoved('library', it.name, () => {
      if (get().blocked() || get().library.some(x => x.id === id)) return false;
      const l = [...get().library]; l.splice(Math.min(i, l.length), 0, it); get().setLibrary(l); return true;
    });
  },
  createProgram(name, from) {
    if (get().blocked()) return false;
    const srcProg = from === 'empty' ? BLANK.A : get().programs[from] || get().programs.A;
    const it = get().libSnapshot(name.trim(), srcProg, from, false); it.created = true;
    if (from === 'empty') delete it.from;
    // The copy gets its own slot ids so check-offs and phase defaults never mix with the program it came from;
    // the source's saved phase defaults carry over to the new ids.
    const phDef = reId(it.prog, slotsFor(srcProg), 'P' + it.id.slice(-5), get().cfg.phDef);
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
      if (it.cat) { const err = catalogPickError(get().cfg, it.cat, exIdsInUse(get(), get().cfg)); if (err) return err; }
    }
    // Two items of one card that would add different exercises under one name (a typed new one and a catalog pick, or two catalog
    // items): refused, so the library keeps one exercise per name (findExId). The same pick twice is fine.
    const adding = new Map<string, string>();
    for (const it of d.items) {
      const add = it.cat && !get().cfg.ex[it.cat.id] ? { name: catalogName(it.cat), who: it.cat.id } : it.ex === '__new' ? { name: it.nn, who: 'new' } : null;
      if (!add) continue;
      const k = add.name.trim().replace(/\s+/g, ' ').toLowerCase(); const had = adding.get(k);
      if (had && had !== add.who) return `${add.name} is used twice in this card as different exercises. Pick the same one for both.`;
      adding.set(k, add.who);
    }
    const days = d.idx == null && d.days ? [...new Set(d.days)].filter(x => DAYS.includes(x)).sort((a, b) => a - b) : [d.day];
    if (!days.length) return 'Pick at least one day.'; // checked before anything is written, so a refused save adds no exercise
    const newEx: Record<string, Partial<ExerciseInfo>> = {}; const newTags: Record<string, MuscleTags> = {};
    const slugFor = (name: string) => newExId(get().cfg, name, newEx);
    const items = d.items.map((it: any) => {
      let ex = it.cat ? it.cat.id : it.ex;
      if (it.cat && !get().cfg.ex[ex]) { const snap = catalogSnapshot(it.cat, it); newEx[ex] = snap.info; if (snap.tags) newTags[ex] = snap.tags; } // picked from the catalog: joins the library with the card
      else if (ex === '__new') { ex = slugFor(it.nn); newEx[ex] = { n: it.nn, ...(it.nu ? { url: it.nu } : {}), ...(it.ne ? { eq: it.ne } : {}) }; }
      else { get().applyExerciseUrl(ex, it.nu); get().applyExerciseEq(ex, it.ne); }
      const o: ProgramItem = { ex, ph: it.ph || null, w: it.w }; if (it.bw) o.bw = true; if (it.rx) o.rx = it.rx; if (it.note) o.note = it.note; return o;
    });
    if (Object.keys(newEx).length) get().mutateCfg(c => { Object.assign(c.ex!, newEx); if (Object.keys(newTags).length) c.muscleMap = { ...(c.muscleMap || {}), ...newTags }; });
    const k = d.target ? d.target.key : get().edKey(); const edDay = d.target ? d.target.day : get().edDay;
    const newSlotId = (n: number) => `${k.startsWith('L:') ? 'N' : k}-x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${days.length > 1 ? n : ''}`;
    const slot: ProgramSlot = { id: d.id || newSlotId(0), sec: d.sec, items };
    if (d.tier) slot.tier = d.tier; if (d.type !== 'single') slot.type = d.type; if (d.note) slot.note = d.note;
    const orig = d.idx != null ? get().edProgram().days[edDay - 1].slots[d.idx] : null;
    // A new card starts this week, or next week when its day is already finished on this week's board, so adding a card
    // never reopens a finished day, offers it as a leftover, or changes an earlier week. An edited card keeps its start,
    // even when the edit moves it to another day: a later start would drop it from the earlier weeks it was already in.
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
