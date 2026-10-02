import { describe, it, expect } from 'vitest';
import * as X from 'xlsx';
import { BUILTIN } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { buildOverallWorkbook, buildWeekWorkbook } from './export.js';
import { parseExcelExport, entryKey, checkOffsFromLogs } from './excelImport.js';
import { isDone, isItemDone, normWeek } from './logic.js';
import { slotsFor } from './data.js';

const cfg = () => ({ ...structuredClone(DEFAULT_CFG), mode: 2, rest: 60, rm: { hack: 400 }, ex: { myhold: { n: 'My Hold' } } });
const S = () => ({
  cfg: cfg(),
  logs: {
    hack: [{ d: '2026-09-21', ph: 'hyp', w: 270, s: 2, r: 12, sets: [{ w: 270, r: 15 }, { w: 270, r: 12 }], wk: '2026-09-20' }],
    myhold: [{ d: '2026-12-31', ph: 'iso', w: null, s: 3, sec: 30 }],
  },
  programs: { A: BUILTIN.A, B: BUILTIN.B },
  library: [],
  body: [{ wk: '2026-09-20', d: '2026-09-21', w: 180.5 }],
});
const toBytes = wb => X.write(wb, { type: 'array', bookType: 'xlsx' });

// What Excel and Google Sheets do on save: "YYYY-MM-DD" text in the date columns becomes a real date.
function resaveWithRealDates(bytes) {
  const wb = X.read(bytes, { type: 'array' });
  ['Sessions', 'Body weight'].forEach(name => {
    const ws = wb.Sheets[name];
    Object.keys(ws).filter(k => /^[AB]([2-9]|\d\d+)$/.test(k)).forEach(k => {
      const c = ws[k];
      if (c.t === 's' && /^\d{4}-\d{2}-\d{2}$/.test(c.v)) {
        const [y, m, d] = c.v.split('-').map(Number);
        ws[k] = { t: 'd', v: new Date(Date.UTC(y, m - 1, d)) };
      }
    });
  });
  return toBytes(wb);
}

describe('Excel import', () => {
  it('reads back what the overall workbook exported', async () => {
    const d = await parseExcelExport(toBytes(buildOverallWorkbook(X, S(), {})), cfg());
    expect(d.logs.hack).toEqual([S().logs.hack[0]]);
    expect(d.logs.myhold).toEqual([{ d: '2026-12-31', ph: 'iso', w: null, s: 3, sec: 30, wk: '2026-12-27' }]);
    expect(d.body).toEqual(S().body);
    expect(d.config.rm).toEqual({ hack: 400 });
    expect(d.excel).toMatchObject({ settings: { mode: 2, rest: 60 }, skipped: 0, newExercises: [] });
  });

  it('still imports after the file was re-saved in Excel or Sheets (regression: every row was skipped)', async () => {
    const bytes = toBytes(buildOverallWorkbook(X, S(), {}));
    const plain = await parseExcelExport(bytes, cfg());
    const resaved = await parseExcelExport(resaveWithRealDates(bytes), cfg());
    expect(resaved.excel.skipped).toBe(0);
    expect(resaved.logs).toEqual(plain.logs);
    expect(resaved.body).toEqual(plain.body);
  });

  it('keeps custom exercise ids from a full workbook', async () => {
    const d = await parseExcelExport(toBytes(buildOverallWorkbook(X, S(), {})), { ...structuredClone(DEFAULT_CFG) });
    expect(d.excel).toMatchObject({ complete: true, newExercises: [] });
    expect(d.config.ex).toEqual({ myhold: { n: 'My Hold' } });
    expect(d.logs.myhold).toHaveLength(1);
  });

  it('creates custom exercises for names it does not know (older workbooks)', async () => {
    const wb = buildOverallWorkbook(X, S(), {});
    ['Programs', 'Program info', 'Saved versions', 'Check-offs', 'Config'].forEach(n => { delete wb.Sheets[n]; wb.SheetNames = wb.SheetNames.filter(x => x !== n); });
    Object.keys(wb.Sheets.Sessions).filter(k => /^O\d+$/.test(k)).forEach(k => delete wb.Sheets.Sessions[k]);
    const bytes = toBytes(wb);
    const d = await parseExcelExport(bytes, { ...structuredClone(DEFAULT_CFG) }); // "My Hold" isn't defined here
    expect(d.excel.newExercises).toEqual(['My Hold']);
    expect(d.config.ex).toEqual({ 'my-hold': { n: 'My Hold' } });
    expect(d.logs['my-hold']).toHaveLength(1);
  });

  it('matches entries already in the app, so importing twice adds nothing', async () => {
    const d = await parseExcelExport(toBytes(buildOverallWorkbook(X, S(), {})), cfg());
    const have = new Set(Object.values(S().logs).flat().map(entryKey));
    expect(Object.values(d.logs).flat().every(e => have.has(entryKey(e)))).toBe(true);
  });

  it('explains which files it cannot import', async () => {
    const week = toBytes(buildWeekWorkbook(X, S(), '2026-09-20', {}));
    await expect(parseExcelExport(week, cfg())).rejects.toThrow('single-week Excel file');
    const other = X.utils.book_new(); X.utils.book_append_sheet(other, X.utils.aoa_to_sheet([['a']]), 'Sheet1');
    await expect(parseExcelExport(toBytes(other), cfg())).rejects.toThrow('isn’t an Iron Log Excel export');
    await expect(parseExcelExport(new TextEncoder().encode('hello').buffer, cfg())).rejects.toThrow();
  });
});

describe('check-offs from imported sessions', () => {
  const programs = { A: BUILTIN.A, B: BUILTIN.B };
  const slot = (k, id) => slotsFor(BUILTIN[k]).find(s => s.id === id);

  it('checks off each logged exercise in the week it was logged', () => {
    const logs = {
      hack: [{ d: '2026-09-22', ph: 'hyp', w: 270, s: 4, r: 15, slot: 'A-d3s1' }],
      chestpress: [{ d: '2026-09-23', ph: 'hyp', w: 25, s: 4, r: 15, slot: 'A-d2s5', wk: '2026-09-20' }],
      zercher: [{ d: '2026-09-30', ph: 'strength', w: 50, s: 4, r: 6, slot: 'A-d1s6' }],
    };
    const weeks = checkOffsFromLogs(DEFAULT_CFG, programs, logs, {});
    expect(Object.keys(weeks).sort()).toEqual(['2026-09-20', '2026-09-27']);
    const w = weeks['2026-09-20'];
    expect(isDone(slot('A', 'A-d3s1'), w)).toBe(true);
    // Only the logged half of a superset.
    expect([isItemDone(slot('A', 'A-d2s5'), 0, w), isItemDone(slot('A', 'A-d2s5'), 1, w)]).toEqual([false, true]);
    expect(isItemDone(slot('A', 'A-d1s6'), 1, weeks['2026-09-27'])).toBe(true);
  });

  it('uses the program that week ran and skips sessions it cannot place', () => {
    const c = { ...DEFAULT_CFG, mode: 2, m2Even: 'A' }; // September (odd month) runs Program B
    const logs = {
      farmers: [{ d: '2026-09-22', ph: 'strength', w: 40, s: 3, r: 6, slot: 'B-d2s1' }],
      hack: [{ d: '2026-09-22', w: 270, s: 4, r: 15, slot: 'A-d3s1' }, { d: '2026-09-22', w: 270, s: 4, r: 15 }],
    };
    const w = checkOffsFromLogs(c, programs, logs, {})['2026-09-20'];
    expect(w.done).toEqual({ 'B-d2s1': true, 'B-d2s1#0': true });
    // A saved week that was switched to Program A uses A's cards instead.
    const wA = checkOffsFromLogs(c, programs, logs, { '2026-09-20': normWeek({ prog: 'A' }) })['2026-09-20'];
    expect(wA.done).toEqual({ 'A-d3s1': true });
  });

  it('works on sessions read back from an exported workbook', async () => {
    const s = S(); s.logs.hack[0].slot = 'A-d3s1';
    const d = await parseExcelExport(toBytes(buildOverallWorkbook(X, s, {})), cfg());
    const weeks = checkOffsFromLogs({ ...DEFAULT_CFG }, programs, d.logs, {});
    expect(weeks['2026-09-20'].done).toEqual({ 'A-d3s1': true });
  });
});

describe('entries logged by check-offs', () => {
  it('stay marked through an Excel export and import', async () => {
    const s = S(); s.logs.hack[0].auto = true;
    const d = await parseExcelExport(toBytes(buildOverallWorkbook(X, s, {})), cfg());
    expect(d.logs.hack[0].auto).toBe(true);
    expect(d.logs.hack[0].n).toBeUndefined();
    expect(entryKey(d.logs.hack[0])).toBe(entryKey(s.logs.hack[0]));
  });
});
