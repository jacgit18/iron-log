import { useEffect, useRef, useState } from 'react';
import { useBarcodeCamera } from '../../hooks/useBarcodeCamera.js';
import { barcodeText, lookingText, OFF_AFTER_MS, MISS_STEPS, SEARCH_BOX_IDS, type BarcodeFailure } from '../../lib/barcodeScan.js';
import { currentAllowance, LABEL_USED_UP_TEXT, labelCostText, labelUsedUp } from '../../lib/labelAllowance.js';
import { lookupBarcode } from '../../lib/foodsClient.js';
import type { FoodHit } from '../../shared/foods.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './BarcodeSheet.css';

// Scan barcode (brief barcode-scan): for everyone signed in (no AI). A live camera view; each quarter second the browser's reader looks at the frame, and the first valid product code is
// looked up (GET /api/foods/barcode) and handed back to the food search box as a pick. A miss (brief barcode-miss-ladder) shows what was tried, makes typing the name
// the free main choice and offers the AI label photo second, with its cost, only when the person taps it. Scanning stops on a failure so the same code is not asked again and again; "Scan
// again" starts it. No camera (or refused): a photo of the barcode is read instead. The camera stream is stopped when the sheet closes; nothing is stored.
export default function BarcodeSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const onFound = modal?.onFound as ((hit: FoodHit) => void) | undefined;
  const onLabel = modal?.onLabel as (() => void) | undefined; // set where a label camera exists (the food search box, with the label scan on)
  const photo = useRef<HTMLInputElement>(null);
  const busy = useRef(false); // one lookup at a time
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [scanning, setScanning] = useState(true);
  const [looking, setLooking] = useState(false);
  const [fail, setFail] = useState<BarcodeFailure | null>(null);
  const [waited, setWaited] = useState(0);

  const finish = async (gtin: string) => {
    if (busy.current) return;
    busy.current = true; setLooking(true); setFail(null);
    const r = await lookupBarcode(gtin);
    if (!mounted.current) return;
    if (r.ok) { onFound?.(r.hit); closeModal(); return; }
    busy.current = false; setLooking(false); setScanning(false); setFail(r.reason);
  };
  // The camera and reader (src/hooks/useBarcodeCamera.ts); a camera or reader failure stops the scanning like a failed lookup does.
  const cam = useBarcodeCamera(gtin => { void finish(gtin); }, scanning && !looking);
  const { camera } = cam;
  const shownFail = fail ?? cam.error;
  const again = () => { setFail(null); cam.clearError(); setScanning(true); };
  const fromPhoto = async (file: File | undefined) => {
    if (!file || busy.current) return;
    setFail(null);
    await cam.fromPhoto(file);
  };

  // While looking, the line moves from USDA to Open Food Facts after a short wait.
  useEffect(() => {
    if (!looking) { setWaited(0); return; }
    const t = setTimeout(() => setWaited(OFF_AFTER_MS), OFF_AFTER_MS);
    return () => clearTimeout(t);
  }, [looking]);

  const onType = modal?.onType as (() => void) | undefined; // set by a caller that shows its own search box again (the nutrition board's add sheet)
  const typeName = () => { closeModal(); if (onType) { onType(); return; } setTimeout(() => document.getElementById(SEARCH_BOX_IDS.find(id => document.getElementById(id)) ?? '')?.focus(), 0); };
  const miss = shownFail === 'notfound' && !looking;
  const allowance = currentAllowance();
  const usedUp = labelUsedUp(allowance);
  const text = looking ? lookingText(waited) : shownFail ? barcodeText(shownFail) : camera === 'starting' ? 'Starting the camera...' : camera === 'live' ? 'Point the camera at the barcode.' : '';
  return (
    <Sheet className="bcsheet">
      <h2 className="cond">Scan barcode</h2>
      <video ref={cam.video} className={camera === 'live' ? 'bcview' : 'bcview off'} playsInline muted aria-label="Camera view" />
      <p className="note" role="status">{text}</p>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label="Barcode photo" onChange={e => { void fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      {miss && <ul className="bcsteps" aria-label="Tried">{MISS_STEPS.map(s => <li key={s}>{s}</li>)}</ul>}
      {miss ? (
        <div className="actions bcmiss">
          <button type="button" className="btn primary" id="bc-type" onClick={typeName}>Type the name</button>
          {onLabel && (
            <div className="bclabel">
              <button type="button" className="btn" id="bc-label" disabled={usedUp} onClick={() => { closeModal(); onLabel(); }}>Photo the label</button>
              <p className="note">{usedUp ? LABEL_USED_UP_TEXT : labelCostText(allowance)}</p>
            </div>
          )}
          <div className="bclinks">
            {camera === 'live' && <button type="button" className="btn ghost" id="bc-again" onClick={again}>Scan again</button>}
            <button type="button" className="btn ghost" id="bc-photo" onClick={() => photo.current?.click()}>Photo of the barcode</button>
            <button type="button" className="btn ghost" id="bc-close" onClick={closeModal}>Close</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {!scanning && camera === 'live' && !looking && <button type="button" className="btn" id="bc-again" onClick={again}>Scan again</button>}
          {shownFail !== 'nodetector' && <button type="button" className="btn" id="bc-photo" disabled={looking} onClick={() => photo.current?.click()}>Photo instead</button>}
          <button type="button" className="btn primary" id="bc-close" onClick={closeModal}>Close</button>
        </div>
      )}
    </Sheet>
  );
}
