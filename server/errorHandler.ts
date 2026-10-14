import { randomUUID } from 'node:crypto';
import type { ErrorRequestHandler } from 'express';

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

export function errorHandler(): ErrorRequestHandler {
  return (err, req, res, next) => {
    // Too late to change the answer; let Express close the connection.
    if (res.headersSent) return next(err);
    const failure = asFailure(err);
    const requestId = randomUUID();
    const tooBig = failure.type === 'entity.too.large';
    const badBody = failure.type?.startsWith('entity.') === true || failure.type === 'encoding.unsupported' || failure.type === 'request.aborted';
    const trouble = !badBody && isDatabaseTrouble(err);
    const status = tooBig ? 413 : badBody ? 400 : trouble ? 503 : 500;
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
    if (status === 503) res.set('Retry-After', String(RETRY_AFTER_SECONDS));
    res.status(status).json({
      ok: false,
      error: tooBig ? 'request body too large' : badBody ? 'request body could not be read' : trouble ? 'the database is busy, try again shortly' : 'something went wrong on the server',
      requestId,
    });
  };
}
