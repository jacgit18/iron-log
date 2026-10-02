import { BUILTIN, slotsFor, newExId } from '../lib/data.js';
import { progName } from '../lib/logic.js';
import { progBody, sameProg, libDate } from '../lib/export.js';

export const SECTIONS = ['Regular', 'Supersets', 'Plyometric', 'Home'];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const blankItem = () => ({ ex: '', ph: 'strength', w: null, bw: false, rx: '', note: '' });

// Program tab state + actions. `flag` is the save-status helper from the app store.
export const editorSlice = (set, get, flag) => ({
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
    get().editProgram(prog => { const sl = prog.days[get().edDay - 1].slots; const j = i + dir; if (j < 0 || j >= sl.length) return; [sl[i], sl[j]] = [sl[j], sl[i]]; });
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
    const it = { id: newId(), name, from, at: new Date().toISOString(), prog: progBody(prog) };
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
    const cur = get().programs[slot]; const custom = cur !== BUILTIN[slot];
    const src = target === 'orig' ? null : get().library.find(it => it.id === target);
    const next = target === 'orig' ? BUILTIN[slot] : (src || {}).prog;
    if (!next) return;
    if (custom && !get().library.some(it => sameProg(it.prog, cur))) {
      get().libSnapshot(`${progName(get().cfg, slot)} before loading · ${libDate(new Date().toISOString())}`, cur, slot, true); get().saveLibrary();
    }
    if (target === 'orig') { set(s => ({ programs: { ...s.programs, [slot]: BUILTIN[slot] } })); get().removeDoc('programs/' + slot); }
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
    const pre = 'P' + it.id.slice(-5); const src = slotsFor(srcProg); const phDef = {}; let k = 0;
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
      if (it.ex === '__new' && it.nu && !/^https?:\/\//.test(it.nu)) return 'Video link should start with https://';
    }
    const newEx = {};
    const slugFor = name => newExId(get().cfg, name, newEx);
    const items = d.items.map(it => {
      let ex = it.ex;
      if (ex === '__new') { ex = slugFor(it.nn); newEx[ex] = { n: it.nn, ...(it.nu ? { url: it.nu } : {}), ...(it.ne ? { eq: it.ne } : {}), ...(it.ns ? { stretch: true } : {}) }; }
      const o = { ex, ph: it.ph || null, w: it.w }; if (it.bw) o.bw = true; if (it.rx) o.rx = it.rx; if (it.note) o.note = it.note; return o;
    });
    if (Object.keys(newEx).length) get().mutateCfg(c => { Object.assign(c.ex, newEx); });
    const k = get().edKey(); const edDay = get().edDay;
    const slot = { id: d.id || `${k.startsWith('L:') ? 'N' : k}-x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, sec: d.sec, items };
    if (d.tier) slot.tier = d.tier; if (d.type !== 'single') slot.type = d.type; if (d.note) slot.note = d.note;
    const orig = d.idx != null ? get().edProgram().days[edDay - 1].slots[d.idx] : null;
    get().editProgram(prog => {
      if (d.idx != null) prog.days[edDay - 1].slots.splice(d.idx, 1);
      const target = prog.days[d.day - 1].slots;
      if (orig && d.day === edDay && orig.sec === slot.sec) target.splice(d.idx, 0, slot);
      else {
        // After the last card in the same section; a new section goes before Home (Home goes last).
        let at = -1; target.forEach((x, j) => { if (x.sec === slot.sec) at = j; });
        if (at < 0) at = slot.sec === 'Home' ? target.length - 1 : target.findIndex(x => x.sec === 'Home') - 1;
        if (at < -1) at = target.length - 1;
        target.splice(at + 1, 0, slot);
      }
    });
    set({ modal: null });
    flag(d.day === edDay ? 'Saved' : `Saved to Day ${d.day}`);
    return null;
  },
});
