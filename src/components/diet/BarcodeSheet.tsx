import { useEffect, useRef, useState } from 'react';
import { barcodeText, makeReader, readGtin, type BarcodeFailure, type Reader } from '../../lib/barcodeScan.js';
import { lookupBarcode } from '../../lib/foodsClient.js';
import type { FoodHit } from '../../shared/foods.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './BarcodeSheet.css';

const POLL_MS = 250;

// Scan barcode (brief barcode-scan): admin only. A live camera view; each quarter second the browser's reader looks at the frame, and the first valid product code is
// looked up (GET /api/foods/barcode) and handed back to the food search box as a pick. Scanning stops on a failure so the same code is not asked again and again; "Scan
// again" starts it. No camera (or refused): a photo of the barcode is read instead. The camera stream is stopped when the sheet closes; nothing is stored.
export default function BarcodeSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const onFound = modal?.onFound as ((hit: FoodHit) => void) | undefined;
  const onLabel = modal?.onLabel as (() => void) | undefined; // set where a label camera exists (the Ready-made form)
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const reader = useRef<Reader | null>(null);
  const busy = useRef(false); // one lookup at a time
  const reading = useRef(false); // one frame being read at a time
  const alive = useRef(true);
  const [camera, setCamera] = useState<'starting' | 'live' | 'none'>('starting');
  const [scanning, setScanning] = useState(true);
  const [looking, setLooking] = useState(false);
  const [fail, setFail] = useState<BarcodeFailure | null>(null);

  const finish = async (gtin: string) => {
    if (busy.current) return;
    busy.current = true; setLooking(true); setFail(null);
    const r = await lookupBarcode(gtin);
    if (!alive.current) return;
    if (r.ok) { onFound?.(r.hit); closeModal(); return; }
    busy.current = false; setLooking(false); setScanning(false); setFail(r.reason);
  };

  // The reader and the camera, once. Both are released when the sheet closes.
  useEffect(() => {
    alive.current = true;
    let stream: MediaStream | null = null;
    void (async () => {
      reader.current = await makeReader();
      if (!alive.current) return;
      if (!reader.current) { setCamera('none'); setScanning(false); setFail('nodetector'); return; }
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!alive.current) { stream.getTracks().forEach(t => t.stop()); return; }
        const el = video.current;
        if (el) { el.srcObject = stream; await el.play(); }
        if (alive.current) setCamera('live');
      } catch {
        if (alive.current) { setCamera('none'); setScanning(false); setFail('camera'); }
      }
    })();
    return () => { alive.current = false; stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  // While the view is live and scanning, look at a frame every quarter second.
  useEffect(() => {
    if (camera !== 'live' || !scanning) return;
    const timer = setInterval(() => {
      const el = video.current, rd = reader.current;
      if (busy.current || reading.current || !el || !rd || el.readyState < 2) return;
      reading.current = true; // a slow frame is not stacked under the next tick
      void readGtin(rd, el).then(gtin => { reading.current = false; if (gtin && alive.current) void finish(gtin); });
    }, POLL_MS);
    return () => clearInterval(timer);
    // `finish` only reads refs and stable setters, so it is not a dependency.
  }, [camera, scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromPhoto = async (file: File | undefined) => {
    const rd = reader.current;
    if (!file || !rd || busy.current) return;
    setFail(null);
    let gtin: string | null = null;
    try { gtin = await readGtin(rd, await createImageBitmap(file)); } catch { gtin = null; }
    if (!alive.current) return;
    if (!gtin) { setFail('unreadable'); return; }
    void finish(gtin);
  };

  const text = looking ? 'Looking up...' : fail ? barcodeText(fail, !!onLabel) : camera === 'starting' ? 'Starting the camera...' : camera === 'live' ? 'Point the camera at the barcode.' : '';
  return (
    <Sheet className="bcsheet">
      <h2 className="cond">Scan barcode</h2>
      <video ref={video} className={camera === 'live' ? 'bcview' : 'bcview off'} playsInline muted aria-label="Camera view" />
      <p className="note" role="status">{text}</p>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden aria-label="Barcode photo" onChange={e => { void fromPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="actions">
        {!scanning && camera === 'live' && !looking && <button type="button" className="btn" id="bc-again" onClick={() => { setFail(null); setScanning(true); }}>Scan again</button>}
        {fail !== 'nodetector' && <button type="button" className="btn" id="bc-photo" disabled={looking} onClick={() => photo.current?.click()}>Photo instead</button>}
        {fail === 'notfound' && onLabel && !looking && <button type="button" className="btn" id="bc-label" onClick={() => { closeModal(); onLabel(); }}>Photo the label</button>}
        <button type="button" className="btn primary" id="bc-close" onClick={closeModal}>Close</button>
      </div>
    </Sheet>
  );
}
