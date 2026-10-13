import { canShareFiles } from '../../lib/share.js';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { ExportKind } from '../../store/types.ts';

// "Share" beside an export button: sends the same file the download makes to the phone's share sheet (Files, Drive, Mail, AirDrop...).
// Only where the browser can share files, and only for admins until released (features.ts).
export default function ShareExport({ kind, label }: { kind: Exclude<ExportKind, 'csv'>; label: string }) {
  const on = useFeature('shareExport');
  const dl = useAppStore(s => s.dl); const exporting = useAppStore(s => s.exporting);
  const ready = useAppStore(s => s.shareReady);
  if (!on || !dl || !canShareFiles()) return null;
  const st = useAppStore.getState();
  // The first tap's permission ran out while the file was built: this second tap shares the finished file at once.
  if (ready && ready.kind === kind) return <button type="button" className="btn primary" onClick={() => void st.shareAgain()}>Share {ready.file.name}</button>;
  return <button type="button" className="btn" disabled={!!exporting} onClick={() => void st.shareExport(kind)}>{exporting === kind ? 'Preparing…' : label}</button>;
}
