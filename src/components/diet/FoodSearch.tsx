import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import type { Micro } from '../../shared/foodMicro.js';
import { cleanGrams, defaultGrams, hitLabel, scaleFood, type FoodHit } from '../../shared/foods.js';
import { useFoodHits } from './useFoodHits.js';
import { AI_LABEL_TEXT, OFF_SOURCE_TEXT } from '../../lib/barcodeScan.js';
import { labelFood } from '../../lib/labelFill.js';
import { SCAN_TEXT, scanLabel } from '../../lib/scanPhoto.js';
import { DEFAULT_FOOD_SORT, FOOD_SORTS, sortFoodHits } from '../../lib/foodSort.js';
import { macroLine } from '../../lib/macroLine.js';
import { useSortChoice } from '../useSortChoice.js';
import SortControl from '../SortControl.jsx';
import './Diet.css';

/** What a pick fills into the entry form. */
export interface FoodFill { n: string; kcal: number; p: number; c?: number; f?: number; micro?: Micro; /** The amounts were read from a label photo (the One-off form says so and offers Remove). */ fromPhoto?: true }

// "Look up nutrition" (brief diet-food-lookup): type a few letters, pick a result from USDA FoodData Central, set the grams, and the entry form is filled in (still editable).
// One request at a time: a newer search cancels the older, and a late answer for old words is dropped. Nothing is stored here.
// A scan miss can offer the AI label photo (brief barcode-miss-ladder): where the caller has no label camera of its own (`onLabelPhoto`, the Ready-made form's) this opens one,
// reads the photo and shows the numbers marked "AI", with the check line, before Use.
// With `text` given, the words come from another box (the "Search your past meals and recipes" box) and this shows only the results and the grams step.
export interface ScanResume { hit?: FoodHit; label?: boolean }
// `reopen` is for a caller whose own sheet the barcode sheet replaces (the nutrition board's add sheet): the scan hands its result back through it, and the caller shows this box again with `resume` set (a found product picked, or a Photo the label button ready).
export default function FoodSearch({ onUse, text: given, onLabelPhoto, scanFirst, reopen, resume }: { onUse: (fill: FoodFill) => void; text?: string; onLabelPhoto?: () => void; scanFirst?: boolean; reopen?: (r: ScanResume) => void; resume?: ScanResume }) {
  const [own, setText] = useState('');
  const text = given ?? own;
  const { hits, note } = useFoodHits(text);
  const [sort, setSort] = useSortChoice('foods', FOOD_SORTS, DEFAULT_FOOD_SORT);
  const shown = sortFoodHits(hits, sort); // the page already fetched, reordered here only
  const [pick, setPick] = useState<FoodHit | null>(resume?.hit ?? null);
  const [grams, setGrams] = useState(() => (resume?.hit ? String(defaultGrams(resume.hit)) : '100'));
  const [ai, setAi] = useState<{ fill: FoodFill; name: string } | null>(null); // a label read from a photo, waiting for Use
  const [aiNote, setAiNote] = useState('');
  const [reading, setReading] = useState(false);
  const labelCamera = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const firstGiven = useRef(true);
  useEffect(() => { if (firstGiven.current) { firstGiven.current = false; return; } if (given !== undefined) { setPick(null); setAi(null); setAiNote(''); } }, [given]); // new words in the other box drop a pick or a label read made for the old ones

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
    const fill = labelFood(l);
    setAi({ name: fill.n, fill });
  };
  const useAi = () => { if (!ai) return; onUse(ai.fill); setAi(null); setText(''); };

  // Scan barcode (brief barcode-scan): another way to ask the same source, by a product code instead of a name. A found product is picked like a typed result.
  const openLabel = onLabelPhoto ?? (() => labelCamera.current?.click());
  const later = (r: ScanResume) => setTimeout(() => reopen?.(r), 0); // after the barcode sheet has closed itself
  const scan = () => useAppStore.getState().openModal(reopen
    ? { type: 'barcode', onFound: (h: FoodHit) => later({ hit: h }), onLabel: () => later({ label: true }), onType: () => later({}) }
    : { type: 'barcode', onFound: (h: FoodHit) => choose(h), onLabel: openLabel });

  const scanned = useRef(false);
  useEffect(() => { if (scanFirst && !scanned.current) { scanned.current = true; scan(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival: Recipes + New, Scan to fill a food form opens the barcode sheet over this form

  return (
    <div className="dt-lookup">
      <button type="button" className="btn sm" id="dt-scan-barcode" onClick={scan}>Scan to fill form</button>
      {resume?.label && <button type="button" className="btn sm" id="dt-label-photo" onClick={() => labelCamera.current?.click()}>Photo the label</button>}
      {given === undefined && (
        <label className="field" htmlFor="dt-lookup-q">Look up nutrition
          <input id="dt-lookup-q" type="search" autoComplete="off" maxLength={60} value={own} onChange={e => { setText(e.target.value); setPick(null); }} />
        </label>
      )}
      {!onLabelPhoto && <input ref={labelCamera} type="file" accept="image/*" capture="environment" hidden aria-label="Label camera" onChange={e => { void readPhoto(e.target.files?.[0]); e.target.value = ''; }} />}
      {reading && <p className="note" role="status">Reading label...</p>}
      {aiNote && <p className="note" role="status">{aiNote}</p>}
      {ai && (
        <div className="dt-lookuppick">
          <p>{ai.name} <span className="dt-aimark">AI</span></p>
          <p className="note">{`${macroLine(ai.fill)} per serving`}</p>
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
          <p className="note" role="status">{scaled ? macroLine(scaled) : 'Enter grams from 1 to 5000.'}</p>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => setPick(null)}>Back</button>
            <button type="button" className="btn sm primary" disabled={!scaled} onClick={use}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}
