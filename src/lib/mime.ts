/* ---------- Media types of the export files ----------
   The download names its file's type from the file name, so a phone opens it with the right app. */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const JSON_MIME = 'application/json';
export const CSV_MIME = 'text/csv';

/** The media type for an export file name. */
export function mimeFor(filename: string): string {
  if (/\.xlsx$/i.test(filename)) return XLSX_MIME;
  if (/\.json$/i.test(filename)) return JSON_MIME;
  if (/\.csv$/i.test(filename)) return CSV_MIME;
  return 'application/octet-stream';
}
