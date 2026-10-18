import { sql, type Kysely } from 'kysely';
import type { DB } from './db/types.ts';

// The production issue store (ADR 013 amendment): every scrubbed error report, phone or server, is counted under its fingerprint in the
// `issues` table through record_issue() (migration 20261018000001), so a first-ever report can be told from a repeat and an admin can see
// what is open. Only text that has already been scrubbed arrives here (clientErrors.ts: digits masked, no emails or tokens).
//
// Recording must never become the next error: it is fire and forget, a failure is logged and swallowed, and the same fingerprint is
// sent to the database at most once every few seconds per instance, so a burst of one failing request cannot turn into a burst of writes.
// The count is therefore "reports that reached the store", not every single request that failed.

export interface IssueInput {
  fingerprint: string;
  kind: 'error' | 'server' | 'sync' | 'unhandledrejection';
  message: string;
  topFrame: string;
  page: string;
  version: string;
}

export type RecordIssue = (issue: IssueInput) => void;

const THROTTLE_MS = 5_000;
const MAX_REMEMBERED = 500;

export function issueRecorder(db: Kysely<DB>, now: () => number = Date.now): RecordIssue {
  const lastSent = new Map<string, number>();
  return issue => {
    const t = now();
    const last = lastSent.get(issue.fingerprint);
    if (last !== undefined && t - last < THROTTLE_MS) return;
    if (lastSent.size >= MAX_REMEMBERED) lastSent.clear();
    lastSent.set(issue.fingerprint, t);
    sql<{ record_issue: boolean }>`select record_issue(${issue.fingerprint}, ${issue.kind}, ${issue.message}, ${issue.topFrame}, ${issue.page}, ${issue.version})`
      .execute(db)
      .then(result => {
        // One line when a problem is seen for the first time: the hook for a "new issue" alert.
        if (result.rows[0]?.record_issue) console.error(JSON.stringify({ severity: 'WARNING', msg: 'new-issue', fingerprint: issue.fingerprint, kind: issue.kind }));
      })
      .catch(err => console.error(JSON.stringify({ severity: 'WARNING', msg: 'issue not recorded', error: err instanceof Error ? err.message : String(err) })));
  };
}
