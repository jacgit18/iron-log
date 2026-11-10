import { useEffect, useRef, useState } from 'react';
import type { SupplementLabel } from '../../shared/dsldLabel.js';
import { scanSupplement, SUPPLEMENT_SCAN_TEXT } from '../../lib/scanPhoto.js';
import { currentSupplementAllowance, supplementCostText, supplementUsedUp } from '../../lib/supplementAllowance.js';
import { useAppStore } from '../../store/useAppStore.js';
import './ScanBottle.css';

// Scan the bottle's label (brief supplement-label-scan): one photo of the Supplement Facts panel, read by the AI service, handed to the caller as a SupplementLabel to preview. It saves
// nothing and keeps no photo. The button, the allowance line and the failure lines live here so neither sheet grows. Needs sync (signed in); a scan that ends after the sheet closed changes nothing.
export default function ScanBottle({ label, onRead }: { label: string; onRead: (label: SupplementLabel) => void }) {
  const syncing = useAppStore(x => x.sync !== null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const allowance = currentSupplementAllowance();
  const usedUp = supplementUsedUp(allowance);
  const scan = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setNote('');
    const r = await scanSupplement(file);
    if (!mounted.current) return;
    setBusy(false);
    if (!r.ok) { setNote(SUPPLEMENT_SCAN_TEXT[r.reason]); return; }
    if (r.result.kind !== 'ok') { setNote(SUPPLEMENT_SCAN_TEXT.unreadable); return; }
    onRead(r.result.label);
  };
  return (
    <div className="scanbottle">
      {/* `capture` opens the camera on a phone; on a desktop it is ignored and the file picker opens. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Bottle camera" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className="btn sm" disabled={busy || usedUp || !syncing} onClick={() => camera.current?.click()}>{busy ? 'Reading the bottle...' : label}</button>
      <p className="note" role="status">{!syncing ? 'Not available on this device: sign in to scan. You can still type the amounts.' : usedUp ? SUPPLEMENT_SCAN_TEXT.cap : note || supplementCostText(allowance)}</p>
    </div>
  );
}
