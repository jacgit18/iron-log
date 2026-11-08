import { useEffect, useRef, useState } from 'react';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import { cleanGrams, defaultGrams, hitLabel, scaleFood, type FoodHit } from '../../shared/foods.js';
import { useFoodHits } from './useFoodHits.js';
import { AI_LABEL_TEXT, OFF_SOURCE_TEXT } from '../../lib/barcodeScan.js';
import { SCAN_TEXT, scanLabel } from '../../lib/scanPhoto.js';
import { DEFAULT_FOOD_SORT, FOOD_SORTS, sortFoodHits } from '../../lib/foodSort.js';
import { useSortChoice } from '../useSortChoice.js';
import SortControl from '../SortControl.jsx';
import './Diet.css';

/** What a pick fills into the entry form. */
export interface FoodFill { n: string; kcal: number; p: number; c?: number; f?: number }

// "Look up nutrition" (brief diet-food-lookup): type a few letters, pick a result from USDA FoodData Central, set the grams, and the entry form is filled in (still editable).
// One request at a time: a newer search cancels the older, and a late answer for old words is dropped. Nothing is stored here.
// A scan miss can offer the AI label photo (brief barcode-miss-ladder): where the caller has no label camera of its own (`onLabelPhoto`, the Ready-made form's) this opens one,
// reads the photo and shows the numbers marked "AI", with the check line, before Use.
// With `text` given, the words come from another box (the "Search your past meals and recipes" box) and this shows only the results and the grams step.
export default function FoodSearch({ onUse, text: given, onLabelPhoto, scanFirst }: { onUse: (fill: FoodFill) => void; text?: string; onLabelPhoto?: () => void; scanFirst?: boolean }) {
  const [own, setText] = useState('');
  const text = given ?? own;
  const { hits, note } = useFoodHits(text);
  const [sort, setSort] = useSortChoice('foods', FOOD_SORTS, DEFAULT_FOOD_SORT);
  const shown = sortFoodHits(hits, sort); // the page already fetched, reordered here only
  const [pick, setPick] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState('100');
  const [ai, setAi] = useState<{ fill: FoodFill; name: string } | null>(null); // a label read from a photo, waiting for Use
  const [aiNote, setAiNote] = useState('');
  const [reading, setReading] = useState(false);
  const labelCamera = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (given !== undefined) { setPick(null); setAi(null); setAiNote(''); } }, [given]); // new words in the other box drop a pick or a label read made for the old ones

  const g = cleanGrams(grams);
  const scaled = pick && g !== null ? scaleFood(pick, g) : null;
  const choose = (h: FoodHit) => { setPick(h); setGrams(String(defaultGrams(h))); };
  const use = () => {
    if (!pick || !scaled) return;
    onUse({ n: pick.name.slice(0, 80), ...scaled });
    setPick(null); setText('');
  };

  const readPhoto = async (file: File | undefined) => {
    if (!file || reading) return;
    setReading(true); setAiNote(''); setAi(null); setPick(null);
    const r = await scanLabel(file);
    if (!mounted.current) return;
    setReading(false);
    if (!r.ok) { setAiNote(SCAN_TEXT[r.reason]); return; }
    if (r.result.kind === 'unreadable') { setAiNote(SCAN_TEXT.unreadable); return; }
    if (r.result.kind === 'per100g') { setAiNote(SCAN_TEXT.per100g); return; }
    const l = r.result.label;
    const name = l.name || 'Food from a label';
    setAi({ name, fill: { n: name.slice(0, 80), kcal: l.kcal, p: l.p, ...(l.c !== undefined ? { c: l.c } : {}), ...(l.f !== undefined ? { f: l.f } : {}) } });
  };
  const useAi = () => { if (!ai) return; onUse(ai.fill); setAi(null); setText(''); };

  // Scan barcode (brief barcode-scan): another way to ask the same source, by a product code instead of a name. A found product is picked like a typed result.
  const labelOn = useFeature('scan');
  const openLabel = onLabelPhoto ?? (() => labelCamera.current?.click());
  const scan = () => useAppStore.getState().openModal({ type: 'barcode', onFound: (h: FoodHit) => choose(h), ...(onLabelPhoto || labelOn ? { onLabel: openLabel } : {}) });

  const scanned = useRef(false);
  useEffect(() => { if (scanFirst && !scanned.current) { scanned.current = true; scan(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival: Recipes + New, Scan a food opens the barcode sheet over this form

  return (
    <div className="dt-lookup">
      <button type="button" className="btn sm" id="dt-scan-barcode" onClick={scan}>Scan barcode</button>
      {given === undefined && (
        <label className="field" htmlFor="dt-lookup-q">Look up nutrition
          <input id="dt-lookup-q" type="search" autoComplete="off" maxLength={60} value={own} onChange={e => { setText(e.target.value); setPick(null); }} />
        </label>
      )}
      {!onLabelPhoto && labelOn && <input ref={labelCamera} type="file" accept="image/*" capture="environment" hidden aria-label="Label camera" onChange={e => { void readPhoto(e.target.files?.[0]); e.target.value = ''; }} />}
      {reading && <p className="note" role="status">Reading label...</p>}
      {aiNote && <p className="note" role="status">{aiNote}</p>}
      {ai && (
        <div className="dt-lookuppick">
          <p>{ai.name} <span className="dt-aimark">AI</span></p>
          <p className="note">{`${ai.fill.kcal} kcal · ${ai.fill.p} g protein per serving`}</p>
          <p className="note" role="status">{AI_LABEL_TEXT}</p>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => setAi(null)}>Back</button>
            <button type="button" className="btn sm primary" onClick={useAi}>Use</button>
          </div>
        </div>
      )}
      {note && <p className="note" role="status">{note}</p>}
      {hits.length > 1 && !pick && (
        <div className="dt-sortrow">
          <SortControl options={FOOD_SORTS} value={sort} onChange={setSort} />
          <p className="note">Sorts these {hits.length} results only, not the whole food database.</p>
        </div>
      )}
      {hits.length > 0 && !pick && (
        <ul className="dt-recents" aria-label={given === undefined ? 'Lookup results' : 'Food database results'}>
          {shown.map(h => <li key={h.id}><button type="button" className="btn sm" onClick={() => choose(h)}>{hitLabel(h)}</button></li>)}
        </ul>
      )}
      {pick && (
        <div className="dt-lookuppick">
          <p>{hitLabel(pick)}</p>
          {pick.source === 'off' && <p className="note">{OFF_SOURCE_TEXT}</p>}
          <label className="field" htmlFor={given === undefined ? 'dt-lookup-g' : 'dt-find-g'}>Grams
            <input id={given === undefined ? 'dt-lookup-g' : 'dt-find-g'} type="number" inputMode="decimal" min="1" max="5000" step="any" value={grams} onChange={e => setGrams(e.target.value)} />
          </label>
          <p className="note" role="status">{scaled ? `${scaled.kcal} kcal · ${scaled.p} g protein` : 'Enter grams from 1 to 5000.'}</p>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => setPick(null)}>Back</button>
            <button type="button" className="btn sm primary" disabled={!scaled} onClick={use}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}
