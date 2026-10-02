import { BUILTIN, PHASES } from '../lib/data.js';
import { DEFAULT_CFG, normWeek, progName } from '../lib/logic.js';
import { parseDataFile, importSel, cfgSection, mergeEntries, mergeWeek, sameProg, progBody, libDate, backupCfg } from '../lib/export.js';
import { WEEK_RE } from '../lib/trends.js';
import { parseExcelExport, parseCsvExport, entryKey, checkOffsFromLogs } from '../lib/excelImport.js';

// Settings tab actions + the full-data import. `flag` is the save-status helper from the app store.
export const settingsSlice = (set, get, flag) => ({
  importDraft: null, // {data, name, kind: 'json'|'excel', useSettings} once a file has been read and checked
  importBusy: false,
  importError: '', // shown next to the import controls until the next attempt
  setImportUseSettings: v => set(s => ({ importDraft: s.importDraft && { ...s.importDraft, useSettings: v } })),
  setImportSection: (k, v) => set(s => ({ importDraft: s.importDraft && { ...s.importDraft, sel: { ...importSel(s.importDraft), [k]: v } } })),
  importCount: 0, // bumps after each import so the import panel resets (paste box closed and cleared)

  setPct(p, raw) { const n = Number(raw); if (raw !== '' && !isNaN(n)) get().mutateCfg(c => { c.pct[p] = n; }); },
  setRxOverride(p, raw) { const v = raw.trim(); get().mutateCfg(c => { if (v && v !== PHASES[p].rx) c.rxOverride[p] = v; else delete c.rxOverride[p]; }); },
  setRest(raw) { const n = Number(raw); if (raw !== '' && n >= 0) get().mutateCfg(c => { c.rest = n; }); },
  setRm(exId, raw) { const n = Number(raw); get().mutateCfg(c => { if (raw === '' || !(n > 0)) delete c.rm[exId]; else c.rm[exId] = n; }); },
  setCfgField(k, v) { get().mutateCfg(c => { c[k] = v; }); },
  setBackupRepo(raw) {
    const v = raw.trim();
    if (/^[\w.-]+\/[\w.-]+$/.test(v)) { if (get().mutateCfg(c => { c.backup = { ...backupCfg(c), repo: v, hashes: {} }; })) set({ backupMsg: null }); }
    else set({ backupMsg: { kind: 'err', text: 'Use the form owner/repo, for example jacgit18/iron-log-data.' } });
  },

  async readImportFile(file) {
    if (!file || get().blocked()) return;
    set({ importError: '' });
    try {
      const buf = await file.arrayBuffer(); const head = new Uint8Array(buf.slice(0, 4));
      const zip = head[0] === 0x50 && head[1] === 0x4b; // .xlsx files are zip archives ("PK")
      if (zip || /\.xlsx$/i.test(file.name)) {
        const data = await parseExcelExport(buf, get().cfg);
        // A whole-backup workbook imports like the JSON data file; older ones only bring back sessions, body weight and settings.
        set({ importDraft: { data, name: file.name, kind: data.excel.complete ? 'json' : 'excel', useSettings: true }, modal: { type: 'import' } });
        return;
      }
      const text = new TextDecoder().decode(buf);
      if (/\.csv$/i.test(file.name)) {
        set({ importDraft: { data: await parseCsvExport(text, get().cfg), name: file.name, kind: 'excel', useSettings: false }, modal: { type: 'import' } });
        return;
      }
      set({ importDraft: { data: parseDataFile(text), name: file.name, kind: 'json' }, modal: { type: 'import' } });
    } catch (e) {
      const msg = e.message || 'Couldn’t read that file';
      set({ importDraft: null, importError: msg }); flag(msg);
    }
  },
  pasteImport(text) {
    if (get().blocked()) return;
    set({ importError: '' });
    if (!text.trim()) { set({ importError: 'Paste the file contents first' }); flag('Paste the file contents first'); return; }
    try { set({ importDraft: { data: parseDataFile(text), name: 'Pasted data', kind: 'json' }, modal: { type: 'import' } }); }
    catch (e) { set({ importError: e.message }); flag(e.message); }
  },

  // 'merge' keeps everything here and adds what's missing; 'replace' makes the app match the file exactly.
  async applyImport(mode) {
    const draft = get().importDraft;
    if (!draft || get().importBusy || get().blocked()) return;
    set({ importBusy: true });
    try {
      const d = draft.data; const on = draft.kind === 'excel' ? importSel({}) : importSel(draft); const today = libDate(new Date().toISOString());
      const localWeeks = await get().allWeeks();
      const wk = get().weekKey();
      if (mode === 'replace') {
        const cur = get().cfg; const incoming = { ...structuredClone(DEFAULT_CFG), ...structuredClone(d.config) };
        const cfg = {};
        new Set([...Object.keys(cur), ...Object.keys(incoming)]).forEach(k => {
          const v = k === 'backup' ? (d.config.backup || cur.backup) : on[cfgSection(k)] ? incoming[k] : cur[k];
          if (v !== undefined) cfg[k] = v;
        });
        set({ cfg }); get().saveCfg();
        if (on.program) {
          ['A', 'B'].forEach(k => {
            if (d.programs[k]) get().saveProgram(k, structuredClone(d.programs[k]));
            else if (get().programs[k] !== BUILTIN[k]) { set(s => ({ programs: { ...s.programs, [k]: BUILTIN[k] } })); get().removeDoc('programs/' + k); }
          });
          set({ library: structuredClone(d.library) }); get().saveLibrary();
        }
        if (on.board) {
          set({ body: structuredClone(d.body) }); get().saveBody();
          set({ experiments: structuredClone(d.experiments || []) }); get().saveExperiments();
          Object.keys(localWeeks).forEach(k => { if (WEEK_RE.test(k) && !d.weeks[k]) get().removeDoc('weeks/' + k); });
          Object.entries(d.weeks).forEach(([k, w]) => { if (k !== wk) get().saveDoc('weeks/' + k, w); });
          set({ week: normWeek(d.weeks[wk]) }); get().saveWeek();
        }
        if (on.progress) {
          const logs = {};
          Object.keys(get().logs).forEach(id => { if (!d.logs[id]) get().removeDoc('logs/' + id); });
          Object.entries(d.logs).forEach(([id, l]) => { logs[id] = structuredClone(l); });
          set({ logs }); Object.keys(logs).forEach(id => get().saveLog(id));
        }
      } else {
        if (draft.kind === 'excel') {
          const xs = d.excel.settings;
          if (draft.useSettings && (xs.mode || xs.rest != null || xs.pct)) {
            set(st => ({ cfg: { ...st.cfg, ...(xs.mode ? { mode: xs.mode } : {}), ...(xs.rest != null ? { rest: xs.rest } : {}), pct: { ...st.cfg.pct, ...(xs.pct || {}) } } }));
            get().saveCfg();
          }
          // Every session in the file checks off, including ones already logged here; the weeks merge below.
          d.weeks = checkOffsFromLogs(get().cfg, get().programs, d.logs, localWeeks);
          Object.keys(d.logs).forEach(id => { const have = new Set((get().logs[id] || []).map(entryKey)); d.logs[id] = d.logs[id].filter(e => !have.has(entryKey(e))); });
        }
        const C = d.config; let ch = false; const cfg = structuredClone(get().cfg);
        ['rm', 'phDef', 'exPh', 'ex', 'muscleMap', 'rxOverride', 'progNames'].filter(k => on[cfgSection(k)]).forEach(k => {
          const src = C[k];
          if (src && typeof src === 'object') { cfg[k] = cfg[k] || {}; Object.keys(src).forEach(x => { if (cfg[k][x] == null) { cfg[k][x] = structuredClone(src[x]); ch = true; } }); }
        });
        if (ch) { set({ cfg }); get().saveCfg(); }
        const library = get().library; const lib = [...library]; const have = new Set(lib.map(it => it.id));
        if (on.program) d.library.forEach(it => { if (!have.has(it.id)) { lib.push(structuredClone(it)); have.add(it.id); } });
        ['A', 'B'].forEach(k => {
          const p = on.program && d.programs[k]; if (!p) return; const cur = get().programs[k];
          if (cur === BUILTIN[k]) get().saveProgram(k, structuredClone(p));
          else if (!sameProg(cur, p) && !lib.some(it => sameProg(it.prog, p))) {
            lib.push({ id: Date.now().toString(36) + k + Math.random().toString(36).slice(2, 6), name: `${progName(get().cfg, k)} from import · ${today}`, from: k, at: new Date().toISOString(), prog: progBody(p) });
          }
        });
        if (lib.length !== library.length) { set({ library: lib }); get().saveLibrary(); }
        const exps = get().experiments; const haveE = new Set(exps.map(e => e.id)); const addE = !on.board ? [] : (d.experiments || []).filter(e => !haveE.has(e.id));
        if (addE.length) get().setExperiments([...exps, ...structuredClone(addE)]);
        const body = get().body; const addB = !on.board ? [] : d.body.filter(e => !body.some(x => x.wk === e.wk));
        if (addB.length) { set({ body: [...body, ...addB].sort((a, b) => a.wk.localeCompare(b.wk)) }); get().saveBody(); }
        Object.entries(on.progress ? d.logs : {}).forEach(([id, l]) => {
          const cur = get().logs[id] || []; const m = mergeEntries(cur, l);
          if (m.length !== cur.length) { set(s => ({ logs: { ...s.logs, [id]: m } })); get().saveLog(id); }
        });
        Object.entries(on.board ? d.weeks : {}).forEach(([k, w]) => {
          if (k === wk) { const m = mergeWeek(get().week, w); if (JSON.stringify(m) !== JSON.stringify(normWeek(get().week))) { set({ week: m }); get().saveWeek(); } return; }
          const m = localWeeks[k] ? mergeWeek(localWeeks[k], w) : w;
          if (!localWeeks[k] || JSON.stringify(m) !== JSON.stringify(normWeek(localWeeks[k]))) get().saveDoc('weeks/' + k, m);
        });
      }
      set(s => ({ weekHist: null, importDraft: null, importBusy: false, importError: '', modal: null, importCount: s.importCount + 1 }));
      flag(mode === 'replace' ? 'Data replaced' : 'Data added');
    } catch {
      set({ importBusy: false }); flag('Import failed');
    }
  },
});
