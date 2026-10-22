/* ---------- Server backup history (ADR 066): the daily export file, kept on the account ----------
   The app uploads the same file it saves to IndexedDB (lib/autoBackup.ts), once the local copy is saved, and lists and fetches the days
   back for Restore. The server keeps the newest 7 days (free) or 30 (paid, admin); it decides, this file only asks. Nothing here throws:
   every failure comes back as a plain reason, because a missed upload is simply tried again at the next change. */
import { signIn } from '../sync/devUser.js';
import type { BackupInfo } from './autoBackup.js';

/** The largest compressed file the server takes (server/backups.ts MAX_BYTES). A bigger one is not sent. */
export const SERVER_MAX_BYTES = 1024 * 1024;

export type UploadResult = 'saved' | 'kept' | 'offline' | 'signed-out' | 'refused' | 'off' | 'failed';
export type ServerBackupList = { ok: true; days: number; backups: BackupInfo[] } | { ok: false; reason: 'offline' | 'signed-out' | 'off' | 'failed' };

const headers = (more: Record<string, string> = {}) => ({ 'x-client-version': __APP_VERSION__, ...signIn(), ...more });
const base = (day?: string) => `/api/backups${day ? `/${day}` : ''}`;

/** The text as gzip bytes when the browser can, else as plain text (the server accepts both). */
export async function packFile(text: string): Promise<{ body: Uint8Array<ArrayBuffer>; encoding: 'gzip' | 'identity' }> {
  const plain = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return { body: plain, encoding: 'identity' };
  try {
    const zipped = await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { body: new Uint8Array(zipped), encoding: 'gzip' };
  } catch { return { body: plain, encoding: 'identity' }; }
}

/** What a failed answer means for the caller: wait and retry (offline, failed), stop for now (signed-out, off), or never resend this file (refused). */
const reasonOf = (status: number): 'signed-out' | 'off' | 'refused' | 'failed' =>
  status === 401 || status === 403 ? 'signed-out' : status === 503 ? 'off' : status === 413 || status === 422 ? 'refused' : 'failed';

/** Whether this file is worth sending: not the one already sent for this day. `sent` is `day:score:length` of the last file the server answered for. */
export const uploadKey = (day: string, score: number, length: number) => `${day}:${score}:${length}`;

export async function uploadBackup(day: string, text: string, entries: number, score: number): Promise<UploadResult> {
  const { body, encoding } = await packFile(text);
  if (body.length > SERVER_MAX_BYTES) return 'refused';
  let res: Response;
  try {
    res = await fetch(base(day), { method: 'PUT', headers: headers({ 'content-type': 'application/octet-stream', 'x-backup-entries': String(entries), 'x-backup-score': String(score), 'x-backup-encoding': encoding }), body: body as BodyInit });
  } catch { return 'offline'; }
  if (!res.ok) return reasonOf(res.status);
  try { return (await res.json() as { saved?: boolean }).saved === false ? 'kept' : 'saved'; } catch { return 'saved'; }
}

export async function listServerBackups(): Promise<ServerBackupList> {
  let res: Response;
  try { res = await fetch(base(), { headers: headers() }); } catch { return { ok: false, reason: 'offline' }; }
  if (!res.ok) { const r = reasonOf(res.status); return { ok: false, reason: r === 'refused' ? 'failed' : r }; }
  try {
    const { days, backups } = await res.json() as { days?: number; backups?: BackupInfo[] };
    return Array.isArray(backups) && typeof days === 'number' ? { ok: true, days, backups } : { ok: false, reason: 'failed' };
  } catch { return { ok: false, reason: 'failed' }; }
}

/** One day's file as text, or null when it is gone or cannot be reached. */
export async function fetchServerBackup(day: string): Promise<string | null> {
  try {
    const res = await fetch(base(day), { headers: headers() });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}
