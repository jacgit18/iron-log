import { useEffect, useState } from 'react';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { DAY_NAMES, fmtShort, parseDate, ymd } from '../../shared/dates.js';
import { BACKUP_DAYS } from '../../lib/autoBackup.js';
import { DEVICE_NAME_MAX, deviceName, renameDevice } from '../../lib/deviceName.js';

// Every backup copy in one list, newest first (ADR 047 browser copies: the last 7 days; ADR 066 account copies: the last 30 days, paid
// subscribers and admins only, with syncing on). One row per day, saying where it lives (this device, your account, or both) and, for the account
// copy, which device wrote it. Restore opens a copy in the import review, which asks Merge or Replace before anything changes; a day kept in both
// places has one Restore for each copy. Brief backup-device-names.
const SHOWN = 10;
type Copy = { date: string; savedAt: string | number; entries: number; device?: string };
type Row = { date: string; here?: Copy; account?: Copy };

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
  const byDate = new Map<string, Row>();
  (backups ?? []).forEach(b => byDate.set(b.date, { date: b.date, here: b }));
  if (account && list?.ok) list.backups.forEach(b => byDate.set(b.date, { ...(byDate.get(b.date) ?? { date: b.date }), account: b }));
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  const [name, setName] = useState(deviceName());
  const [renaming, setRenaming] = useState<string | null>(null); // the text being typed, or null when the name is not being changed
  const [renameError, setRenameError] = useState(false);
  const saveName = () => { if (renaming !== null && renameDevice(renaming)) { setName(deviceName()); setRenaming(null); setRenameError(false); } else setRenameError(true); };
  const where = (r: Row) => (r.here && r.account ? 'This device and your account' : r.here ? 'This device' : 'Your account');
  const writer = (r: Row) => (!r.account?.device ? '' : !r.here ? ` · from ${r.account.device}` : r.account.device !== name ? ` · account copy from ${r.account.device}` : '');
  const newest = (r: Row) => [r.here?.savedAt, r.account?.savedAt].filter((x): x is string | number => x != null).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
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
          {shown.map(r => {
            const first = (r.here ?? r.account)!; const day = fmtShort(parseDate(r.date));
            return (
              <div className="exrow" key={r.date} data-where={r.here && r.account ? 'both' : r.here ? 'device' : 'account'}>
                <div className="exmain">
                  <b>{label(r.date)}</b>
                  <span className="note">{where(r)}{writer(r)} · {first.entries} logged set{first.entries === 1 ? '' : 's'} · saved {new Date(newest(r)!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <div className="actions flush">
                  {r.here && dl && <button type="button" className="btn sm ghost" aria-label={`Download the backup from ${day}`} onClick={() => void st.downloadBackup(r.date)}>Download</button>}
                  {r.here && r.account ? (
                    <>
                      <button type="button" className="btn sm" aria-label={`Restore device copy from ${day}`} onClick={() => void st.restoreBackup(r.date)}>Restore device copy</button>
                      <button type="button" className="btn sm" aria-label={`Restore account copy from ${day}`} onClick={() => void st.restoreServerBackup(r.date)}>Restore account copy</button>
                    </>
                  ) : r.here
                    ? <button type="button" className="btn sm" aria-label={`Restore the backup from ${day}`} onClick={() => void st.restoreBackup(r.date)}>Restore</button>
                    : <button type="button" className="btn sm" aria-label={`Restore the account backup from ${day}`} onClick={() => void st.restoreServerBackup(r.date)}>Restore</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > SHOWN && (
        <div className="actions flush">
          <button type="button" className="btn sm ghost" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer copies' : `Show all ${rows.length} copies`}</button>
        </div>
      )}
      {account && (
        <div className="devname">
          {renaming === null
            ? <p className="note">This device is called <b>{name}</b>, so a copy on your account says which device saved it. <button type="button" className="btn sm ghost" onClick={() => setRenaming(name)}>Rename</button></p>
            : (
              <div className="actions flush">
                <label className="field">Device name<input value={renaming} maxLength={DEVICE_NAME_MAX} aria-invalid={renameError} onChange={e => setRenaming(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(); }} /></label>
                <button type="button" className="btn sm" onClick={saveName}>Save name</button>
                <button type="button" className="btn sm ghost" onClick={() => { setRenaming(null); setRenameError(false); }}>Cancel</button>
              </div>
            )}
          {renameError && <p className="note err" role="alert">Use 1 to {DEVICE_NAME_MAX} characters.</p>}
        </div>
      )}
      <p className="note">The copies on this device stay in this browser. Clearing the site's data removes them, so use Export all data for a copy you keep elsewhere.{account && ' Your account copies are removed when you erase everything or delete your account.'}</p>
    </div>
  );
}
