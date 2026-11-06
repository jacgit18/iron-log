// Results of QA scenario runs as data (brief: qa-scenario-automation). The file is `qa-results.json` beside the scenarios page in the project docs,
// outside this repository: an array of entries, written by `scripts/qa-scenarios-doc.mjs --record` and read when the page is regenerated. The app
// never writes it. The latest entry per scenario fills that scenario's Result cell.

export type Outcome = 'pass' | 'fail' | 'blocked';

export interface ResultEntry {
  id: string;
  outcome: Outcome;
  /** `YYYY-MM-DD`. */
  date: string;
  by: 'owner' | 'claude';
  build?: string;
  note?: string;
}

const OUTCOMES: readonly string[] = ['pass', 'fail', 'blocked'];

/** Why an entry cannot be stored, or null. `known` is every scenario id; `devices` the ids that need a real phone (only the owner can record those). */
export function entryProblem(e: unknown, known: ReadonlySet<string>, devices: ReadonlySet<string>): string | null {
  if (!e || typeof e !== 'object') return 'is not an object';
  const r = e as Record<string, unknown>;
  if (typeof r.id !== 'string' || !known.has(r.id)) return `names an unknown scenario ${JSON.stringify(r.id)}`;
  if (typeof r.outcome !== 'string' || !OUTCOMES.includes(r.outcome)) return `has outcome ${JSON.stringify(r.outcome)}, not pass, fail or blocked`;
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return `has date ${JSON.stringify(r.date)}, not YYYY-MM-DD`;
  if (r.by !== 'owner' && r.by !== 'claude') return `has by ${JSON.stringify(r.by)}, not owner or claude`;
  if (r.build !== undefined && typeof r.build !== 'string') return 'has a build that is not text';
  if (r.note !== undefined && typeof r.note !== 'string') return 'has a note that is not text';
  if (r.by === 'claude' && devices.has(r.id)) return `${r.id} needs a real phone, so only the owner can record it`;
  return null;
}

/** Parses the file's text. Empty text is no results; anything malformed throws an Error that names the entry, so nothing half-valid is used. */
export function parseResults(text: string, known: ReadonlySet<string>, devices: ReadonlySet<string>): ResultEntry[] {
  if (!text.trim()) return [];
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { throw new Error(`qa-results.json is not valid JSON: ${(e as Error).message}`); }
  if (!Array.isArray(data)) throw new Error('qa-results.json must be an array of entries');
  data.forEach((e, i) => {
    const why = entryProblem(e, known, devices);
    if (why) throw new Error(`qa-results.json entry ${i + 1} ${why}`);
  });
  return data as ResultEntry[];
}

/** The latest entry per scenario: the later date wins, and for the same date the later line. */
export function latestById(entries: readonly ResultEntry[]): Map<string, ResultEntry> {
  const out = new Map<string, ResultEntry>();
  for (const e of entries) {
    const prev = out.get(e.id);
    if (!prev || e.date >= prev.date) out.set(e.id, e);
  }
  return out;
}

/** The Result cell text for an entry: `2026-11-06 pass (claude, abc123): note`. */
export function formatResult(e: ResultEntry): string {
  const who = [e.by === 'claude' ? 'claude' : '', e.build ?? ''].filter(Boolean).join(', ');
  const note = e.note?.replace(/\s+/g, ' ').trim(); // one line, so it cannot split the Result line or a table row
  return `${e.date} ${e.outcome}${who ? ` (${who})` : ''}${note ? `: ${note}` : ''}`;
}

/** The file's new text with `entry` added at the end; the caller has already checked the entry. */
export function appendEntry(text: string, entry: ResultEntry, known: ReadonlySet<string>, devices: ReadonlySet<string>): string {
  const entries = [...parseResults(text, known, devices), entry];
  return `${JSON.stringify(entries, null, 2)}\n`;
}
