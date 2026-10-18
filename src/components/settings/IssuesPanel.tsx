import { lazy, Suspense, useState } from 'react';
import { useFeature } from '../../features.js';
import './IssuesPanel.css';

// Production issues (ADR 013 amendment, step 3): the errors phones and the server have reported, counted by fingerprint. Admin-only for good
// (features.ts `adminIssues`; the API is behind requireAdmin and the database checks users.is_admin again). The list is its own chunk and is
// asked for only when "Show issues" is pressed, so it costs nobody else anything and nothing arrives after load to move the page.
const IssuesList = lazy(() => import('./IssuesList.js'));

export default function IssuesPanel() {
  const allowed = useFeature('adminIssues');
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <section className="panel issues" aria-labelledby="issues-h">
      <h3 id="issues-h">Production issues</h3>
      <p>Errors reported by phones and by the server, grouped by what went wrong. Only you can see this.</p>
      <div className="actions">
        <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide issues' : 'Show issues'}</button>
      </div>
      {open && (
        <Suspense fallback={<p role="status">Loading issues…</p>}>
          <IssuesList />
        </Suspense>
      )}
    </section>
  );
}
