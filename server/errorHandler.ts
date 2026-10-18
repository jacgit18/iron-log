import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';
import { fingerprintOf, frame, mask } from './clientErrors.ts';
import type { RecordIssue } from './issues.ts';

// The last stop for an error no route handled (EH-01). Express's default handler answers HTML with the stack trace; the phone's
// sync code expects the `{ ok:false, error }` shape and treats a 5xx as "try again later", so every failure leaves here as JSON.
//
// - A body that does not parse, or is too big: 400 or 413, the same code and message every time.
// - The database is down, slow or out of connections: 503 and Retry-After, which the phone already treats as "wait and retry".
// - Anything else: 500 with a request id and nothing from the error, so no stack, table or query reaches the client.
// The detail goes to the log as one JSON line (Cloud Run collects it as an error entry), with the same id.

const RETRY_AFTER_SECONDS = 5;

// Postgres class 08 (connection), 53 (out of resources), 57 (shutdown, cancelled query, 57014 statement timeout), 40 (rolled back) and the Node socket errors.
const TRANSIENT_CODE = /^(08|53|57|40)/;
const SOCKET_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND']);

interface Failure {
  status?: number;
  statusCode?: number;
  type?: string;
  code?: string;
  message?: string;
}

const asFailure = (err: unknown): Failure => (typeof err === 'object' && err !== null ? (err as Failure) : {});

export function isDatabaseTrouble(err: unknown): boolean {
  const { code, message = '' } = asFailure(err);
  if (code && (TRANSIENT_CODE.test(code) || SOCKET_CODES.has(code))) return true;
  return /timeout exceeded when trying to connect|Connection terminated|connection timeout|Client has encountered a connection error/i.test(message);
}

// A server failure as the issue store keeps it. Quoted text is cut out first: a database error can quote the value that was refused
// (an exercise name, a note), and the store holds only what could never be personal.
export function serverIssue(err: unknown, path: string) {
  const text = err instanceof Error ? err.message : String(err);
  const message = mask(text.replace(/(["`]).*?\1|(?<!\w)'[^']*'(?!\w)/g, m => `${m[0]}…${m[0]}`), 300) || 'unknown error';
  const stack = (err instanceof Error ? (err.stack ?? '').split('\n') : []).slice(1, 8).map(frame).filter((f): f is string => !!f).slice(0, 6);
  return { fingerprint: fingerprintOf('server', message, stack), kind: 'server' as const, message, topFrame: stack[0] ?? '', page: mask(path, 120), version: '' };
}

// Recording is best effort and sits inside the error path: whatever goes wrong here must not replace the answer the phone is waiting for.
function note(record: RecordIssue | undefined, err: unknown, path: string) {
  try { record?.(serverIssue(err, path)); } catch { /* never an error of its own */ }
}

export function errorHandler(record?: RecordIssue): ErrorRequestHandler {
  return (err, req, res, next) => {
    // Too late to change the answer; let Express close the connection.
    if (res.headersSent) {
      note(record, err, req.path);
      return next(err);
    }
    const failure = asFailure(err);
    const requestId = randomUUID();
    const tooBig = failure.type === 'entity.too.large';
    const badBody = failure.type?.startsWith('entity.') === true || failure.type === 'encoding.unsupported' || failure.type === 'request.aborted';
    const trouble = !badBody && isDatabaseTrouble(err);
    // A 4xx Express or body-parser already chose (a bad percent-escape in a path, an unsupported charset) is the client's mistake, not ours.
    const given = failure.status ?? failure.statusCode;
    const clientError = given !== undefined && given >= 400 && given < 500 ? given : null;
    const status = tooBig ? 413 : badBody ? 400 : clientError ?? (trouble ? 503 : 500);
    console.error(JSON.stringify({
      severity: status >= 500 ? 'ERROR' : 'WARNING',
      msg: 'request failed',
      requestId,
      method: req.method,
      path: req.path,
      status,
      code: failure.code ?? failure.type,
      // The message and first frames only: a stack can name SQL, and the message is never sent to the client.
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(1, 6).map(l => l.trim()) : undefined,
    }));
    if (status >= 500) note(record, err, req.path);
    if (status === 503) res.set('Retry-After', String(RETRY_AFTER_SECONDS));
    res.status(status).json({
      ok: false,
      error: tooBig ? 'request body too large' : badBody ? 'request body could not be read' : clientError ? 'the request could not be understood' : trouble ? 'the database is busy, try again shortly' : 'something went wrong on the server',
      requestId,
    });
  };
}
