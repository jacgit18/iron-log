import { useCallback, useEffect, useRef, useState } from 'react';
import { makeReader, readGtin, type Reader } from '../lib/barcodeScan.js';

const POLL_MS = 250;

export type CameraState = 'starting' | 'live' | 'none';
export type CameraError = 'nodetector' | 'camera' | 'unreadable';

/**
 * The camera and the browser's barcode reader, shared by the food scan and the supplement scan (briefs barcode-scan, supplement-barcode-search): starts the back camera once, looks at a frame
 * every quarter second while `active`, hands the first valid product code to `onCode`, and reads a photo of a barcode when there is no live view. The stream is stopped when the sheet closes;
 * nothing is stored. `error` is only what the camera and reader can say; a failed lookup is the caller's.
 */
export function useBarcodeCamera(onCode: (gtin: string) => void, active: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const reader = useRef<Reader | null>(null);
  const reading = useRef(false); // one frame being read at a time
  const alive = useRef(true);
  const code = useRef(onCode);
  useEffect(() => { code.current = onCode; });
  const [camera, setCamera] = useState<CameraState>('starting');
  const [error, setError] = useState<CameraError | null>(null);

  // The reader and the camera, once. Both are released when the sheet closes.
  useEffect(() => {
    alive.current = true;
    let stream: MediaStream | null = null;
    void (async () => {
      reader.current = await makeReader();
      if (!alive.current) return;
      if (!reader.current) { setCamera('none'); setError('nodetector'); return; }
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!alive.current) { stream.getTracks().forEach(t => t.stop()); return; }
        const el = video.current;
        if (el) { el.srcObject = stream; await el.play(); }
        if (alive.current) setCamera('live');
      } catch {
        if (alive.current) { setCamera('none'); setError('camera'); }
      }
    })();
    return () => { alive.current = false; stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  // While the view is live and active, look at a frame every quarter second.
  useEffect(() => {
    if (camera !== 'live' || !active) return;
    const timer = setInterval(() => {
      const el = video.current, rd = reader.current;
      if (reading.current || !el || !rd || el.readyState < 2) return;
      reading.current = true; // a slow frame is not stacked under the next tick
      void readGtin(rd, el).then(gtin => { reading.current = false; if (gtin && alive.current) code.current(gtin); });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [camera, active]);

  /** Reads a photo of a barcode; no code in it is the 'unreadable' error. */
  const fromPhoto = useCallback(async (file: File | undefined) => {
    const rd = reader.current;
    if (!file || !rd) return;
    setError(null);
    let gtin: string | null = null;
    try { gtin = await readGtin(rd, await createImageBitmap(file)); } catch { gtin = null; }
    if (!alive.current) return;
    if (!gtin) { setError('unreadable'); return; }
    code.current(gtin);
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { video, camera, error, fromPhoto, clearError };
}
