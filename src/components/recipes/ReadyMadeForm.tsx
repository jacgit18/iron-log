import { useEffect, useRef, useState } from 'react';
import './FoodTypeReview.css';
import './ReadyMadeScan.css';
import './RecipeDesktop.css';
import './RecipeFormSections.css';
import { liveRows, microOfRows, rowsFromMicro } from '../../lib/foodAmountRows.js';
import type { AmountRow } from '../../lib/foodAmountRows.js';
import { DEFAULT_FOOD_TYPE, formFoodType } from '../../lib/foodType.js';
import { marksOf } from '../../lib/plate.js';
import { usesOf } from '../../lib/recipeUses.js';
import { readyMadeValues } from '../../lib/readyMade.js';
import { planFill } from '../../lib/labelFill.js';
import { SCAN_TEXT, scanLabel } from '../../lib/scanPhoto.js';
import { withMicro } from '../../shared/foodMicro.js';
import { MAX_RECIPE_NAME } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import FoodAmountRows from '../diet/FoodAmountRows.js';
import FoodSearch, { type FoodFill } from '../diet/FoodSearch.js';
import CountsAsChips from './CountsAsChips.js';
import UsedAsChips from './UsedAsChips.js';
import { useCountsAs } from './useCountsAs.js';
import type { Recipe, RecipeUse } from '../../types.ts';

const FOOD_USES: readonly RecipeUse[] = ['ingredient', 'ready', 'drink'];
const str = (n: number | undefined) => (n !== undefined ? String(n) : '');

// A ready-made food (brief recipe-first-diet-log): something bought or frozen that you only heat up. It is a recipe in the Ready-made category with
// no ingredients or steps, so it is listed, searched, logged with the log control and planned like any recipe. Numbers are per serving, typed from the
// label or filled from the food lookup (still editable).
export default function ReadyMadeForm({ recipe, onDone, scanFirst }: { recipe?: Recipe; onDone: (savedId: string | null) => void; scanFirst?: boolean }) {
  const [n, setN] = useState(recipe?.n ?? '');
  const [kcal, setKcal] = useState(str(recipe?.kcal));
  // Vitamins and minerals per serving (brief recipes-vitamins-minerals): never typed; they come with a lookup or a label scan and are kept only while calories are still the number they came with.
  const [microKcal, setMicroKcal] = useState<number | undefined>(recipe?.kcal);
  // Typed rows (brief type-food-amounts): the same amounts as rows you can see and change. A lookup or scan refills them; untouched filled rows go when calories change.
  const [rows, setRows] = useState<AmountRow[]>(() => rowsFromMicro(recipe?.micro, true));
  const [protein, setProtein] = useState(str(recipe?.p));
  const [carbs, setCarbs] = useState(str(recipe?.c));
  const [fat, setFat] = useState(str(recipe?.f));
  const [uses, setUses] = useState<RecipeUse[]>(() => (recipe ? usesOf(recipe) : [DEFAULT_FOOD_TYPE])); // brief recipes-used-as-ingredients-tab: one or more of Ingredient, Ready to eat, Drink; starts on Ready to eat // brief food-type-and-migration: required, starts on Ready to eat (a food saved before types existed saves with its first Type too)
  const countsAs = useCountsAs(recipe?.counts); // brief week-board: what it covers on a plate; automatic until pressed
  const [note, setNote] = useState(recipe?.note ?? '');
  const [pack, setPack] = useState(str(recipe?.servings));
  const [usual, setUsual] = useState(str(recipe?.usual)); // brief usual-amount-and-unit: how many the log control opens at, and what one serving is called
  const [unit, setUnit] = useState(recipe?.unit ?? '');
  const [plural, setPlural] = useState(recipe?.plural ?? '');
  const [err, setErr] = useState('');
  const canScan = !recipe;
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []); // a scan that ends after Cancel changes nothing
  const fillFrom = (f: FoodFill) => {
    if (!n.trim()) setN(f.n);
    setKcal(String(f.kcal)); setProtein(String(f.p)); setCarbs(str(f.c)); setFat(str(f.f)); setRows(rowsFromMicro(f.micro, true)); setMicroKcal(f.kcal); setErr('');
  };
  // Scan label (brief label-photo-scan): fills the form from a photo, never saves. Only empty text boxes are kept, numbers are replaced because they come from the label.
  const scan = async (file: File | undefined) => {
    if (!file || scanning) return;
    setScanning(true); setScanNote('');
    const r = await scanLabel(file);
    if (!mounted.current) return;
    setScanning(false);
    if (!r.ok) { setScanNote(SCAN_TEXT[r.reason]); return; }
    const plan = planFill(r.result, { n: '', note: '', pack: '' }); // what the label offers; a name or note typed while it was reading is kept below
    if (plan.n !== undefined) setN(cur => (cur.trim() ? cur : plan.n ?? ''));
    if (plan.kcal !== undefined) { setKcal(plan.kcal); setProtein(plan.p ?? ''); setCarbs(plan.c ?? ''); setFat(plan.f ?? ''); setRows(rowsFromMicro(plan.micro, true)); setMicroKcal(Number(plan.kcal)); setErr(''); }
    if (plan.note !== undefined) setNote(cur => (cur.trim() ? cur : plan.note ?? ''));
    if (plan.pack !== undefined) setPack(cur => (cur.trim() ? cur : plan.pack ?? ''));
    setScanNote(plan.message);
  };
  const autoMarks = marksOf({ id: recipe?.id ?? '', n, cat: 'ready', ing: [], steps: [], ...(protein.trim() && Number.isFinite(Number(protein)) ? { p: Number(protein) } : {}) });
  const live = liveRows(rows, Number(kcal), microKcal);
  const save = () => {
    const v = readyMadeValues({ n, kcal, p: protein, c: carbs, f: fat, pack, usual, unit, plural });
    if ('error' in v) { setErr(v.error); return; }
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), n, cat: 'ready', type: formFoodType(uses[0]), ...(uses.length > 1 ? { uses } : {}), ...(countsAs.toSave ? { counts: countsAs.toSave } : {}), ing: [], steps: [], ...v, ...withMicro(microOfRows(live.rows).micro), note });
    if (e) { setErr(e); return; }
    const list = useAppStore.getState().recipes;
    onDone(recipe?.id ?? list[list.length - 1]?.id ?? null);
  };
  return (
    <form className="rc-form rcf" onSubmit={e => { e.preventDefault(); save(); }} aria-label={recipe ? `Edit ${recipe.n}` : 'New ready-made food'}>
      <h3 tabIndex={-1}>{recipe ? 'Edit ready-made food' : 'New ready-made food'}</h3>
      <div onKeyDown={e => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault(); }}>{/* Enter in the lookup box searches, it does not save the form */}
        <FoodSearch onUse={fillFrom} {...(scanFirst ? { scanFirst } : {})} {...(canScan ? { onLabelPhoto: () => camera.current?.click() } : {})} />
      </div>
      {canScan && (
        <div className="rc-scan">
          {/* Two inputs: Android's photo picker offers only the gallery, so the camera needs its own `capture` input; on a desktop `capture` is ignored and both open the file picker. */}
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Label camera" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={library} type="file" accept="image/*" hidden aria-label="Label photo" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="rc-scanbtns">
            <button type="button" className="btn sm" disabled={scanning} onClick={() => camera.current?.click()}>{scanning ? 'Reading label...' : 'Scan label'}</button>
            <button type="button" className="btn sm" disabled={scanning} onClick={() => library.current?.click()}>Choose photo</button>
          </div>
          <p className="note">Fills the form; nothing is saved until you save.</p>
          {scanNote && <p className="note" role="status">{scanNote}</p>}
        </div>
      )}
      <div className="rcf-cols">{/* from 1024 px two columns: the name and numbers beside the amounts and the optional fields (RecipeDesktop.css) */}
      <div className="rcf-col">
      <label>Name
        <input value={n} maxLength={MAX_RECIPE_NAME} onChange={e => { setN(e.target.value); setErr(''); }} autoComplete="off" />
      </label>
      <UsedAsChips value={uses} options={FOOD_USES} onChange={setUses} />
      <CountsAsChips value={countsAs.shown(autoMarks)} picked={countsAs.picked} onChange={countsAs.pick} onAuto={countsAs.reset} />
      <div className="rc-nutfields">
        <label>Calories per serving<input inputMode="numeric" value={kcal} onChange={e => { setKcal(e.target.value); setErr(''); }} /></label>
        <label>Protein per serving (g)<input inputMode="decimal" value={protein} onChange={e => { setProtein(e.target.value); setErr(''); }} /></label>
        <label>Carbs per serving (g), optional<input inputMode="decimal" value={carbs} onChange={e => { setCarbs(e.target.value); setErr(''); }} /></label>
        <label>Fat per serving (g), optional<input inputMode="decimal" value={fat} onChange={e => { setFat(e.target.value); setErr(''); }} /></label>
      </div>
      </div>
      <div className="rcf-col">
      <FoodAmountRows idp="rc" perServing rows={live.rows} onChange={setRows} cleared={live.cleared} />
      <label>Servings per pack, optional
        <input inputMode="numeric" value={pack} onChange={e => { setPack(e.target.value); setErr(''); }} aria-describedby="rc-pack-help" />
      </label>
      <p id="rc-pack-help" className="note">Lets you log the whole pack in one step.</p>
      <label>Usual amount, optional
        <input inputMode="decimal" value={usual} onChange={e => { setUsual(e.target.value); setErr(''); }} aria-describedby="rc-usual-help" />
      </label>
      <label>One serving is called, optional
        <input value={unit} maxLength={20} onChange={e => { setUnit(e.target.value); if (!e.target.value.trim()) setPlural(''); setErr(''); }} /* a plural with no unit is hidden, so it is cleared with it */ autoComplete="off" aria-describedby="rc-usual-help" />
      </label>
      {unit.trim() && (
        <label>Plural, only if adding s is wrong
          <input value={plural} maxLength={20} onChange={e => { setPlural(e.target.value); setErr(''); }} autoComplete="off" />
        </label>
      )}
      <p id="rc-usual-help" className="note">The log control opens at your usual amount and reads in your word: 4 and egg give "4 eggs".</p>
      <label>Note
        <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
      </label>
      </div>
      </div>
      <div className="rcf-foot">
        {err && <p className="note gerr" role="alert">{err}</p>}
        <div className="rc-actions rc-bar">
          <button type="button" className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" className="btn primary">Save food</button>
        </div>
      </div>
    </form>
  );
}
