import { exInfo } from '../../lib/data.js';
import { describeSync, formatWhen, notSentFile, pathLabel, storageWarning, versionLabel } from '../../sync/labels.js';
import type { QuarantineEntry } from '../../sync/outbox.js';
import { flag, getSyncApi, useAppStore } from '../../store/useAppStore.js';
import { ymd } from '../../shared/dates.js';
import ArmedButton from '../ArmedButton.js';

// How syncing is going, and the changes the server would not take (build spec, Phase D6). Only shown when syncing through
// the API is switched on (feature-flags.md). Nothing here is shown by colour alone: every state is a sentence.
export default function SyncPanel() {
  const sync = useAppStore(s => s.sync);
  const dl = useAppStore(s => s.dl);
  const cfg = useAppStore(s => s.cfg);
  const api = getSyncApi();
  if (!sync || !api) return null;

  const nameOf = (id: string) => exInfo(cfg, id).n || id;
  const status = describeSync(sync);
  const warning = storageWarning(sync);
  const save = (filename: string, entries: readonly QuarantineEntry[]) => dl?.save({ filename, data: notSentFile(entries, nameOf, __APP_VERSION__) });

  const retry = async (id: string) => {
    const out = await api.retry(id);
    if (out === 'busy') flag('Newer changes for this are waiting. Try again after they are sent.');
    else if (out === 'refused') flag('The server would not take it this time either.');
  };

  return (
    <section className="panel syncpanel" aria-labelledby="sync-h">
      <h2 id="sync-h">Sync</h2>

      <div className={status.tone === 'wait' || status.tone === 'bad' ? 'notice' : undefined}>
        <p className="syncstatus"><b>{status.headline}</b>{status.detail ? ` ${status.detail}` : ''}</p>
      </div>
      {warning && <p className="notice" role="alert">{warning}</p>}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn" disabled={!status.canSyncNow} onClick={() => void api.resume()}>Sync now</button>
      </div>

      {sync.quarantine.length > 0 && (
        <div>
          <h3>Not sent ({sync.quarantine.length})</h3>
          <p>The server would not take these, so they were set aside. They are kept here until you discard them.</p>
          <ul className="notsent">
            {sync.quarantine.map(e => (
              <li key={e.id}>
                <b>{pathLabel(e.path, nameOf)}</b>
                <span className="note">{e.reason}</span>
                <span className="note">Set aside {formatWhen(e.at)}</span>
                <span className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn sm" aria-label={`Try again: ${pathLabel(e.path, nameOf)}`} onClick={() => void retry(e.id)}>Try again</button>
                  {dl && <button type="button" className="btn sm" aria-label={`Download: ${pathLabel(e.path, nameOf)}`} onClick={() => void save(`iron-log-not-sent-${ymd(new Date())}.json`, [e])}>Download</button>}
                  <ArmedButton className="btn sm danger" label="Discard" armedLabel="Tap again to discard" aria-label={`Discard: ${pathLabel(e.path, nameOf)}`} onConfirm={() => api.discard(e.id)} />
                </span>
              </li>
            ))}
          </ul>
          {dl && sync.quarantine.length > 1 && (
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn" onClick={() => void save(`iron-log-not-sent-${ymd(new Date())}.json`, sync.quarantine)}>Download all not-sent changes</button>
            </div>
          )}
        </div>
      )}

      {sync.notices.length > 0 && (
        <div>
          <h3>Notes ({sync.notices.length})</h3>
          <ul className="notsent">
            {sync.notices.map(n => <li key={n.id}>{n.text} <span className="note">{pathLabel(n.path, nameOf)}</span></li>)}
          </ul>
          <div className="actions" style={{ justifyContent: 'flex-start' }}><button type="button" className="btn sm" onClick={() => api.clearNotices()}>Clear</button></div>
        </div>
      )}

      <p className="note">App version {versionLabel(__APP_VERSION__)}</p>
    </section>
  );
}
