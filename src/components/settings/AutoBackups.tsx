import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { DAY_NAMES, fmtShort, parseDate, ymd } from '../../shared/dates.js';
import { BACKUP_DAYS } from '../../lib/autoBackup.js';

// The automatic backups (lib/autoBackup.ts): one copy of your data a day for the last 7 days, kept in this browser. Restore opens a copy in
// the import review, which asks Merge or Replace before anything changes.
export default function AutoBackups() {
  const backups = useAppStore(s => s.backups);
  const dl = useAppStore(s => s.dl);
  const today = ymd(useToday(s => s.today));
  const st = useAppStore.getState();
  useEffect(() => { void useAppStore.getState().refreshBackups(); }, []);
  const label = (date: string) => { const d = parseDate(date); return date === today ? `Today, ${fmtShort(d)}` : `${DAY_NAMES[d.getDay()]}, ${fmtShort(d)}`; };
  return (
    <div className="subblock" role="group" aria-labelledby="autobk-h">
      <h4 id="autobk-h">Automatic backups</h4>
      <p>Iron Log keeps a copy of your data on this device, one for each of the last {BACKUP_DAYS} days. If your data gets messed up or deleted, restore one. You review it before anything changes.</p>
      {backups && !backups.length && <p className="note" role="status">No backup yet. The first one is made a few seconds after the app opens.</p>}
      {!!backups?.length && (
        <div className="exrows">
          {backups.map(b => (
            <div className="exrow" key={b.date}>
              <div className="exmain">
                <b>{label(b.date)}</b>
                <span className="note">{b.entries} logged set{b.entries === 1 ? '' : 's'} · saved {new Date(b.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <div className="actions" style={{ margin: 0 }}>
                {dl && <button type="button" className="btn sm ghost" aria-label={`Download the backup from ${fmtShort(parseDate(b.date))}`} onClick={() => void st.downloadBackup(b.date)}>Download</button>}
                <button type="button" className="btn sm" aria-label={`Restore the backup from ${fmtShort(parseDate(b.date))}`} onClick={() => void st.restoreBackup(b.date)}>Restore</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="note">These stay in this browser. Clearing the site's data removes them, so use Export all data for a copy you keep elsewhere.</p>
    </div>
  );
}
