import { createHash } from 'node:crypto';

// Scrubbing shared by everything that stores or logs an error: phone reports (clientErrors.ts) and server failures (errorHandler.ts).
// Moved here unchanged so a change to the phone-report format cannot change the fingerprints of server issues.

export const mask = (text: string, max: number) =>
  text
    // The lookbehind starts a match only at the beginning of a run of address characters, so a long run with no @ is read once, not retried from
    // every position (polynomial backtracking, CodeQL js/polynomial-redos), and an address of any length is masked whole, never by its tail.
    .replace(/(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\b(eyJ[\w-]{10,}|ghp_\w+|gho_\w+|github_pat_\w+|sk-\w{10,}|[A-Za-z0-9_-]{32,})\b/g, '[secret]')
    .replace(/\d/g, '#')
    .slice(0, max);

// A stack frame with its address cleaned (no origin, query or fragment, positions kept); anything that is not a frame is dropped.
export const frame = (raw: string) => {
  const line = raw.slice(0, 400);
  const at = /(https?:\/\/[^\s)]+)/.exec(line) ?? /([\w./-]+\.(?:js|mjs|ts|tsx|jsx)(?::\d+){0,2})\s*\)?\s*$/.exec(line);
  if (!at) return null;
  const address = at[1]!;
  const pos = /((?::\d+){1,2})$/.exec(address)?.[1] ?? '';
  const file = address.slice(0, address.length - pos.length).replace(/[?#].*$/, '').replace(/^https?:\/\/[^/]+/, '');
  const name = line.slice(0, at.index).replace(/^\s*at\s+/, '').replace(/[(@\s]+$/, '').replace(/\d/g, '#').slice(0, 80);
  return `${name ? `${name} ` : ''}${file}${pos}`.slice(0, 160);
};

// Kind, message (already masked, a run of digits counts as one) and the file of the top stack frame with its build hash and positions removed: the position and the
// minified function name change with every build, the file name and the message do not. Not a secret, only a short label: 12 hex digits.
export function fingerprintOf(kind: string, message: string, stack: string[]): string {
  const top = stack[0]?.replace(/:\d+(?::\d+)?$/, '').split(' ').pop()?.replace(/-[\w-]{8}(?=\.\w+$)/, '') ?? '';
  return createHash('sha256').update(`${kind}|${message.replace(/#+/g, '#')}|${top}`).digest('hex').slice(0, 12);
}
