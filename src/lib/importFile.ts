/* ---------- Picking a file to import ---------- */

// Extensions AND media types: iOS Safari filters the picker by media type and Android by either, and an extension-only list hides
// the file on some of them. `application/vnd.ms-excel` is what some Android and Windows pickers report for a .csv.
export const IMPORT_ACCEPT = '.json,application/json,.csv,text/csv,application/vnd.ms-excel,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const JSON_ACCEPT = '.json,application/json';

// A real export is well under 2 MB. Past this the file is not a Loadbearer export, and reading it into memory on a phone could hang the tab.
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

/** A message when the file should not be read at all, else ''. */
export function importFileProblem(file: { name: string; size: number }): string {
  if (file.size > MAX_IMPORT_BYTES) return `That file is too big (${(file.size / 1048576).toFixed(0)} MB). A Loadbearer export is a few MB at most.`;
  if (file.size === 0) return 'That file is empty.';
  return '';
}

/** Messages the app throws itself, already in plain words (lib/export.ts `loadXLSX`); every other error gets the fixed sentence below. */
const OWN_MESSAGES = new Set(['Excel library failed to load']);

/** Reading can fail on a phone (a cloud file that has not downloaded, a revoked permission): say so plainly. */
export function readFailure(err: unknown): string {
  const m = err instanceof Error ? err.message : '';
  if (/requested file could not be read|NotReadableError|NotFoundError/i.test(m) || (err instanceof Error && /NotReadable|NotFound/.test(err.name))) return 'Couldn’t read that file. If it is in a cloud drive, download it to the phone first, then pick it again.';
  if (OWN_MESSAGES.has(m)) return m; // a plain sentence the app itself threw
  return 'Couldn’t read that file'; // never the raw message of an error we did not write (a status number, "undefined")
}
