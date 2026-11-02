import { exInfo } from '../../lib/data.js';
import { readLegacyMarker } from '../../sync/legacyMarker.js';
import { describeSync, formatWhen, notSentFile, pathLabel, storageWarning, versionLabel } from '../../sync/labels.js';
import type { QuarantineEntry } from '../../sync/outbox.js';
import { flag, getSyncApi, useAppStore } from '../../store/useAppStore.js';
import { ymd } from '../../shared/dates.js';
import { useState } from 'react';
import ArmedButton from '../ArmedButton.js';

// What screen readers hear: only a settled state, and only when it changes. "Syncing…" and "Loading…" pass every minute while the app
// is open, so announcing them would talk over everything; Synced → Offline → Synced is what matters.
function useSettledHeadline(status: { headline: string; tone: string } | null) {
  const [said, setSaid] = useState('');
  const settled = status && status.tone !== 'busy' ? status.headline : null;
  if (settled && settled !== said) setSaid(settled); // React's "adjust state while rendering": no extra effect pass
  return said;
}

// How syncing is going, and the changes the server would not take (build spec, Phase D6). It is the top of the Sync, backups & data
// panel (DataPanel in Settings.tsx), not a panel of its own. Only shown when syncing through the API is switched on
// (feature-flags.md). Nothing here is shown by colour alone: every state is a sentence.
export default function SyncSection() {
  const sync = useAppStore(s => s.sync);
  const dl = useAppStore(s => s.dl);
  const cfg = useAppStore(s => s.cfg);
  const api = getSyncApi();
  const said = useSettledHeadline(sync ? describeSync(sync) : null);
  if (!sync || !api) return null;
  const uploaded = readLegacyMarker();

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
    <div className="syncpanel syncblock">
      <div className={status.tone === 'wait' || status.tone === 'bad' ? 'notice' : undefined}>
        <p className="syncstatus"><b>{status.headline}</b>{status.detail ? ` ${status.detail}` : ''}</p>
      </div>
      <p className="sr" role="status">{said ? `Sync: ${said}` : ''}</p>
      {warning && <p className="notice" role="alert">{warning}</p>}
      <div className="actions">
        <button type="button" className="btn" disabled={!status.canSyncNow} onClick={() => void api.resume()}>Sync now</button>
      </div>

      {sync.quarantine.length > 0 && (
        <div>
          <h4>Not sent ({sync.quarantine.length})</h4>
          <p>The server would not take these, so they were set aside. They are kept here until you discard them.</p>
          <ul className="notsent">
            {sync.quarantine.map(e => (
              <li key={e.id}>
                <b>{pathLabel(e.path, nameOf)}</b>
                <span className="note">{e.reason}</span>
                <span className="note">Set aside {formatWhen(e.at)}</span>
                <span className="actions">
                  <button type="button" className="btn sm" aria-label={`Try again: ${pathLabel(e.path, nameOf)}`} onClick={() => void retry(e.id)}>Try again</button>
                  {dl && <button type="button" className="btn sm" aria-label={`Download: ${pathLabel(e.path, nameOf)}`} onClick={() => void save(`iron-log-not-sent-${ymd(new Date())}.json`, [e])}>Download</button>}
                  <ArmedButton className="btn sm danger" label="Discard" armedLabel="Tap again to discard" aria-label={`Discard: ${pathLabel(e.path, nameOf)}`} onConfirm={() => api.discard(e.id)} />
                </span>
              </li>
            ))}
          </ul>
          {dl && sync.quarantine.length > 1 && (
            <div className="actions">
              <button type="button" className="btn" onClick={() => void save(`iron-log-not-sent-${ymd(new Date())}.json`, sync.quarantine)}>Download all not-sent changes</button>
            </div>
          )}
        </div>
      )}

      {sync.notices.length > 0 && (
        <div>
          <h4>Notes ({sync.notices.length})</h4>
          <ul className="notsent">
            {sync.notices.map(n => <li key={n.id}>{n.text} <span className="note">{pathLabel(n.path, nameOf)}</span></li>)}
          </ul>
          <div className="actions"><button type="button" className="btn sm" onClick={() => api.clearNotices()}>Clear</button></div>
        </div>
      )}

      {uploaded?.state === 'uploaded' && <p className="note">Data from before accounts was uploaded on {formatWhen(uploaded.at)} ({uploaded.total} items). The old copy is still on this device.</p>}
    </div>
  );
}

/** The app version, at the foot of the panel; like the sync status it is only shown when syncing is on. */
export function SyncVersion() {
  const sync = useAppStore(s => s.sync);
  if (!sync || !getSyncApi()) return null;
  return <p className="note">App version {versionLabel(__APP_VERSION__)}</p>;
}
