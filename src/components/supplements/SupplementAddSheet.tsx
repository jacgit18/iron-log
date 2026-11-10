import type { SupplementSlot } from '../../types.ts';
import { useEffect, useState, type FormEvent } from 'react';
import type { CatalogItem } from '../../types.ts';
import type { SupplementLabel } from '../../shared/dsldLabel.js';
import { useAppStore } from '../../store/useAppStore.js';
import { afterSheetClose } from '../../lib/backNav.js';
import { MIN_LETTERS, useCatalogSearch } from '../../hooks/useCatalogSearch.js';
import { useSupplementLabel } from '../../hooks/useSupplementLabel.js';
import { searchCatalog } from '../../sync/catalog.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import { pickerOptions, type PickerChoice } from '../../lib/picker.js';
import { isTouchScreen } from '../../lib/revealField.js';
import { SLOT_OPTIONS, slotLabel } from '../../lib/supplements.js';
import { toggleAddSlot } from '../../lib/supplementTimes.js';
import { planAddMine } from '../../lib/supplementAddPlan.js';
import { lookupSupplementBarcode } from '../../lib/supplementBarcodeClient.js';
import { exactListingText, fromBarcodeText, scanSearchSteps, suppBarcodeText, typedUpc, type SuppBarcodeFailure } from '../../lib/supplementBarcodeQuery.js';
import { planFill } from '../../lib/supplementLabelFill.js';
import type { ProductName } from '../../shared/barcode.js';
import { catalogLine, mineOption, newestFirst, oneOfEach, upcLine } from '../../lib/supplementResultLine.js';
import Sheet from '../Sheet.js';
import { LabelAmounts } from './LabelPreview.js';
import ScanBottle from './ScanBottle.js';
import { SUPPLEMENT_SCAN_TEXT } from '../../lib/scanPhoto.js';
import './SupplementAddSheet.css';

const SHOWN = 8; const SHOWN_MORE = 500; // every result fetched so far, once Show more is pressed

// The one way to add a supplement (brief supplement-add-redesign): one search over yours and the catalog, the label of the picked product
// before Add, one time of day, a dose. `backToManage`: opened from Manage, so closing it reopens that editor.
//
// Barcode (brief supplement-barcode-search): NIH cannot search by UPC, so a scanned or typed UPC becomes a product name (server/supplementBarcode.ts) and the name fills the search; the
// person still picks the listing. `found` and `listing`: what a barcode scan just found, the product's name and (when the UPC table has it) the exact catalog listing, which opens already picked (the camera sheet replaced this one and reopened it); `startQ`: the text to come back to when the camera was closed.
export default function SupplementAddSheet({ backToManage, found, listing, startQ }: { backToManage?: boolean; found?: ProductName; listing?: CatalogItem; startQ?: string }) {
  const s = useAppStore.getState();
  const syncing = useAppStore(x => x.sync !== null);
  const items = useAppStore(x => x.supp.items);
  useEffect(() => () => { if (backToManage && useAppStore.getState().modal === null) afterSheetClose(window.history, window, () => useAppStore.getState().openModal({ type: 'nbmanage', view: 'editor' })); }, [backToManage]); // after the sheet's own Back step (lib/backNav.ts)
  const [scan, setScan] = useState(() => { const steps = found && !listing ? scanSearchSteps(found) : []; return found && steps.length ? { product: found, steps, step: 0 } : null; });
  const [q, setQ] = useState(() => listing?.name ?? scan?.steps[0] ?? startQ ?? ''); const [pick, setPick] = useState<PickerChoice | null>(() => (listing ? { kind: 'catalog', item: listing } : null));
  const [exact, setExact] = useState(!!listing); // the pick came from a barcode that matched one listing exactly
  const upc = typedUpc(q); // a typed UPC is looked up instead of searched
  const [upcState, setUpcState] = useState<'idle' | 'looking' | SuppBarcodeFailure>('idle');
  const [slots, setSlots] = useState<SupplementSlot[]>(['morning']); const slot: SupplementSlot = slots[0] ?? ''; const [dose, setDose] = useState(''); // `slot` is the first time; any others get a copy of the entry made for it
  const [all, setAll] = useState(false); const [err, setErr] = useState('');
  const [scanned, setScanned] = useState<SupplementLabel | null>(null); // the bottle's label read from a photo (brief supplement-label-scan); only for a new supplement, never with a catalog pick
  const { state: cat0, retry: retrySearch } = useCatalogSearch('supplement', q, !pick && !upc);
  // Later pages of the same search (the server answers 30 at a time), kept with the words they answer; a new search drops them.
  const [more, setMore] = useState<{ q: string; items: CatalogItem[]; more: boolean; busy: boolean } | null>(null);
  const extra = more && more.q === q.trim() ? more : null;
  // A typed UPC: ask for the product's name, then search for it like a scan.
  useEffect(() => {
    if (!upc || !syncing || pick) { setUpcState('idle'); return; }
    let live = true;
    setUpcState('looking');
    // Typing a UPC digit by digit passes through shorter numbers that happen to pass the check digit (about 1 in 10 at 8 digits): wait for a pause before asking the server, which counts a miss against the daily cap.
    const wait = setTimeout(() => void lookupSupplementBarcode(upc).then(r => {
      if (!live) return;
      if (r.ok && r.listing) { setPick({ kind: 'catalog', item: r.listing }); setExact(true); setScanned(null); setScan(null); setErr(''); setQ(r.listing.name); setUpcState('idle'); return; }
      const steps = r.ok ? scanSearchSteps(r.product) : [];
      if (r.ok && steps.length) { setScan({ product: r.product, steps, step: 0 }); setUpcState('idle'); setQ(steps[0]!); } else setUpcState(r.ok ? 'notfound' : r.reason);
    }), 500);
    return () => { live = false; clearTimeout(wait); };
  }, [upc, syncing, pick]);
  const cat = cat0.status === 'ready' && extra ? { ...cat0, items: [...cat0.items, ...extra.items], more: extra.more } : cat0;
  const loadMore = () => {
    if (cat.status !== 'ready') return;
    const words = q.trim(); const offset = cat.items.length;
    setMore({ q: words, items: extra?.items ?? [], more: true, busy: true });
    void searchCatalog(words, offset, devHeaders).then(r => setMore(m => (m && m.q === words ? (r.ok ? { q: words, items: [...(extra?.items ?? []), ...r.items], more: r.more, busy: false } : { ...m, busy: false }) : m)));
  };
  // A name from a barcode source can carry a brand the catalog spells differently: when brand and name find nothing, try the name alone.
  useEffect(() => {
    if (!scan || pick || cat0.status !== 'ready' || cat0.searching || cat0.items.length || q !== scan.steps[scan.step] || scan.step + 1 >= scan.steps.length) return;
    setScan({ ...scan, step: scan.step + 1 }); setQ(scan.steps[scan.step + 1]!);
  }, [scan, pick, cat0, q]);
  const scanCamera = () => {
    const later = (p: ProductName | undefined, l?: CatalogItem) => setTimeout(() => useAppStore.getState().openModal({ type: 'suppadd', ...(backToManage ? { from: 'manage' } : {}), ...(p ? { found: p, ...(l ? { listing: l } : {}) } : { q }) }), 0); // after the camera sheet has closed itself
    useAppStore.getState().openModal({ type: 'suppscan', onFound: (p: ProductName, l?: CatalogItem) => later(p, l), onBack: () => later(undefined) });
  };
  const { state: lab, retry: retryLabel } = useSupplementLabel(pick?.kind === 'catalog' ? pick.item.id : null);
  const fill = lab.status === 'ready' ? planFill({}, lab.label).result : undefined;
  const scanFill = scanned ? planFill({}, scanned).result : undefined;
  const o = pickerOptions(q, oneOfEach(items).map(i => mineOption(i, syncing)), cat.status === 'ready' ? newestFirst(cat.items) : [],
    { byBrand: true, serverFiltered: !(cat.status === 'ready' && cat.searching), max: all ? SHOWN_MORE : SHOWN });
  const hidden = o.mine.hidden + o.catalog.hidden;
  const searching = cat.status === 'loading' || (cat.status === 'ready' && !!cat.searching);
  const note = cat.status === 'short' && !q.trim() ? `Type ${MIN_LETTERS} letters of a name or brand.`
    : cat.status === 'short' ? `Type at least ${MIN_LETTERS} letters to search the catalog.`
    : searching ? 'Searching the catalog…'
    : cat.status === 'failed' ? (cat.reason === 'offline' ? 'The catalog needs a connection.' : cat.reason === 'refused' ? 'The catalog is not available to this account.' : 'The catalog could not be loaded.')
    : !syncing && q.trim() ? 'No catalog here: this device keeps its own supplements only.' : '';
  const upcNote = upc && upcState !== 'idle' ? (upcState === 'looking' ? 'Looking up the barcode...' : suppBarcodeText(upcState)) : '';
  const noResults = !upc && !!q.trim() && !searching && !o.mine.shown.length && !o.catalog.shown.length && cat.status !== 'failed';
  const heldItem = pick?.kind === 'mine' ? items.find(i => i.id === pick.id) : undefined;
  const typed = q.trim().replace(/\s+/g, ' ');
  const canAdd = !!pick || !!typed;

  const choose = (c: PickerChoice) => { setPick(c); setExact(false); setErr(''); if (c.kind !== 'create') setScanned(null); if (c.kind === 'mine') setQ(items.find(i => i.id === c.id)?.n ?? q); else if (c.kind === 'catalog') setQ(c.item.name); else setQ(c.name); };
  const clear = () => { setPick(null); setExact(false); setErr(''); };
  const read = (l: SupplementLabel) => { setScanned(l); setErr(''); setQ(cur => (cur.trim() ? cur : l.name.slice(0, 60))); }; // the name box keeps what was typed; it takes the photo's name only while empty
  // Add: one of yours moves into the time of day or gets another instance, a catalog product joins your library in it with its label's amounts, anything else is a new supplement.
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (pick?.kind === 'mine') {
      if (!slots.length) { setErr('Pick a time of day, or Library only.'); return; }
      let done = false; let why = '';
      for (const sl of slots) { // each picked time: a library-only one moves in, one scheduled elsewhere gets another instance, one already there is skipped
        const plan = planAddMine(useAppStore.getState().supp.items, pick.id, sl);
        if (!plan) return;
        if (plan.kind === 'exists') { why ||= plan.message; continue; }
        if (plan.kind === 'move' ? s.setSupplementSlot(plan.id, sl, dose) : s.addSupplementInstance(plan.id, sl, dose)) done = true;
      }
      if (done) s.closeModal(); else setErr(why || 'Could not add it.');
      return;
    }
    if (pick?.kind === 'catalog') {
      if (!slots.length) { setErr('Pick a time of day, or Library only.'); return; }
      const m = s.addCatalogSupplement(pick.item, { slot, dose, ...(fill?.nutrients.length || fill?.ingredients.length || fill?.serving ? { nutrients: fill.nutrients, ingredients: fill.ingredients, serving: fill.serving } : {}) });
      if (m) { setErr(m); return; }
      const made = useAppStore.getState().supp.items.find(i => i.catalogId === pick.item.id);
      if (!made) return;
      slots.slice(1).forEach(sl => s.addSupplementInstance(made.id, sl, dose));
      s.closeModal();
      return;
    }
    if (!pick && (o.mine.shown.length || o.catalog.shown.length)) { setErr('Pick a result, or pick “Add … as a new supplement”.'); return; }
    const name = pick?.kind === 'create' ? pick.name : typed;
    if (!slot) { setErr('Pick Morning, Noon or Night for a new supplement, or open the full form to keep it in the library only.'); return; }
    if (s.addSupplement(slot, name, dose, scanFill && scanned ? { nutrients: scanFill.nutrients, ingredients: scanFill.ingredients, ...(scanFill.serving ? { serving: scanFill.serving } : {}), ...(scanned.brand ? { brand: scanned.brand } : {}) } : undefined)) {
      const made = useAppStore.getState().supp.items.find(i => i.n === name && i.slot === slot);
      if (made) slots.slice(1).forEach(sl => s.addSupplementInstance(made.id, sl, dose));
      s.closeModal();
    } else setErr(`Could not add ${name}. You may already have it in ${slotLabel(slot)}.`);
  };
  const row = (key: string, choice: PickerChoice, name: string, meta?: string, badge?: string) => (
    <li key={key}>
      <button type="button" className="sasopt" aria-label={`${name}${badge ? ` ${badge}` : ''}${meta ? `, ${meta}` : ''}`} onClick={() => choose(choice)}>
        <span className="sasname">{name}{badge && <span className="pill custom">{badge}</span>}</span>
        {meta && <span className="note">{meta}</span>}
      </button>
    </li>
  );
  return (
    <Sheet>
      <h2 className="cond">Add a supplement</h2>
      <form id="suppadd-form" noValidate onSubmit={add} className="sas">
        <label className="field">Name or brand
          <input id="suppadd-q" type="search" autoComplete="off" maxLength={100} value={q} placeholder="e.g. creatine, Nature Made" autoFocus={!isTouchScreen()}
            onChange={e => { setQ(e.target.value); setScan(null); setPick(null); setExact(false); setErr(''); setAll(false); setMore(null); }} />
        </label>
        {syncing && !pick && <button type="button" className="btn sm" id="suppadd-scan" onClick={scanCamera}>Scan barcode</button>}
        {!pick && upcNote && <p className={`note${upcState === 'looking' ? '' : ' err'}`} role="status">{upcNote}</p>}
        {!pick && !upcNote && scan && <p className="note" role="status">{fromBarcodeText(scan.product)}</p>}
        {!pick && !upc && (
          <>
            {note && <p className={`note${cat.status === 'failed' ? ' err' : ''}`} role="status">{note}{cat.status === 'failed' && cat.reason !== 'refused' && <> <button type="button" className="btn sm ghost" onClick={retrySearch}>Try again</button></>}</p>}
            {noResults && <p className="note">No match.</p>}
            {noResults && !scanned && <ScanBottle label="Scan the bottle’s label" onRead={read} />}
            {(o.mine.shown.length > 0 || o.catalog.shown.length > 0 || o.create) && (
              <ul className="sasresults" aria-label="Results">
                {o.mine.shown.map(m => row(`m-${m.id}`, { kind: 'mine', id: m.id }, m.name, m.meta, m.badge))}
                {o.catalog.shown.map(c => row(`c-${c.id}`, { kind: 'catalog', item: c }, c.name, catalogLine(c)))}
                {o.create && row('create', { kind: 'create', name: o.create }, `Add “${o.create}” as a new supplement`)}
              </ul>
            )}
            {hidden > 0 && !all && <button type="button" className="btn sm ghost sasmore" onClick={() => setAll(true)}>Show {hidden} more</button>}
            {(all || hidden === 0) && cat.status === 'ready' && cat.more && <button type="button" className="btn sm ghost sasmore" disabled={!!extra?.busy} onClick={loadMore}>{extra?.busy ? 'Loading…' : 'Show more results'}</button>}
          </>
        )}
        {pick && (
          <div className="sasbox">
            <div className="sasboxhead">
              <h3 className="sasboxname">{pick.kind === 'catalog' ? pick.item.name : pick.kind === 'mine' ? heldItem?.n : pick.name}</h3>
              <button type="button" className="btn sm ghost" onClick={clear}>Change</button>
            </div>
            {pick.kind === 'catalog' && <p className="note">{[catalogLine(pick.item), upcLine(pick.item)].filter(Boolean).join(' · ')}. From the catalog: it joins your supplements.</p>}
            {pick.kind === 'catalog' && exact && <p className="note" role="status">{exactListingText}</p>}
            {pick.kind === 'mine' && heldItem && <p className="note">{heldItem.slot ? `Yours, in ${slotLabel(heldItem.slot)}. Adding it to another time of day makes another instance.` : 'Yours, in the library only. Adding it schedules it.'}</p>}
            {pick.kind === 'create' && <p className="note">A new supplement of your own.</p>}
            {pick.kind === 'create' && !scanned && <ScanBottle label="Scan the bottle’s label" onRead={read} />}
            {pick.kind === 'catalog' && lab.status === 'loading' && <p className="note" role="status">Reading the label... Add now and it is added without amounts.</p>}
            {pick.kind === 'catalog' && lab.status === 'failed' && <p className="note" role="status">Could not load this product's amounts. You can type them in the supplement's sheet. <button type="button" className="btn sm" onClick={retryLabel}>Try again</button></p>}
            {pick.kind === 'catalog' && lab.status === 'ready' && <LabelAmounts label={lab.label} />}
          </div>
        )}
        {scanned && (!pick || pick.kind === 'create') && (
          <div className="sasbox">
            <h3 className="sasboxname">{scanned.name || 'Your bottle'}</h3>
            <p className="note" role="status">{SUPPLEMENT_SCAN_TEXT.check} Check that every row on the bottle is here.</p>
            <LabelAmounts label={scanned} />
            <ScanBottle label="Retake" onRead={read} />
          </div>
        )}
        <fieldset className="sasslot">
          <legend>Time of day (pick every time you take it)</legend>
          {SLOT_OPTIONS.map(([k, l]) => (
            <label key={k || 'lib'} className={`sasradio${slots.includes(k) ? ' on' : ''}`}><input type="checkbox" name="suppadd-slot" value={k} checked={slots.includes(k)} onChange={() => { setSlots(cur => toggleAddSlot(cur, k)); setErr(''); }} />{l}</label>
          ))}
        </fieldset>
        <label className="field">Dose (optional)<input id="suppadd-dose" type="text" placeholder="e.g. 5 g" maxLength={40} value={dose} onChange={e => setDose(e.target.value)} /></label>
        {!pick || pick.kind !== 'catalog' ? <button type="button" className="btn sm ghost sasfull" id="suppadd-full" onClick={() => useAppStore.getState().openModal({ type: 'supplement', from: backToManage ? 'manage' : undefined, draft: { n: pick?.kind === 'create' ? pick.name : typed, slot, dose } })}>Open the full form, with amounts</button> : null}
        {err && <p className="note err" role="alert">{err}</p>}
      </form>
      <div className="actions">
        <button type="button" className="btn" onClick={s.closeModal}>Cancel</button>
        <button type="submit" form="suppadd-form" className="btn primary" id="suppadd-go" disabled={!canAdd}>Add</button>
      </div>
    </Sheet>
  );
}
