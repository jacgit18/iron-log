/* ---------- Share an export through the phone's share sheet (Web Share API, level 2: files) ----------
   The file shared is the file the download would have saved (same builder, same bytes, same name). Everything here takes the
   navigator as an argument so it can be tested with a stub. */

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

type ShareNav = Pick<Navigator, 'share' | 'canShare'> | { share?: undefined; canShare?: undefined };

/** True only where the browser can share files at all (needs both `share` and `canShare`, which Firefox desktop and most desktop Chrome lack for files). */
export function canShareFiles(nav: ShareNav | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    // Probe with both file types the exports use, so the button never appears for a type the share sheet would refuse.
    const probe = (name: string) => nav.canShare!({ files: [new File([''], name, { type: mimeFor(name) })] });
    return probe('iron-log.xlsx') && probe('iron-log-data.json');
  } catch { return false; }
}

export function exportFile(filename: string, data: BlobPart): File {
  return new File([data], filename, { type: mimeFor(filename) });
}

/**
 * shared    - the share sheet took it
 * cancelled - the person closed the sheet (AbortError): not an error, show nothing
 * blocked   - the browser wanted a fresh tap (NotAllowedError, the click's permission ran out while the file was built): offer a second tap
 * failed    - anything else (no share support after all, a refused file, a system error): fall back to the download
 */
export type ShareResult = 'shared' | 'cancelled' | 'blocked' | 'failed';

/**
 * Must be called straight from a click, or from the second tap, with no `await` before it: the browser only opens the share sheet
 * while the tap's permission is live, and the first statement of this function (up to `nav.share(...)`) runs synchronously.
 */
export async function shareFile(file: File, nav: ShareNav | undefined = typeof navigator === 'undefined' ? undefined : navigator): Promise<ShareResult> {
  if (!nav || typeof nav.share !== 'function') return 'failed';
  let promise: Promise<void>;
  try {
    if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) return 'failed';
    promise = nav.share({ files: [file], title: file.name });
  } catch (err) { return classify(err); }
  try { await promise; return 'shared'; } catch (err) { return classify(err); }
}

function classify(err: unknown): ShareResult {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'AbortError') return 'cancelled';
  if (name === 'NotAllowedError') return 'blocked';
  return 'failed';
}
