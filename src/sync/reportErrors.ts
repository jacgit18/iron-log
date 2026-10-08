/* ---------- Telling the server about errors on this phone (ADR 013) ----------
   An uncaught error or a rejected promise is sent to POST /api/client-errors, which scrubs it and logs it, so a failure that only
   happens on a phone is not found by luck. Only when syncing is on (this file is loaded with the sync adapter). A few reports per page
   load, the same one never twice, and a failed send is forgotten: reporting must never become the next error. */

export interface ReportTarget {
  addEventListener(type: 'error' | 'unhandledrejection', listener: (e: never) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', listener: (e: never) => void): void;
  location: { pathname: string };
}

export interface ReportOptions {
  version: string;
  send: (body: { kind: 'error' | 'unhandledrejection'; message: string; stack: string; page: string; version: string }) => void;
  target?: ReportTarget;
  /** Most reports per page load. */
  max?: number;
}

const text = (v: unknown) => (v instanceof Error ? v : { message: typeof v === 'string' ? v : 'non-error value', stack: '' });

/** Starts listening; returns how to stop. */
export function installErrorReporting({ version, send, target = window as unknown as ReportTarget, max = 5 }: ReportOptions): () => void {
  const seen = new Set<string>();
  const report = (kind: 'error' | 'unhandledrejection', message: string, stack: string) => {
    const key = `${kind}|${message}`;
    if (seen.size >= max || seen.has(key)) return;
    seen.add(key);
    try { send({ kind, message: message || 'unknown error', stack, page: target.location.pathname, version }); } catch { /* never an error of its own */ }
  };
  const onError = (e: { message?: string; error?: unknown }) => {
    const err = text(e.error);
    report('error', e.message || err.message, err.stack ?? '');
  };
  const onRejection = (e: { reason?: unknown }) => {
    const err = text(e.reason);
    report('unhandledrejection', err.message, err.stack ?? '');
  };
  target.addEventListener('error', onError as (e: never) => void);
  target.addEventListener('unhandledrejection', onRejection as (e: never) => void);
  return () => {
    target.removeEventListener('error', onError as (e: never) => void);
    target.removeEventListener('unhandledrejection', onRejection as (e: never) => void);
  };
}

/** The browser's way of sending one: same origin, fire and forget. */
export const sendReport: ReportOptions['send'] = body => {
  void fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
};
