import { useEffect, useState } from 'react';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { DAY_NAMES, fmtShort, parseDate, ymd } from '../../shared/dates.js';
import { BACKUP_DAYS } from '../../lib/autoBackup.js';

// Every backup copy in one list, newest first (ADR 047 browser copies: the last 7 days; ADR 066 account copies: the last 30 days, paid
// subscribers and admins only, with syncing on). Each row says where it lives. Restore opens a copy in the import review, which asks Merge or
// Replace before anything changes. A day kept in both places shows as two rows.
const SHOWN = 10;
type Row = { where: 'device' | 'account'; date: string; savedAt: string | number; entries: number };

export default function BackupCopies() {
  const backups = useAppStore(s => s.backups);
  const list = useAppStore(s => s.serverBackups);
  const dl = useAppStore(s => s.dl);
  const allowed = useFeature('serverBackups');
  const account = !!useAppStore(s => s.sync) && allowed;
  const today = ymd(useToday(s => s.today));
  const [all, setAll] = useState(false);
  const st = useAppStore.getState();
  useEffect(() => { void useAppStore.getState().refreshBackups(); }, []);
  useEffect(() => { if (account) void useAppStore.getState().refreshServerBackups(); }, [account]);
  const label = (date: string) => { const d = parseDate(date); return date === today ? `Today, ${fmtShort(d)}` : `${DAY_NAMES[d.getDay()]}, ${fmtShort(d)}`; };
  const rows: Row[] = [
    ...(backups ?? []).map(b => ({ where: 'device' as const, date: b.date, savedAt: b.savedAt, entries: b.entries })),
    ...(account && list?.ok ? list.backups.map(b => ({ where: 'account' as const, date: b.date, savedAt: b.savedAt, entries: b.entries })) : []),
  ].sort((a, b) => (a.date === b.date ? (a.where === b.where ? 0 : a.where === 'device' ? -1 : 1) : a.date < b.date ? 1 : -1));
  const shown = all ? rows : rows.slice(0, SHOWN);
  const days = list?.ok ? list.days : 30;
  const accountEmpty = account && list?.ok && !list.backups.length;
  return (
    <div className="subblock" role="group" aria-labelledby="bk-h">
      <h4 id="bk-h">Backups</h4>
      <p>Iron Log keeps a copy of your data on this device, one for each of the last {BACKUP_DAYS} days.{account && <> It also keeps a copy on your account, one for each of the last {days} days, so it survives clearing this browser or replacing your phone.</>} If your data gets messed up or deleted, restore one. You review it before anything changes.</p>
      {backups && !rows.length && <p className="note" role="status">No backup yet. The first one is made a few seconds after the app opens.</p>}
      {account && !list && <p className="note" role="status">Looking for your account backups…</p>}
      {account && list && !list.ok && (
        <>
          <p className="note" role="status">{list.reason === 'offline' ? 'Your account backups can’t be reached right now. The copies on this device still work.' : list.reason === 'signed-out' ? 'Sign in to see your account backups.' : list.reason === 'off' ? 'Account backups are paused for now.' : 'Your account backups couldn’t be loaded.'}</p>
          {(list.reason === 'offline' || list.reason === 'failed') && <div className="actions flush"><button type="button" className="btn sm ghost" onClick={() => void st.refreshServerBackups()}>Try again</button></div>}
        </>
      )}
      {accountEmpty && <p className="note" role="status">No account backup yet. The first one is made after you have logged something.</p>}
      {!!rows.length && (
        <div className="exrows">
          {shown.map(b => (
            <div className="exrow" key={`${b.where}-${b.date}`} data-where={b.where}>
              <div className="exmain">
                <b>{label(b.date)}</b>
                <span className="note">{b.where === 'device' ? 'This device' : 'Your account'} · {b.entries} logged set{b.entries === 1 ? '' : 's'} · saved {new Date(b.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <div className="actions flush">
                {b.where === 'device' && dl && <button type="button" className="btn sm ghost" aria-label={`Download the backup from ${fmtShort(parseDate(b.date))}`} onClick={() => void st.downloadBackup(b.date)}>Download</button>}
                {b.where === 'device'
                  ? <button type="button" className="btn sm" aria-label={`Restore the backup from ${fmtShort(parseDate(b.date))}`} onClick={() => void st.restoreBackup(b.date)}>Restore</button>
                  : <button type="button" className="btn sm" aria-label={`Restore the account backup from ${fmtShort(parseDate(b.date))}`} onClick={() => void st.restoreServerBackup(b.date)}>Restore</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length > SHOWN && (
        <div className="actions flush">
          <button type="button" className="btn sm ghost" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer copies' : `Show all ${rows.length} copies`}</button>
        </div>
      )}
      <p className="note">The copies on this device stay in this browser. Clearing the site's data removes them, so use Export all data for a copy you keep elsewhere.{account && ' Your account copies are removed when you erase everything or delete your account.'}</p>
    </div>
  );
}
