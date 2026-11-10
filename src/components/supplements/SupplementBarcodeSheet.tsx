import { useEffect, useRef, useState } from 'react';
import { useBarcodeCamera } from '../../hooks/useBarcodeCamera.js';
import { lookupSupplementBarcode } from '../../lib/supplementBarcodeClient.js';
import { suppBarcodeText, type SuppBarcodeFailure } from '../../lib/supplementBarcodeQuery.js';
import type { ProductName } from '../../shared/barcode.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './SupplementBarcodeSheet.css';

// Scan a supplement's barcode (brief supplement-barcode-search): a live camera view; each quarter second the browser's reader looks at the frame and the first valid product code is asked of
// /api/supplement-barcode, which answers the product's name and brand. They go back to the supplement add sheet as a search (`onFound`); the person picks the listing there. Close returns to the add
// sheet as it was (`onBack`). A miss or failure stops the scanning so the same code is not asked again; "Scan again" restarts it. No camera or reader: a photo of the barcode is read instead.
// The stream is stopped when the sheet closes; nothing is stored.
export default function SupplementBarcodeSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const onFound = modal?.onFound as ((p: ProductName) => void) | undefined;
  const onBack = modal?.onBack as (() => void) | undefined;
  const photo = useRef<HTMLInputElement>(null);
  const busy = useRef(false); // one lookup at a time
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [scanning, setScanning] = useState(true);
  const [looking, setLooking] = useState(false);
  const [fail, setFail] = useState<SuppBarcodeFailure | null>(null);

  const finish = async (gtin: string) => {
    if (busy.current) return;
    busy.current = true; setLooking(true); setFail(null);
    const r = await lookupSupplementBarcode(gtin);
    if (!mounted.current) return;
    if (r.ok) { onFound?.(r.product); closeModal(); return; }
    busy.current = false; setLooking(false); setScanning(false); setFail(r.reason);
  };
  const cam = useBarcodeCamera(gtin => { void finish(gtin); }, scanning && !looking);
  const shownFail = fail ?? cam.error;
  const again = () => { setFail(null); cam.clearError(); setScanning(true); };
  const fromPhoto = async (file: File | undefined) => {
    if (!file || busy.current) return;
    setFail(null);
    await cam.fromPhoto(file);
  };
  const close = () => { if (onBack) { closeModal(); onBack(); } else closeModal(); };
  const text = looking ? 'Looking up the product...' : shownFail ? suppBarcodeText(shownFail) : cam.camera === 'starting' ? 'Starting the camera...' : cam.camera === 'live' ? 'Point the camera at the barcode on the bottle.' : '';
  return (
    <Sheet className="sbsheet">
      <h2 className="cond">Scan barcode</h2>
      <video ref={cam.video} className={cam.camera === 'live' ? 'sbview' : 'sbview off'} playsInline muted aria-label="Camera view" />
      <p className="note" role="status">{text}</p>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label="Barcode photo" onChange={e => { void fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="actions">
        {!scanning && cam.camera === 'live' && !looking && <button type="button" className="btn" id="sb-again" onClick={again}>Scan again</button>}
        {shownFail !== 'nodetector' && <button type="button" className="btn" id="sb-photo" disabled={looking} onClick={() => photo.current?.click()}>Photo instead</button>}
        <button type="button" className="btn primary" id="sb-close" onClick={close}>Close</button>
      </div>
    </Sheet>
  );
}
