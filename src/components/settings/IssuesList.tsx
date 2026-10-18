import { useCallback, useEffect, useState } from 'react';
import { listIssues, updateIssue } from '../../lib/issuesClient.js';
import { timeAgo } from '../../lib/timeAgo.js';
import type { Issue, IssueCounts, IssueStatus } from '../../types.ts';

const STATUSES: IssueStatus[] = ['open', 'investigating', 'fixed', 'ignored'];
const SAY: Record<'failed' | 'forbidden' | 'offline', string> = {
  failed: 'Could not load the issues. Try again.',
  forbidden: 'This account is not allowed to see issues.',
  offline: 'You are offline. Issues need a connection.',
};

// The list behind "Show issues": a filter, the counts, and one row per issue that opens to change its status and note.
export default function IssuesList() {
  const [filter, setFilter] = useState<IssueStatus | null>('open');
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [counts, setCounts] = useState<IssueCounts | null>(null);
  const [problem, setProblem] = useState('');
  const [openFp, setOpenFp] = useState<string | null>(null);

  const load = useCallback(async (status: IssueStatus | null) => {
    const r = await listIssues(status);
    if (!r.ok) { setProblem(SAY[r.reason]); return; }
    setProblem(''); setIssues(r.issues); setCounts(r.counts);
  }, []);
  useEffect(() => { void load(filter); }, [filter, load]);

  return (
    <div className="issues-body">
      <div className="seg" role="group" aria-label="Show issues with status">
        <button type="button" className={filter === null ? 'on' : ''} aria-pressed={filter === null} onClick={() => setFilter(null)}>All</button>
        {STATUSES.map(s => (
          <button key={s} type="button" className={filter === s ? 'on' : ''} aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s[0]!.toUpperCase() + s.slice(1)}{counts ? ` ${counts[s]}` : ''}
          </button>
        ))}
      </div>
      {problem && <p className="note" role="status">{problem}</p>}
      {!problem && issues && !issues.length && <p className="note" role="status">No issues here.</p>}
      {!!issues?.length && (
        <ul className="issuelist">
          {issues.map(i => (
            <li key={i.fingerprint}>
              <IssueRow issue={i} open={openFp === i.fingerprint} onToggle={() => setOpenFp(openFp === i.fingerprint ? null : i.fingerprint)} onSaved={() => load(filter)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue, open, onToggle, onSaved }: { issue: Issue; open: boolean; onToggle: () => void; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [note, setNote] = useState(issue.note);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const save = async () => {
    setSaving(true); setProblem('');
    const r = await updateIssue(issue.fingerprint, { status, note });
    setSaving(false);
    if (!r.ok) { setProblem(SAY[r.reason]); return; }
    await onSaved();
  };
  return (
    <div className={`issuerow${open ? ' open' : ''}`}>
      <button type="button" className="issuehead" aria-expanded={open} onClick={onToggle}>
        <span className="issuemsg">{issue.message}</span>
        <span className="note">{issue.status} · {issue.kind} · seen {issue.occurrences} time{issue.occurrences === 1 ? '' : 's'} · last {timeAgo(issue.lastSeen)}</span>
      </button>
      {open && (
        <div className="issuedetail">
          <dl className="issuefacts">
            <dt>Fingerprint</dt><dd>{issue.fingerprint}</dd>
            <dt>First seen</dt><dd>{timeAgo(issue.firstSeen)}{issue.firstVersion && `, version ${issue.firstVersion}`}</dd>
            <dt>Last seen</dt><dd>{timeAgo(issue.lastSeen)}{issue.lastVersion && `, version ${issue.lastVersion}`}</dd>
            {issue.page && <><dt>Page</dt><dd>{issue.page}</dd></>}
            {issue.topFrame && <><dt>Top frame</dt><dd>{issue.topFrame}</dd></>}
          </dl>
          <div className="issuefield">
            <label htmlFor={`is-${issue.fingerprint}`}>Status</label>
            <select id={`is-${issue.fingerprint}`} className="btn sm" value={status} onChange={e => setStatus(e.target.value as IssueStatus)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="issuefield">
            <label htmlFor={`in-${issue.fingerprint}`}>Note</label>
            <textarea id={`in-${issue.fingerprint}`} rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="actions">
            <button type="button" className="btn sm primary" disabled={saving} onClick={() => void save()}>Save</button>
          </div>
          {problem && <p className="note" role="status">{problem}</p>}
        </div>
      )}
    </div>
  );
}
