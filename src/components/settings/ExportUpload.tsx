import { useRef, useState } from 'react';
import { parseDataFile } from '../../lib/export.js';
import { dataFileDocs, describeLegacy, planLegacy, type LegacyPlan } from '../../sync/legacy.js';
import { writeLegacyMarker } from '../../sync/legacyMarker.js';
import { importFailure } from '../../sync/labels.js';
import { flag, getSyncApi, useAppStore } from '../../store/useAppStore.js';

// Phase E, from a file: the same all-or-nothing upload as the card, but the data comes from an Iron Log export instead of this
// browser's own storage. This is the way from the old address (the GitHub Pages copy) to a new one, whose browser holds nothing.
export default function ExportUpload() {
  const sync = useAppStore(s => s.sync);
  const api = getSyncApi();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ name: string; exportedAt: string | null; plan: LegacyPlan } | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  if (!api || !sync) return null;

  const choose = async (file: File | undefined) => {
    setProblem('');
    setPicked(null);
    if (!file) return;
    try {
      const data = parseDataFile(await file.text());
      const plan = planLegacy(dataFileDocs(data));
      if (!plan.commands.length) { setProblem('That file holds nothing to upload.'); return; }
      setPicked({ name: file.name, exportedAt: data.exportedAt ?? null, plan });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That file could not be read.');
    }
  };

  const upload = async () => {
    if (!picked) return;
    setBusy(true);
    setProblem('');
    const out = await api.importLegacy(picked.plan.commands);
    setBusy(false);
    if (!out.ok) { setProblem(importFailure(out)); return; }
    writeLegacyMarker({ state: 'uploaded', at: new Date().toISOString(), total: out.total });
    flag(`Uploaded ${describeLegacy(picked.plan.summary)}.`);
    setPicked(null);
  };

  return (
    <div>
      <h3>Upload from an export file</h3>
      {sync.holdsData
        ? <p className="note">Your account already has data, so a file cannot be uploaded this way. Use Export &amp; import to merge a file into it.</p>
        : (
          <>
            <p>Moving from another copy of Iron Log? Choose its export file (Settings → Export &amp; import → Download data there). It is added to your account once, all or nothing, and only while the account is empty. Do this before logging anything here.</p>
            <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Iron Log export file" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>Choose export file…</button>
            </div>
            {picked && (
              <div className="notice" role="status">
                <p><b>{picked.name}</b>{picked.exportedAt ? ` (exported ${picked.exportedAt.slice(0, 10)})` : ''} holds {describeLegacy(picked.plan.summary)}.
                  {picked.plan.renamed > 0 && ` ${picked.plan.renamed} entries that looked identical keep separate ids.`}
                  {picked.plan.skipped > 0 && ` ${picked.plan.skipped} check-offs are left out because a logged session already covers them.`}</p>
                <div className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn primary" disabled={busy} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Upload to my account'}</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => setPicked(null)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      {problem && <p className="notice" role="alert"><b>{problem}</b></p>}
    </div>
  );
}
