import type { SupplementSlot } from '../../types.ts';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { afterSheetClose } from '../../lib/backNav.js';
import { SLOT_OPTIONS } from '../../lib/supplements.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';
import { nutrientLabel } from '../../lib/nutrientInfo.js';
import NutrientRows from '../supplements/NutrientRows.js';
import { LabelCompare } from '../supplements/LabelPreview.js';
import ScanBottle from '../supplements/ScanBottle.js';
import { SUPPLEMENT_SCAN_TEXT } from '../../lib/scanPhoto.js';
import type { SupplementLabel } from '../../shared/dsldLabel.js';
import { planFill } from '../../lib/supplementLabelFill.js';
import { isDsldCatalogId, useSupplementLabel } from '../../hooks/useSupplementLabel.js';
import PortionStepper from '../supplements/PortionStepper.js';
import SupplementTimes from '../supplements/SupplementTimes.js';
import { timesOf } from '../../lib/supplementTimes.js';
import type { TimeChoice } from '../../lib/supplementTimes.js';
import './SupplementSheet.css';
import type { NutrientDraft } from '../supplements/NutrientRows.js';

/** The first nutrient row with an amount typed, for the line under the stepper. */
const firstRow = (rows: NutrientDraft[]) => { const r = rows.find(x => Number(x.amount) > 0); return r ? { label: nutrientLabel(r.key), amount: Number(r.amount), unit: r.unit } : undefined; };

// Add or edit a supplement in the library: name, dose, note, when it is on the schedule, and what is in one serving (the rows behind the Totals sheet).
// `backToManage`: it was opened from the library inside the Manage sheet, so closing it (saved, removed or cancelled) reopens that editor instead of leaving you on the board.
/** What the add sheet had typed when it opened the full form (a new supplement only). */
export interface SupplementDraft { n?: string; slot?: SupplementSlot; dose?: string }

export default function SupplementSheet({ id, backToManage, draft }: { id?: string | null; backToManage?: boolean; draft?: SupplementDraft }) {
  const s = useAppStore.getState();
  useEffect(() => () => { if (backToManage && useAppStore.getState().modal === null) afterSheetClose(window.history, window, () => useAppStore.getState().openModal({ type: 'nbmanage', view: 'editor' })); }, [backToManage]); // after the sheet's own Back step (lib/backNav.ts)
  const cur = id ? s.supp.items.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : draft?.n ?? '', dose: cur ? cur.dose || '' : draft?.dose ?? '', note: cur ? cur.note || '' : '', slot: cur ? cur.slot : draft?.slot ?? 'morning', nutrients: (cur?.nutrients || []).map((r): NutrientDraft => ({ key: r.key, amount: String(r.amount), unit: r.unit })), portion: cur?.portion ?? 1, units: cur?.serving ? String(cur.serving.units) : '', form: cur?.serving?.form || '' }));
  const [times, setTimes] = useState<TimeChoice[]>(() => (cur ? timesOf(s.supp.items, cur.id) : [])); // an existing supplement edits its times as chips; a new one picks one time below
  const [err, setErr] = useState('');
  // Fill from label (brief supplement-label-amounts): read the label on request, show it beside the rows in the form, change the form only on Replace (Save still keeps it).
  const [asked, setAsked] = useState(false); const [replaced, setReplaced] = useState(false);
  const [scanned, setScanned] = useState<SupplementLabel | null>(null); // Scan label (brief supplement-label-scan): the bottle's panel read from a photo, shown in the same compare view
  const { state: lab, retry } = useSupplementLabel(asked ? cur?.catalogId : null);
  const units = Number(d.units);
  const label = scanned ?? (asked && lab.status === 'ready' ? lab.label : null);
  const plan = label ? planFill({ nutrients: d.nutrients.flatMap(r => (Number(r.amount) > 0 ? [{ key: r.key, amount: Number(r.amount), unit: r.unit }] : [])), ...(units > 0 ? { serving: { units, ...(d.form ? { form: d.form } : {}) } } : {}) }, label) : null;
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  return (
    <Sheet>
      <h2 className="cond">{cur ? (cur.catalogId ? cur.n : 'Edit supplement') : 'New supplement'}</h2>
      <form id="supp-form" noValidate onSubmit={e => { e.preventDefault(); const units = Number(d.units); const m = s.saveSupplement({ ...d, serving: units > 0 ? { units, ...(d.form ? { form: d.form } : {}) } : null, ...(cur ? {} : { portion: d.portion }), nutrients: d.nutrients.flatMap(r => (Number(r.amount) > 0 ? [{ key: r.key, amount: Number(r.amount), unit: r.unit }] : [])) }); if (m) setErr(m); else if (cur && times.length) s.saveSupplementTimes(cur.id, times, d.dose); }}>
        <section className="ssg" aria-labelledby="ssg-id">
          <h3 className="ssgh" id="ssg-id">The supplement</h3>
          {cur?.catalogId
            ? <p className="note">From the catalog{cur.brand ? ` (${cur.brand})` : ''}: its name stays; the dose, schedule and note are yours.</p>
            : <label className="field">Name<input id="supp-name" maxLength={60} value={d.n} placeholder="e.g. Vitamin D3" onChange={e => up({ n: e.target.value })} /></label>}
          <label className="field">Note (optional)<input maxLength={200} value={d.note} placeholder="e.g. With food" onChange={e => up({ note: e.target.value })} /></label>
        </section>
        <section className="ssg" aria-labelledby="ssg-sched">
          <h3 className="ssgh" id="ssg-sched">When you take it</h3>
          {cur
            ? <SupplementTimes times={times} serving={Number(d.units) > 0 ? { units: Number(d.units), ...(d.form ? { form: d.form } : {}) } : undefined} onChange={setTimes} />
            : <label className="field">On the schedule
              <select value={d.slot} onChange={e => up({ slot: e.target.value as SupplementSlot })}>{SLOT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>}
          <label className="field">Dose (optional)<input maxLength={40} value={d.dose} placeholder="e.g. 2000 IU" onChange={e => up({ dose: e.target.value })} /></label>
        </section>
        <section className="ssg" aria-labelledby="ssg-amt">
          <h3 className="ssgh" id="ssg-amt">What is in one serving</h3>
          <NutrientRows rows={d.nutrients} onChange={nutrients => up({ nutrients })} />
          {cur && isDsldCatalogId(cur.catalogId) && !asked && <button type="button" className="btn sm" onClick={() => { setAsked(true); setReplaced(false); }}>Fill from label</button>}
          {!cur?.catalogId && !scanned && <ScanBottle label="Scan label" onRead={l => { setScanned(l); setReplaced(false); setD(x => (x.n.trim() ? x : { ...x, n: l.name.slice(0, 60) })); }} />}
          {asked && lab.status === 'loading' && <p className="note" role="status">Reading the label...</p>}
          {asked && lab.status === 'failed' && (
            <p className="note" role="status">Could not load this product's amounts. You can type them in the rows above. <button type="button" className="btn sm" onClick={retry}>Try again</button> <button type="button" className="btn sm" onClick={() => setAsked(false)}>Close</button></p>
          )}
          {label && plan && (
            <>
            {scanned && <p className="note" role="status">{SUPPLEMENT_SCAN_TEXT.check} Check that every row on the bottle is here.</p>}
            <LabelCompare label={label} plan={plan} onCancel={() => { setAsked(false); setScanned(null); }}
              onReplace={() => { up({ nutrients: plan.result.nutrients.map((r): NutrientDraft => ({ key: r.key, amount: String(r.amount), unit: r.unit })), units: plan.result.serving ? String(plan.result.serving.units) : d.units, form: plan.result.serving?.form ?? d.form }); setAsked(false); setScanned(null); setReplaced(true); }} />
            </>
          )}
          {replaced && <p className="note" role="status">Label amounts are in the rows above. Press Save to keep them.</p>}
        </section>
        <section className="ssg" aria-labelledby="ssg-serv">
          <h3 className="ssgh" id="ssg-serv">{cur ? 'Serving size' : 'How much you take'}</h3>
          <PortionStepper sizeOnly={!!cur} portion={d.portion} units={d.units} form={d.form} row={firstRow(d.nutrients)} onPortion={portion => up({ portion })} onUnits={units => up({ units })} onForm={form => up({ form })} />
        </section>
        {err && <p className="note err" role="alert">{err}</p>}
      </form>
      <div className="actions">
        {cur && <ArmedButton className="btn danger" label="Delete" armedLabel="Tap again to delete" onConfirm={() => s.deleteSupplement(cur.id)} />}
        <button type="button" className="btn" onClick={s.closeModal}>Cancel</button>
        <button type="submit" form="supp-form" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
