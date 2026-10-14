import type { Server } from 'node:http';

// What the process does when something escapes every handler (EH-02) and when Cloud Run stops it (EH-05).
//
// An unhandled rejection or an uncaught exception leaves the process in an unknown state, so log it as one JSON line and exit: Cloud
// Run starts a fresh instance. The exit is delayed a moment so the log line is flushed.

export const SHUTDOWN_GRACE_MS = 8_000;

interface Hooks {
  /** Close the pools. */
  close: () => Promise<void>;
  exit?: (code: number) => void;
  proc?: Pick<NodeJS.Process, 'on'>;
  graceMs?: number;
}

const logLine = (msg: string, reason: unknown) =>
  console.error(JSON.stringify({ severity: 'CRITICAL', msg, error: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack?.split('\n').slice(1, 6).map(l => l.trim()) : undefined }));

export function installProcessGuards(server: Server, { close, exit = code => process.exit(code), proc = process, graceMs = SHUTDOWN_GRACE_MS }: Hooks): void {
  let stopping = false;
  const stop = (code: number) => {
    if (stopping) return;
    stopping = true;
    // Whatever is still running after the grace period is cut off: a stuck request must not keep the instance alive past Cloud Run's SIGKILL.
    setTimeout(() => exit(code || 1), graceMs).unref();
    server.close(() => void close().catch(() => undefined).finally(() => exit(code)));
    // Keep-alive connections would hold server.close() open until their idle timeout.
    server.closeIdleConnections();
  };
  proc.on('unhandledRejection', reason => { logLine('unhandled rejection', reason); stop(1); });
  proc.on('uncaughtException', err => { logLine('uncaught exception', err); stop(1); });
  proc.on('SIGTERM', () => stop(0));
}
