import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { DAY_NAMES, fmtShort, parseDate, ymd } from '../../shared/dates.js';

// The days kept on the account (ADR 066, lib/serverBackups.ts), under the browser copies in Automatic backups. Free keeps 7 days, paid and
// admin 30; the server says which. Restore opens a day in the import review, which asks Merge or Replace before anything changes.
export default function ServerBackups() {
  const list = useAppStore(s => s.serverBackups);
  const syncOn = useAppStore(s => !!s.sync);
  const today = ymd(useToday(s => s.today));
  const st = useAppStore.getState();
  useEffect(() => { if (syncOn) void useAppStore.getState().refreshServerBackups(); }, [syncOn]);
  if (!syncOn) return null;
  const label = (date: string) => { const d = parseDate(date); return date === today ? `Today, ${fmtShort(d)}` : `${DAY_NAMES[d.getDay()]}, ${fmtShort(d)}`; };
  const days = list?.ok ? list.days : 7;
  return (
    <div className="subblock serverbk" role="group" aria-labelledby="serverbk-h">
      <h4 id="serverbk-h">Saved on your account</h4>
      <p>Iron Log also keeps a copy on your account, one for each of the last {days} days, so it survives clearing this browser or replacing your phone.</p>
      {!list && <p className="note" role="status">Looking for your account backups…</p>}
      {list && !list.ok && (
        <>
          <p className="note" role="status">{list.reason === 'offline' ? 'Your account backups can’t be reached right now. The copies on this device still work.' : list.reason === 'signed-out' ? 'Sign in to see your account backups.' : list.reason === 'off' ? 'Account backups are paused for now.' : 'Your account backups couldn’t be loaded.'}</p>
          {(list.reason === 'offline' || list.reason === 'failed') && <div className="actions flush"><button type="button" className="btn sm ghost" onClick={() => void st.refreshServerBackups()}>Try again</button></div>}
        </>
      )}
      {list?.ok && !list.backups.length && <p className="note" role="status">No account backup yet. The first one is made after you have logged something.</p>}
      {list?.ok && !!list.backups.length && (
        <div className="exrows">
          {list.backups.map(b => (
            <div className="exrow" key={b.date}>
              <div className="exmain">
                <b>{label(b.date)}</b>
                <span className="note">{b.entries} logged set{b.entries === 1 ? '' : 's'} · saved {new Date(b.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <div className="actions flush">
                <button type="button" className="btn sm" aria-label={`Restore the account backup from ${fmtShort(parseDate(b.date))}`} onClick={() => void st.restoreServerBackup(b.date)}>Restore</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="note">Your account copies are removed when you erase everything or delete your account.</p>
    </div>
  );
}
