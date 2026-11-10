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
import { planFill } from '../../lib/supplementLabelFill.js';
import { isDsldCatalogId, useSupplementLabel } from '../../hooks/useSupplementLabel.js';
import PortionStepper from '../supplements/PortionStepper.js';
import './SupplementSheet.css';
import type { NutrientDraft } from '../supplements/NutrientRows.js';

/** The first nutrient row with an amount typed, for the line under the stepper. */
const firstRow = (rows: NutrientDraft[]) => { const r = rows.find(x => Number(x.amount) > 0); return r ? { label: nutrientLabel(r.key), amount: Number(r.amount), unit: r.unit } : undefined; };

// Add or edit a supplement in the library: name, dose, note, when it is on the schedule, and what is in one serving (the rows behind the Totals sheet).
// `backToManage`: it was opened from the library inside the Manage sheet, so closing it (saved, removed or cancelled) reopens that editor instead of leaving you on the board.
export default function SupplementSheet({ id, backToManage }: { id?: string | null; backToManage?: boolean }) {
  const s = useAppStore.getState();
  useEffect(() => () => { if (backToManage && useAppStore.getState().modal === null) afterSheetClose(window.history, window, () => useAppStore.getState().openModal({ type: 'nbmanage', view: 'editor' })); }, [backToManage]); // after the sheet's own Back step (lib/backNav.ts)
  const cur = id ? s.supp.items.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', dose: cur ? cur.dose || '' : '', note: cur ? cur.note || '' : '', slot: cur ? cur.slot : 'morning', nutrients: (cur?.nutrients || []).map((r): NutrientDraft => ({ key: r.key, amount: String(r.amount), unit: r.unit })), portion: cur?.portion ?? 1, units: cur?.serving ? String(cur.serving.units) : '', form: cur?.serving?.form || '' }));
  const [err, setErr] = useState('');
  // Fill from label (brief supplement-label-amounts): read the label on request, show it beside the rows in the form, change the form only on Replace (Save still keeps it).
  const [asked, setAsked] = useState(false); const [replaced, setReplaced] = useState(false);
  const { state: lab, retry } = useSupplementLabel(asked ? cur?.catalogId : null);
  const units = Number(d.units);
  const plan = lab.status === 'ready' ? planFill({ nutrients: d.nutrients.flatMap(r => (Number(r.amount) > 0 ? [{ key: r.key, amount: Number(r.amount), unit: r.unit }] : [])), ...(units > 0 ? { serving: { units, ...(d.form ? { form: d.form } : {}) } } : {}) }, lab.label) : null;
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  return (
    <Sheet>
      <h2 className="cond">{cur ? (cur.catalogId ? cur.n : 'Edit supplement') : 'New supplement'}</h2>
      <form id="supp-form" noValidate onSubmit={e => { e.preventDefault(); const units = Number(d.units); const m = s.saveSupplement({ ...d, serving: units > 0 ? { units, ...(d.form ? { form: d.form } : {}) } : null, portion: d.portion, nutrients: d.nutrients.flatMap(r => (Number(r.amount) > 0 ? [{ key: r.key, amount: Number(r.amount), unit: r.unit }] : [])) }); if (m) setErr(m); }}>
        <section className="ssg" aria-labelledby="ssg-id">
          <h3 className="ssgh" id="ssg-id">The supplement</h3>
          {cur?.catalogId
            ? <p className="note">From the catalog{cur.brand ? ` (${cur.brand})` : ''}: its name stays; the dose, schedule and note are yours.</p>
            : <label className="field">Name<input id="supp-name" maxLength={60} value={d.n} placeholder="e.g. Vitamin D3" onChange={e => up({ n: e.target.value })} /></label>}
          <label className="field">Note (optional)<input maxLength={200} value={d.note} placeholder="e.g. With food" onChange={e => up({ note: e.target.value })} /></label>
        </section>
        <section className="ssg" aria-labelledby="ssg-sched">
          <h3 className="ssgh" id="ssg-sched">When you take it</h3>
          <label className="field">On the schedule
            <select value={d.slot} onChange={e => up({ slot: e.target.value as SupplementSlot })}>{SLOT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Dose (optional)<input maxLength={40} value={d.dose} placeholder="e.g. 2000 IU" onChange={e => up({ dose: e.target.value })} /></label>
        </section>
        <section className="ssg" aria-labelledby="ssg-amt">
          <h3 className="ssgh" id="ssg-amt">What is in one serving</h3>
          <NutrientRows rows={d.nutrients} onChange={nutrients => up({ nutrients })} />
          {cur && isDsldCatalogId(cur.catalogId) && !asked && <button type="button" className="btn sm" onClick={() => { setAsked(true); setReplaced(false); }}>Fill from label</button>}
          {asked && lab.status === 'loading' && <p className="note" role="status">Reading the label...</p>}
          {asked && lab.status === 'failed' && (
            <p className="note" role="status">Could not load this product's amounts. You can type them in the rows above. <button type="button" className="btn sm" onClick={retry}>Try again</button> <button type="button" className="btn sm" onClick={() => setAsked(false)}>Close</button></p>
          )}
          {asked && lab.status === 'ready' && plan && (
            <LabelCompare label={lab.label} plan={plan} onCancel={() => setAsked(false)}
              onReplace={() => { up({ nutrients: plan.result.nutrients.map((r): NutrientDraft => ({ key: r.key, amount: String(r.amount), unit: r.unit })), units: plan.result.serving ? String(plan.result.serving.units) : d.units, form: plan.result.serving?.form ?? d.form }); setAsked(false); setReplaced(true); }} />
          )}
          {replaced && <p className="note" role="status">Label amounts are in the rows above. Press Save to keep them.</p>}
        </section>
        <section className="ssg" aria-labelledby="ssg-serv">
          <h3 className="ssgh" id="ssg-serv">How much you take</h3>
          <PortionStepper portion={d.portion} units={d.units} form={d.form} row={firstRow(d.nutrients)} onPortion={portion => up({ portion })} onUnits={units => up({ units })} onForm={form => up({ form })} />
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
