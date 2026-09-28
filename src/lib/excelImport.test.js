import { describe, it, expect } from 'vitest';
import * as X from 'xlsx';
import { BUILTIN } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { buildOverallWorkbook, buildWeekWorkbook } from './export.js';
import { parseExcelExport, entryKey } from './excelImport.js';

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

  it('creates custom exercises for names it does not know', async () => {
    const bytes = toBytes(buildOverallWorkbook(X, S(), {}));
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
