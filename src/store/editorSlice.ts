import { BUILTIN, BLANK, slotsFor, exInfo, newExId, isVideoUrl, VIDEO_ERR } from '../lib/data.js';
import { catalogName, catalogPickError, catalogSnapshot } from '../lib/catalogExercise.js';
import { exIdsInUse } from '../lib/exerciseLibrary.js';
import { buildStarter, starterById } from '../lib/starterPrograms.js';
import { progName, dayAt, DAYS, colOf, currentLayout, isFinished } from '../lib/logic.js';
import { addDays, weekStartOf, ymd } from '../shared/dates.js';
import type { PhaseChoice, Flag, StoreGet, StoreSet, EditorSlice } from './types.ts';
import type { ExerciseInfo, MuscleTags, LibraryItem, Program, ProgramItem, ProgramSlot, PhaseKey, ProgKey } from '../types.ts';
import { progBody, sameProg, libDate } from '../lib/export.js';
import { carryPhDef, isLibKey, moveSlotId, moveTargets, programByKey } from '../lib/programMove.js';
import { copyDaySlots } from '../lib/programDay.js';

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

  // The board's + Add to program: the add sheet, aimed at the program on the board and the program day shown in
  // column `col`. The target travels with the sheet, so the Program tab's own selection is untouched.
  openAddToProgram(col, fromExp) {
    const pd = dayAt(get().week, col);
    if (pd == null) { flag('That is your rest day'); return; }
    // A finished week shows what it ran, so a card added to today's program would not appear on it (ADR 022).
    if (get().shownFromRecord()) { flag('This week is over: use + This week only'); return; }
    const ak = get().activeProgKey();
    set({ modal: { type: 'slot', idx: null, col, target: { key: get().programs[ak] ? ak : 'A', day: pd }, ...(fromExp ? { fromExp } : {}) } });
  },
  setEdProg: edProg => set({ edProg, edRemoved: null, edMoved: null, edCopied: null }),
  setEdDay: edDay => set({ edDay, edRemoved: null, edMoved: null, edCopied: null }),

  // Save a program by key: A or B, or a saved program (its library item).
  saveProg(key, prog) {
    if (isLibKey(key)) get().setLibrary(get().library.map(x => ('L:' + x.id === key ? { ...x, prog: progBody(prog) as Program } : x)));
    else get().saveProgram(key, prog);
  },
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
    if (get().editProgram(prog => { pinIds(prog, day); gone.push(...prog.days[day - 1].slots.splice(i, 1)); }) && gone[0]) set({ edRemoved: { key, day, idx: i, slot: gone[0] }, edMoved: null });
  },
  undoRemoveEdSlot() {
    const r = get().edRemoved;
    if (!r || r.key !== get().edKey() || r.day !== get().edDay) { set({ edRemoved: null }); return; }
    if (get().editProgram(prog => { const sl = prog.days[r.day - 1].slots; sl.splice(Math.min(r.idx, sl.length), 0, r.slot); })) {
      set({ edRemoved: null }); flag('Put back');
    }
  },
  dismissEdRemoved() { set({ edRemoved: null }); },
  edMoved: null,
  // Move the open day's card at `i` to the end of its section on `toDay` of the same program. Ids are written down on both days first
  // (as for a reorder), so the cards that stay keep their own ticks and phase defaults; the moved card keeps its id and start week.
  moveEdSlotToDay(i, toDay) {
    const key = get().edKey(); const from = get().edDay;
    if (toDay === from || !DAYS.includes(toDay) || !get().edProgram().days[from - 1].slots[i]) return;
    const moved: ProgramSlot[] = [];
    if (get().editProgram(prog => {
      pinIds(prog, from); pinIds(prog, toDay);
      const [sl] = prog.days[from - 1].slots.splice(i, 1);
      if (sl) { moved.push(structuredClone(sl)); insertSlot(prog.days[toDay - 1].slots, sl); }
    }) && moved[0]) set({ edMoved: { key, from, to: toDay, idx: i, slot: moved[0] }, edRemoved: null });
  },
  // Move the open day's card at `i` to the end of its section on `toDay` of another program (A, B or a saved one). In the new program the card
  // takes a new id (ticks and phase defaults are keyed by id), its phase defaults follow it, and this week's ticks stay behind. The target is
  // written first and the source second, so a failure between them leaves the card in both places, never in neither.
  moveEdSlotToProgram(i, toKey, toDay) {
    const fromKey = get().edKey(); const from = get().edDay;
    if (toKey === fromKey) { get().moveEdSlotToDay(i, toDay); return; }
    if (get().blocked() || !DAYS.includes(toDay)) return;
    const src = structuredClone(get().edProgram()); const dst = programByKey(get().programs, get().library, toKey);
    if (!dst) { flag('That program is gone'); return; }
    const to = structuredClone(dst);
    pinIds(src, from); pinIds(to, toDay); // ids written down first, so the cards after the new one keep their own ticks and phase defaults
    const sl = src.days[from - 1].slots[i];
    if (!sl) return;
    const oldId = sl.id; const newId = moveSlotId(toKey, Date.now().toString(36) + Math.random().toString(36).slice(2, 5));
    const orig = structuredClone(sl); const moved = { ...structuredClone(sl), id: newId };
    insertSlot(to.days[toDay - 1].slots, structuredClone(moved));
    get().saveProg(toKey, to);
    const carried = carryPhDef(get().cfg.phDef, oldId, newId, sl.items.length);
    if (Object.keys(carried).length) get().mutateCfg(c => { Object.assign(c.phDef, carried); });
    src.days[from - 1].slots.splice(i, 1);
    get().saveEdited(src);
    const toLabel = moveTargets(get().cfg, get().library).find(t => t.key === toKey)?.label ?? toKey;
    set({ edMoved: { key: fromKey, from, to: toDay, idx: i, slot: moved, toKey, toLabel, orig }, edRemoved: null });
  },
  // Put the moved card back on its old day at its old place (and in its old program). The card is found by what it holds, as a library program's cards have no id.
  undoMoveEdSlot() {
    const m = get().edMoved;
    if (!m || m.key !== get().edKey() || m.from !== get().edDay) { set({ edMoved: null }); return; }
    const want = JSON.stringify(m.slot);
    const targetKey = m.toKey ?? m.key;
    const there = programByKey(get().programs, get().library, targetKey);
    const at = there ? there.days[m.to - 1].slots.findIndex(x => JSON.stringify(x) === want) : -1;
    // The card was changed or removed since (Edit, Remove): there is nothing to put back, and nothing is saved.
    if (!there || at < 0) { set({ edMoved: null }); flag('Could not put it back'); return; }
    if (!m.toKey) {
      if (get().editProgram(prog => {
        const day = prog.days[m.to - 1].slots; const [sl] = day.splice(day.findIndex(x => JSON.stringify(x) === want), 1);
        const back = prog.days[m.from - 1].slots; back.splice(Math.min(m.idx, back.length), 0, sl!);
      })) { set({ edMoved: null }); flag('Put back'); }
      return;
    }
    if (get().blocked() || !m.orig) return;
    // Another program: the source first (the card is then in both places for a moment, never in neither), then the target.
    const src = structuredClone(get().edProgram()); const back = src.days[m.from - 1].slots; back.splice(Math.min(m.idx, back.length), 0, structuredClone(m.orig));
    get().saveEdited(src);
    const rest = structuredClone(there); rest.days[m.to - 1].slots.splice(at, 1);
    get().saveProg(targetKey, rest);
    set({ edMoved: null }); flag('Put back');
  },
  dismissEdMoved() { set({ edMoved: null }); },
  edCopied: null,
  copyEdDay(toDay) {
    const key = get().edKey(); const from = get().edDay;
    if (get().blocked() || toDay === from || !DAYS.includes(toDay)) return;
    const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    let made: ProgramSlot[] = []; let src: ProgramSlot[] = [];
    if (get().editProgram(prog => {
      pinIds(prog, from); pinIds(prog, toDay);
      src = structuredClone(prog.days[from - 1].slots);
      made = copyDaySlots(src, i => moveSlotId(key, stamp + i));
      made.forEach(c => insertSlot(prog.days[toDay - 1].slots, structuredClone(c)));
    }) && made.length) {
      // Each copy starts with the phase its original has, as a moved card does.
      const carried = Object.assign({}, ...made.map((c, i) => carryPhDef(get().cfg.phDef, src[i]!.id, c.id, c.items.length)));
      if (Object.keys(carried).length) get().mutateCfg(c => { Object.assign(c.phDef, carried); });
      set({ edCopied: { key, from, to: toDay, ids: made.map(c => c.id) }, edRemoved: null, edMoved: null });
    }
  },
  // Take the copies back out of the day they went to (found by id; ones edited since are still removed, ones already removed are skipped).
  undoCopyEdDay() {
    const c = get().edCopied;
    if (!c || c.key !== get().edKey() || c.from !== get().edDay) { set({ edCopied: null }); return; }
    if (get().editProgram(prog => { prog.days[c.to - 1].slots = prog.days[c.to - 1].slots.filter(sl => !c.ids.includes(sl.id)); })) { set({ edCopied: null }); flag('Copy undone'); }
  },
  dismissEdCopied() { set({ edCopied: null }); },
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
  applyStarter(starterId, perWeek) {
    if (get().blocked()) return 'Wait a moment and try again.';
    const starter = starterById(starterId); const key = get().activeProgKey();
    // Only onto an empty board: a starter never replaces cards someone has built.
    if (!starter || slotsFor(get().programs[key]).length) return 'Starter programs are for an empty board.';
    // The starter's cards start this week, so another week's board (an earlier one, or a finished one shown from its record) would not show them.
    const thisWeek = ymd(weekStartOf(new Date()));
    if (get().weekKey() !== thisWeek || get().shownFromRecord()) return 'Go to this week to use a starter program.';
    const built = buildStarter(starter, perWeek, get().cfg, key, thisWeek);
    if (!built) return 'That many days a week is not offered for this program.';
    if (Object.keys(built.newEx).length) get().mutateCfg(c => { Object.assign(c.ex!, built.newEx); c.muscleMap = { ...(c.muscleMap || {}), ...built.newTags }; });
    get().saveProgram(key, built.program);
    flag(`${starter.name} added, ${perWeek} days a week`);
    return null;
  },
  createProgram(name, from, keepOpen = false) {
    if (get().blocked()) return false;
    const srcProg = from === 'empty' ? BLANK.A : get().programs[from] || get().programs.A;
    const it = get().libSnapshot(name.trim().slice(0, 60), srcProg, from, false); it.created = true;
    if (from === 'empty') delete it.from;
    // The copy gets its own slot ids so check-offs and phase defaults never mix with the program it came from;
    // the source's saved phase defaults carry over to the new ids.
    const phDef = reId(it.prog, slotsFor(srcProg), 'P' + it.id.slice(-5), get().cfg.phDef);
    if (Object.keys(phDef).length) get().mutateCfg(c => { Object.assign(c.phDef, phDef); });
    set({ library: get().library.map(x => (x.id === it.id ? it : x)), edProg: 'L:' + it.id, edDay: 1, ...(keepOpen ? {} : { modal: null }) });
    get().saveLibrary(); flag('Program created');
    return true;
  },
  // A starter made into a library program (not onto the board, unlike applyStarter): its exercises join the account's library, and the
  // Create sheet keeps its place to offer loading it. The new program is the open one in the editor (`edProg`).
  createStarterProgram(starterId, perWeek, name) {
    if (get().blocked()) return 'Wait a moment and try again.';
    const starter = starterById(starterId);
    if (!starter) return 'Pick a program to start from.';
    const built = buildStarter(starter, perWeek, get().cfg, 'A', ymd(weekStartOf(new Date())));
    if (!built) return 'That many days a week is not offered for this program.';
    if (Object.keys(built.newEx).length) get().mutateCfg(c => { Object.assign(c.ex!, built.newEx); c.muscleMap = { ...(c.muscleMap || {}), ...built.newTags }; });
    const it = get().libSnapshot(name.trim().slice(0, 60), built.program, 'A', false); it.created = true; delete it.from;
    reId(it.prog, slotsFor(built.program), 'P' + it.id.slice(-5), {}); // its own card ids, so nothing mixes with Program A's
    set({ library: get().library.map(x => (x.id === it.id ? it : x)), edProg: 'L:' + it.id, edDay: 1 });
    get().saveLibrary(); flag('Program created');
    return null;
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
    const ids = days.map((_, n) => (n ? newSlotId(n) : d.id || newSlotId(0))); // each day's card, known now so a promotion's Undo can find them
    const slot: ProgramSlot = { id: ids[0]!, sec: d.sec, items };
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
      if (days.length > 1) { days.forEach((day, n) => insertSlot(prog.days[day - 1].slots, { ...structuredClone(slot), id: ids[n]!, from: startOf(day) })); return; }
      if (d.idx != null) prog.days[edDay - 1].slots.splice(d.idx, 1);
      const target = prog.days[days[0] - 1].slots;
      if (orig && days[0] === edDay && orig.sec === slot.sec) target.splice(d.idx as number, 0, slot);
      else insertSlot(target, slot);
    };
    if (d.target) { const prog = structuredClone(get().programs[k]); apply(prog); get().saveProgram(k, prog); } // from the board
    else get().editProgram(apply);
    get().closeModal();
    const exp = d.fromExp && d.idx == null && d.target ? get().experiments.find(x => x.id === d.fromExp) : null;
    if (exp) { // promoted from the Experiment list: it is on the program now, so it leaves the list; one Undo reverses both
      const at = get().experiments.indexOf(exp); const gone = new Set(ids);
      get().setExperiments(get().experiments.filter(x => x.id !== exp.id));
      get().noteRemoved('experiments', `${exInfo(get().cfg, exp.ex).n} from Experiments (now on the program)`, () => {
        if (get().blocked() || get().experiments.some(x => x.id === exp.id)) return false;
        const prog = structuredClone(get().programs[k]); prog.days.forEach(dd => { dd.slots = dd.slots.filter(sl => !gone.has(sl.id)); });
        get().saveProgram(k, prog);
        const l = [...get().experiments]; l.splice(Math.min(at, l.length), 0, exp); get().setExperiments(l); return true;
      });
    }
    flag(days.length > 1 ? `Saved to Days ${days.join(', ')}` : days[0] === edDay ? 'Saved' : `Saved to Day ${days[0]}`);
    return null;
  },
});
