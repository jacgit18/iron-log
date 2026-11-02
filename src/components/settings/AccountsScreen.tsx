import { useCallback, useEffect, useRef, useState } from 'react';
import { listAccounts, setSuspendedState, type AccountsOverview } from '../../lib/accountsClient.js';
import { actionText, capPercent, capText, joinedText, planText, SAY } from '../../lib/accountsView.js';
import { timeAgo } from '../../lib/timeAgo.js';
import ArmedButton from '../ArmedButton.js';
import './AccountsScreen.css';

// The admin accounts page (brief admin-accounts-screen, #/settings/accounts): the sign-up cap and counts, the newest accounts as a masked address,
// plan, join date and state, and Suspend or Restore. No names, full addresses or workout content ever reach this page. Admin-only for good
// (features.ts `adminAccounts`); every call is behind requireAdmin and the database checks users.is_admin again.
export default function AccountsScreen() {
  const [data, setData] = useState<AccountsOverview | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    const r = await listAccounts();
    if (id !== latest.current) return;
    if (!r.ok) { setProblem(SAY[r.reason]); return; }
    setProblem(''); setData(r.overview);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const loaded = data !== null;
  useEffect(() => { if (loaded) head.current?.focus({ preventScroll: true }); }, [loaded]); // the page is lazy, so the heading exists only now: it takes focus once, like the other Settings screens

  const change = async (id: string, suspend: boolean) => {
    setBusy(id); setProblem('');
    const r = await setSuspendedState(id, suspend);
    if (!r.ok) setProblem(SAY[r.reason]);
    await load();
    setBusy(null);
  };

  return (
    <div className="accts">
      <section className="panel" aria-labelledby="accts-h">
        <h3 id="accts-h" ref={head} tabIndex={-1}>Accounts</h3>
        <p>Only you can see this. It shows no workout content, names or full email addresses.</p>
        {data && (
          <div className="acctstats">
            <div className="acctstat">
              <b>{data.counts.total}{data.cap !== null ? ` / ${data.cap}` : ''}</b>
              <span>{capText(data.counts.total, data.cap)}</span>
              {data.cap !== null && <div className="capbar" role="img" aria-label={`Sign-up cap ${capPercent(data.counts.total, data.cap)} percent used`}><i style={{ width: `${capPercent(data.counts.total, data.cap)}%` }} /></div>}
            </div>
            <div className="acctstat"><b>{data.counts.total - data.counts.paid}</b><span>Free or beta</span></div>
            <div className="acctstat"><b>{data.counts.paid}</b><span>Paid, lifetime or founder</span></div>
            <div className="acctstat"><b>{data.counts.suspended}</b><span>Suspended</span></div>
          </div>
        )}
      </section>
      {problem && <p className="note" role="status">{problem}</p>}
      {!problem && !data && <p className="note" role="status">Loading accounts…</p>}
      {data && (
        <section className="panel" aria-labelledby="accts-list-h">
          <h3 id="accts-list-h">Newest accounts</h3>
          <ul className="acctlist">
            {data.accounts.map(a => (
              <li key={a.id} className="acctrow">
                <div className="acctwho"><b>{a.label}</b><small>Account {a.id}</small></div>
                <div className="acctplan"><span className="accttag">{planText(a.plan)}</span> {a.isAdmin && <span className="accttag">Admin</span>}</div>
                <div className="acctjoined"><small>{joinedText(a.joined)}</small>{a.suspended && <span className="accttag sus">Suspended</span>}</div>
                <div>
                  {a.isAdmin ? null : a.suspended
                    ? <button type="button" className="btn sm" disabled={busy !== null} aria-label={`Restore account ${a.id}`} onClick={() => void change(a.id, false)}>Restore</button>
                    : <ArmedButton className="btn sm" disabled={busy !== null} label="Suspend" armedLabel="Press again to suspend" aria-label={`Suspend account ${a.id}`} onConfirm={() => change(a.id, true)} />}
                </div>
              </li>
            ))}
          </ul>
          {data.accounts.length >= 50 && <p className="note">Showing the newest 50.</p>}
        </section>
      )}
      {data && (
        <section className="panel" aria-labelledby="accts-log-h">
          <h3 id="accts-log-h">Last actions</h3>
          {data.actions.length === 0 ? <p>No actions yet.</p> : (
            <ul className="acctlog">
              {data.actions.map(x => <li key={x.id}><span>{actionText(x)}</span><span>{timeAgo(x.at)}</span></li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
