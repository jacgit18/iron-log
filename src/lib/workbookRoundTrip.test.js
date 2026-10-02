/* The Excel workbook is a full backup: exporting then importing gives the same data as the JSON file. */
import { describe, it, expect } from 'vitest';
import * as X from 'xlsx';
import { readFileSync } from 'node:fs';
import { parseDataFile, buildDataFile, buildOverallWorkbook } from './export.js';
import { parseExcelExport } from './excelImport.js';
import { resolveProgram } from './data.js';
import { DEFAULT_CFG } from './logic.js';
import { weekOfDate } from './trends.js';

const raw = JSON.parse(readFileSync(new URL('../test/fixtures/iron-log-data.v1.json', import.meta.url), 'utf8'));
const cfg = { ...structuredClone(DEFAULT_CFG), ...structuredClone(raw.config) };
const S = { cfg, logs: structuredClone(raw.logs), programs: { A: resolveProgram('A', raw.programs.A), B: resolveProgram('B', raw.programs.B) }, library: structuredClone(raw.library), body: structuredClone(raw.body) };
const bytes = wb => X.write(wb, { type: 'array', bookType: 'xlsx' });
const prune = v => JSON.parse(JSON.stringify(v, (k, x) => (x === null ? undefined : x)));
const noDerivedWk = logs => { const o = structuredClone(logs); Object.values(o).forEach(L => L.forEach(e => { if (e.wk === weekOfDate(e.d)) delete e.wk; })); return o; };

describe('workbook round trip', () => {
  it('imports back everything the JSON data file holds', async () => {
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, raw.weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, raw.weeks)), DEFAULT_CFG);
    expect(viaXlsx.excel.complete).toBe(true);
    for (const k of ['config', 'programs', 'library', 'weeks', 'body']) expect(prune(viaXlsx[k]), k).toEqual(prune(viaJson[k]));
    expect(prune(noDerivedWk(viaXlsx.logs))).toEqual(prune(noDerivedWk(viaJson.logs)));
  });

  it('also holds once Excel or Sheets has re-saved it', async () => {
    const wb = X.read(bytes(buildOverallWorkbook(X, S, raw.weeks)), { type: 'array' });
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, raw.weeks)));
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(prune(viaXlsx.programs)).toEqual(prune(viaJson.programs));
  });

  it('keeps a week’s rest day through the JSON file and the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3 } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, weeks)), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].rest).toBe(3);
    expect(viaXlsx.weeks['2030-01-06'].rest).toBe(3);
  });

  it('keeps the rest day once Excel or Sheets has re-saved the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3 } };
    const wb = X.read(bytes(buildOverallWorkbook(X, S, weeks)), { type: 'array' });
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(viaXlsx.weeks['2030-01-06'].rest).toBe(3);
  });

  it('keeps a week’s swapped order and rest day through the JSON file and the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3, order: [2, 1, 3, 4, 5, 6, 7] } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, weeks)), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].order).toEqual([2, 1, 3, 4, 5, 6, 7]);
    expect(viaXlsx.weeks['2030-01-06'].order).toEqual([2, 1, 3, 4, 5, 6, 7]);
    expect(viaXlsx.weeks['2030-01-06'].rest).toBe(3);
  });

  it('keeps the order once Excel or Sheets has re-saved the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, order: [1, 2, 3, 4, 5, 7, 6] } };
    const wb = X.read(bytes(buildOverallWorkbook(X, S, weeks)), { type: 'array' });
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(viaXlsx.weeks['2030-01-06'].order).toEqual([1, 2, 3, 4, 5, 7, 6]);
  });

  it('ignores an order that is not a clean permutation', () => {
    const weeks = { '2030-01-06': { done: { x: true }, order: [1, 1, 3, 4, 5, 6, 7] } };
    expect(parseDataFile(JSON.stringify(buildDataFile(S, weeks))).weeks['2030-01-06']).not.toHaveProperty('order');
  });
});
