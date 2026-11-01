/* ---------- Telling the server about errors on this phone (ADR 013) ----------
   An uncaught error or a rejected promise is sent to POST /api/client-errors, which scrubs it and logs it, so a failure that only
   happens on a phone is not found by luck. Installed by main.tsx in every build except development, syncing on or not (ADR 013 note,
   2026-10-14), and sync anomalies (a refused write, an unexpected server answer) come through reportSync. A few reports per page
   load, the same one never twice, and a failed send is forgotten: reporting must never become the next error. */

export type ReportKind = 'error' | 'unhandledrejection' | 'sync';

export interface ReportTarget {
  addEventListener(type: 'error' | 'unhandledrejection', listener: (e: never) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', listener: (e: never) => void): void;
  location: { pathname: string };
}

export interface ReportOptions {
  version: string;
  send: (body: { kind: ReportKind; message: string; stack: string; page: string; version: string }) => void;
  target?: ReportTarget;
  /** Most reports per page load. */
  max?: number;
}

// The running reporter, so an error an ErrorBoundary caught (which never reaches the window's error event) goes through the same
// one-of-each and per-load limit. Null when reporting is off: a development build, or before main.tsx has installed it.
let current: ((kind: ReportKind, message: string, stack: string) => void) | null = null;

const EXTENSION_URL = /\b(?:chrome|moz|safari(?:-web)?|ms-browser)-extension:\/\//;
const PAGE_URL = /\b(?:https?|file|blob):\/\//;

/** True when a stack or script address belongs to a browser extension and nothing of the page's own scripts is in it: a failure inside
 *  an extension's injected script is not the app's to fix, and it would only bury the app's own errors. A stack with no addresses stays reported. */
export const fromExtension = (stack: string) => EXTENSION_URL.test(stack) && !PAGE_URL.test(stack);

const text = (v: unknown) => (v instanceof Error ? v : { message: typeof v === 'string' ? v : 'non-error value', stack: '' });

/** Starts listening; returns how to stop. */
export function installErrorReporting({ version, send, target = globalThis as unknown as ReportTarget, max = 5 }: ReportOptions): () => void {
  const seen = new Set<string>();
  const report = (kind: ReportKind, message: string, stack: string) => {
    if (fromExtension(stack)) return;
    const key = `${kind}|${message}`;
    if (seen.size >= max || seen.has(key)) return;
    seen.add(key);
    try { send({ kind, message: message || 'unknown error', stack, page: target.location.pathname, version }); } catch { /* never an error of its own */ }
  };
  const onError = (e: { message?: string; error?: unknown; filename?: string }) => {
    if (e.filename && fromExtension(e.filename) && !(e.error instanceof Error && e.error.stack)) return;
    const err = text(e.error);
    report('error', e.message || err.message, err.stack ?? '');
  };
  const onRejection = (e: { reason?: unknown }) => {
    const err = text(e.reason);
    report('unhandledrejection', err.message, err.stack ?? '');
  };
  current = report;
  target.addEventListener('error', onError as (e: never) => void);
  target.addEventListener('unhandledrejection', onRejection as (e: never) => void);
  return () => {
    if (current === report) current = null;
    target.removeEventListener('error', onError as (e: never) => void);
    target.removeEventListener('unhandledrejection', onRejection as (e: never) => void);
  };
}

/** Reports an error React caught in an ErrorBoundary (createRoot's onCaughtError). Does nothing while reporting is not installed. */
export function reportCaught(error: unknown) {
  const err = text(error);
  current?.('error', err.message, err.stack ?? '');
}

/** Reports a sync problem that did not throw (a write the server refused, an answer the app did not expect). Message only: never the document. */
export function reportSync(message: string) {
  current?.('sync', message, '');
}

/** The browser's way of sending one: same origin, fire and forget. */
export const sendReport: ReportOptions['send'] = body => {
  void fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
};
