import { buildCsv, buildDataFile, buildOverallWorkbook, buildWeekWorkbook, loadXLSX } from '../lib/export.js';
import { ymd } from '../shared/dates.js';
import type { ExportSlice, Flag, StoreGet, StoreSet } from './types.ts';

// The downloads: CSV, Excel and the full data file, all saved through the host's (or the blob-link) `dl` handle.
export const exportSlice = (set: StoreSet, get: StoreGet, flag: Flag): ExportSlice => ({
  exporting: null, // which export is running: 'csv' | 'xlsx-all' | 'xlsx-week' | 'data'

  async runExport(kind, fn) {
    const dl = get().dl; if (!dl || get().exporting) return;
    set({ exporting: kind });
    try { await fn(dl); flag('Exported'); }
    catch (err) {
      const e = err as { code?: string; message?: string } | null;
      const c = e && e.code;
      if (c === 'declined') { /* user closed the save prompt */ }
      else if (c === 'rate_limited') flag('A save prompt is already open');
      // One failed export never hides the others: every kind saves through the same `dl`, and Export all data is the one backup.
      else flag(e && e.message && !c ? e.message : 'Export isn’t available here');
    } finally { set({ exporting: null }); }
  },
  exportCsv() { return get().runExport('csv', dl => dl.save({ filename: `iron-log-${ymd(new Date())}.csv`, data: buildCsv(get().snapshot()) })); },
  // The file an export produces, built the same way for every download.
  async buildExportFile(kind) {
    if (kind === 'data') {
      const d = buildDataFile(await get().fullSnapshot(), await get().allWeeks());
      return { filename: `iron-log-data-${ymd(new Date())}.json`, data: JSON.stringify(d, null, 1) };
    }
    const which = kind === 'xlsx-week' ? 'week' : 'all';
    const X = await loadXLSX(); const S = get().snapshot();
    const wb = which === 'week' ? buildWeekWorkbook(X, S, get().weekKey(), get().week) : buildOverallWorkbook(X, S, await get().allWeeks());
    const data = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
    return { filename: which === 'week' ? `iron-log-week-${get().weekKey()}.xlsx` : `iron-log-${ymd(new Date())}.xlsx`, data };
  },
  downloadExcel(which) {
    return get().runExport(`xlsx-${which}`, async dl => { await dl.save(await get().buildExportFile(`xlsx-${which}`)); });
  },
  downloadData() {
    return get().runExport('data', async dl => { await dl.save(await get().buildExportFile('data')); });
  },
});
