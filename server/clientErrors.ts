import type { RequestHandler } from 'express';

// ADR 013: the phone reports the errors it meets (an uncaught error, a sync problem) so a failure that only happens on a phone is
// not found by luck. Anyone may send one, so the body is small (4 kb, set where this is mounted), rate-limited per address, and
// scrubbed before it is logged: body weights and notes are health-adjacent data, and an error message can carry them.
//
// What is kept: the kind, the message with every digit masked, only the stack frames (file and position, never the first line, which
// repeats the message) with query strings and fragments removed, the page's path and the app version. Never an email, a token, or
// anything the user typed. What is logged is one JSON line on stdout, which Cloud Run collects as an error entry.

export const KINDS = ['error', 'unhandledrejection', 'sync'] as const;
type Kind = (typeof KINDS)[number];

export interface ScrubbedReport {
  kind: Kind;
  message: string;
  stack: string[];
  page: string;
  version: string;
}

const mask = (text: string, max: number) =>
  text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\b(eyJ[\w-]{10,}|ghp_\w+|gho_\w+|github_pat_\w+|sk-\w{10,}|[A-Za-z0-9_-]{32,})\b/g, '[secret]')
    .replace(/\d/g, '#')
    .slice(0, max);

const path = (url: string) => {
  try { return new URL(url, 'https://x.invalid').pathname.slice(0, 120); } catch { return ''; }
};

// A stack frame with its address cleaned (no origin, query or fragment, positions kept); anything that is not a frame is dropped.
const frame = (raw: string) => {
  const line = raw.slice(0, 400);
  const at = /(https?:\/\/[^\s)]+)/.exec(line) ?? /([\w./-]+\.(?:js|mjs|ts|tsx|jsx)(?::\d+){0,2})\s*\)?\s*$/.exec(line);
  if (!at) return null;
  const address = at[1]!;
  const pos = /((?::\d+){1,2})$/.exec(address)?.[1] ?? '';
  const file = address.slice(0, address.length - pos.length).replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/, '');
  const name = line.slice(0, at.index).replace(/^\s*at\s+/, '').replace(/[(@\s]+$/, '').replace(/\d/g, '#').slice(0, 80);
  return `${name ? `${name} ` : ''}${file}${pos}`.slice(0, 160);
};

/** The report with everything that could be personal removed, or null when it is not a report at all. */
export function scrubReport(body: unknown): ScrubbedReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { kind, message, stack, page, version } = body as Record<string, unknown>;
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) return null;
  if (typeof message !== 'string' || !message.trim()) return null;
  const frames = typeof stack === 'string' ? stack.split('\n').slice(0, 30).map(frame).filter((f): f is string => !!f).slice(0, 12) : [];
  return {
    kind: kind as Kind,
    message: mask(message, 300),
    stack: frames,
    page: typeof page === 'string' ? path(page) : '',
    version: typeof version === 'string' ? version.replace(/[^\w.-]/g, '').slice(0, 20) : '',
  };
}

export function clientErrors(): RequestHandler {
  return (req, res) => {
    const report = scrubReport(req.body);
    if (!report) {
      res.status(422).json({ ok: false, error: 'not a report' });
      return;
    }
    // `severity` is what Cloud Logging reads to file this as an error.
    console.error(JSON.stringify({ severity: 'ERROR', msg: 'client-error', ...report }));
    res.status(204).end();
  };
}
