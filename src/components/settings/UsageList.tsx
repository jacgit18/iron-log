import { useEffect, useState } from 'react';
import type { UsageOverview } from '../../shared/usage.js';
import { loadUsage } from '../../lib/usageAdminClient.js';

const SAY: Record<'failed' | 'forbidden' | 'offline', string> = {
  failed: 'Could not load the usage counts. Try again.',
  forbidden: 'Not allowed. An admin needs both the admin list entry on the server and is_admin set in the database.',
  offline: 'You are offline. Usage needs a connection.',
};
const DAYS = 30;
const pct = (r: UsageOverview['retention'][number]) => (r.eligible ? `${Math.round((r.returned / r.eligible) * 100)}%` : 'n/a');

// What is behind "Show usage": installs per day, who came back, and what was used, for the last 30 days.
export default function UsageList() {
  const [data, setData] = useState<UsageOverview | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    let live = true;
    void loadUsage(DAYS).then(r => {
      if (!live) return;
      if (!r.ok) { setProblem(SAY[r.reason]); return; }
      setProblem(''); setData(r);
    });
    return () => { live = false; };
  }, []);

  if (problem) return <p className="note" role="status">{problem}</p>;
  if (!data) return <p role="status">Loading usage…</p>;
  if (!data.installs) return <p className="note" role="status">No usage yet. Nobody has switched usage counts on in the last {DAYS} days.</p>;
  const events = [...new Set(data.features.map(f => f.event))].sort();
  const versions = [...new Set(data.features.map(f => f.version))].sort().reverse();
  const total = (version: string, event: string) => data.features.find(f => f.version === version && f.event === event)?.total ?? 0;
  return (
    <div className="usage-body">
      <p className="note">{data.installs} install{data.installs === 1 ? '' : 's'} in the last {DAYS} days. A reinstall or a second device counts as another install.</p>
      <table className="usage-table">
        <caption>Return rate, by days after the first day an install was seen</caption>
        <thead><tr><th scope="col">After</th><th scope="col">Came back</th><th scope="col">Of</th><th scope="col">Rate</th></tr></thead>
        <tbody>
          {data.retention.map(r => <tr key={r.after}><th scope="row">{r.after} day{r.after === 1 ? '' : 's'}</th><td>{r.returned}</td><td>{r.eligible}</td><td>{pct(r)}</td></tr>)}
        </tbody>
      </table>
      <table className="usage-table">
        <caption>Installs per day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Installs</th><th scope="col">From the Android app</th></tr></thead>
        <tbody>
          {data.days.map(d => <tr key={d.day}><th scope="row">{d.day}</th><td>{d.installs}</td><td>{d.fromApp}</td></tr>)}
        </tbody>
      </table>
      {!!events.length && (
        <table className="usage-table">
          <caption>Feature counts, by app version</caption>
          <thead><tr><th scope="col">Version</th>{events.map(e => <th key={e} scope="col">{e.replace(/_/g, ' ')}</th>)}</tr></thead>
          <tbody>
            {versions.map(v => <tr key={v}><th scope="row">{v || 'unknown'}</th>{events.map(e => <td key={e}>{total(v, e)}</td>)}</tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}
