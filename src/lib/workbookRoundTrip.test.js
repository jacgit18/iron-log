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
    for (const k of ['config', 'programs', 'library', 'weeks', 'body', 'experiments']) expect(prune(viaXlsx[k]), k).toEqual(prune(viaJson[k]));
    expect(prune(noDerivedWk(viaXlsx.logs))).toEqual(prune(noDerivedWk(viaJson.logs)));
  });

  it('also holds once Excel or Sheets has re-saved it', async () => {
    const wb = X.read(bytes(buildOverallWorkbook(X, S, raw.weeks)), { type: 'array' });
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, raw.weeks)));
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(prune(viaXlsx.programs)).toEqual(prune(viaJson.programs));
  });

  const exps = [{ id: 'E1', ex: 'hack', ph: 'hyp', note: 'try light' }, { id: 'E2', ex: 'legext', ph: null, note: '' }];
  const weeksX = () => ({ ...raw.weeks, '2030-01-06': { done: { 'X-1': true }, extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp', note: '' }] } });

  it('keeps the experiment list and added cards through the JSON file and the workbook (and a re-save)', async () => {
    const SX = { ...S, experiments: exps };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(SX, weeksX())));
    const wb = buildOverallWorkbook(X, SX, weeksX());
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    const viaResave = await parseExcelExport(bytes(X.read(bytes(wb), { type: 'array' })), DEFAULT_CFG);
    for (const d of [viaJson, viaXlsx, viaResave]) {
      expect(d.experiments).toEqual(exps);
      expect(d.weeks['2030-01-06'].extra).toEqual([{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp', note: '' }]);
    }
  });

  it('a workbook made before the Experiments sheet still imports as a full backup', async () => {
    const wb = buildOverallWorkbook(X, { ...S, experiments: exps }, raw.weeks);
    delete wb.Sheets.Experiments; wb.SheetNames = wb.SheetNames.filter(n => n !== 'Experiments');
    const d = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(d.excel.complete).toBe(true);
    expect(d.experiments).toEqual([]);
  });

  it('a JSON file without experiments imports with an empty list', () => {
    const f = buildDataFile(S, raw.weeks); delete f.experiments;
    expect(parseDataFile(JSON.stringify(f)).experiments).toEqual([]);
  });

  it('keeps a week’s rest day through the JSON file and the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3 } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, weeks)), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].rest).toEqual([3]);
    expect(viaXlsx.weeks['2030-01-06'].rest).toEqual([3]);
  });

  it('keeps several rest days through the JSON file and the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: [2, 5] } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, weeks)), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].rest).toEqual([2, 5]);
    expect(viaXlsx.weeks['2030-01-06'].rest).toEqual([2, 5]);
  });
  it('keeps the rest day once Excel or Sheets has re-saved the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3 } };
    const wb = X.read(bytes(buildOverallWorkbook(X, S, weeks)), { type: 'array' });
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(viaXlsx.weeks['2030-01-06'].rest).toEqual([3]);
  });

  it('keeps a week’s swapped order and rest day through the JSON file and the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3, order: [2, 1, 3, 4, 5, 6, 7] } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, weeks)), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].order).toEqual([2, 1, 3, 4, 5, 6, 7]);
    expect(viaXlsx.weeks['2030-01-06'].order).toEqual([2, 1, 3, 4, 5, 6, 7]);
    expect(viaXlsx.weeks['2030-01-06'].rest).toEqual([3]);
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

  it('keeps the rest day’s date through the JSON file, the workbook and an Excel re-save', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3, restOn: '2030-01-08' } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const wb = buildOverallWorkbook(X, S, weeks);
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    // What Excel and Google Sheets do on save: ISO date text in the date columns becomes a real date.
    const resaved = X.read(bytes(wb), { type: 'array' });
    const ws = resaved.Sheets['Check-offs'];
    const toDate = c => { const [y, m, d] = c.v.split('-').map(Number); return { t: 'd', v: new Date(Date.UTC(y, m - 1, d)) }; };
    const isIso = c => c && c.t === 's' && /^\d{4}-\d{2}-\d{2}$/.test(c.v);
    let restOnConverted = false;
    Object.keys(ws).filter(k => /^A([2-9]|\d\d+)$/.test(k)).forEach(k => {
      const row = k.slice(1);
      if (isIso(ws[k])) ws[k] = toDate(ws[k]);
      if (ws['B' + row] && ws['B' + row].v === 'restOn' && isIso(ws['D' + row])) { ws['D' + row] = toDate(ws['D' + row]); restOnConverted = true; }
    });
    expect(restOnConverted).toBe(true);
    const viaResave = await parseExcelExport(bytes(resaved), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].restOn).toBe('2030-01-08');
    expect(viaXlsx.weeks['2030-01-06'].restOn).toBe('2030-01-08');
    expect(viaResave.weeks['2030-01-06'].restOn).toBe('2030-01-08');
  });

  it('ignores a rest date that has no rest day', async () => {
    const weeks = { '2030-01-06': { done: { x: true }, restOn: '2030-01-08' } };
    expect(parseDataFile(JSON.stringify(buildDataFile(S, weeks))).weeks['2030-01-06']).not.toHaveProperty('restOn');
  });
});
