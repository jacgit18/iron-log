import { useMemo, useRef, useState } from 'react';
import { addedText, applyPlan, checkText, createStaged, isStaged, matchStore, netOf, planReceipt, proposeItem, remapPlan, restoreSnapshot, stageDraft, takeSnapshot, type Choice, type ItemDraft, type Staged } from '../../lib/groceryReceipt.js';
import { money, monthLabel } from '../../lib/grocery.js';
import type { Receipt } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import type { Applied } from './ReceiptScan.js';
import './ReceiptScan.css';

// The receipt review sheet (brief receipt-scan): each line with the item it matched, its quantity and its price after any discount; change a match, untick a
// line, check the total, then Apply. The plan and the checks are pure (lib/groceryReceipt.ts); this only holds the choices. Nothing is written before Apply.
// A line with no item can be added to the list (brief receipt-add-item): the item is staged here, shown as New, and created only at Apply.
export default function ReceiptSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const g = useAppStore(s => s.grocery);
  const receipt = modal?.receipt as Receipt | undefined;
  const mk = String(modal?.mk ?? '');
  const onApplied = modal?.onApplied as ((a: Applied) => void) | undefined;
  const [choices, setChoices] = useState<Choice[]>(() => (receipt?.lines ?? []).map(l => ({ itemId: l.matchId, include: !!l.matchId })));
  const [pickedStore, setPickedStore] = useState('');
  const [staged, setStaged] = useState<Staged[]>([]);
  const [form, setForm] = useState<{ line: number; draft: ItemDraft; error: string } | null>(null); // one form open at a time
  const seq = useRef(0);
  const known = receipt ? matchStore(receipt.store, g.stores) : null;
  const taxStore = known ?? (pickedStore || null);
  const plan = useMemo(() => (receipt ? planReceipt(receipt, choices, g.items, taxStore, staged) : null), [receipt, choices, g.items, taxStore, staged]);
  if (!receipt || !plan) return null;

  const check = checkText(plan.check);
  const dateMonth = receipt.date ? receipt.date.slice(0, 7) : null;
  const setChoice = (i: number, patch: Partial<Choice>) => setChoices(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const stagedUsed = new Set(plan.steps.flatMap(s => (s.kind === 'tax' ? [] : [s.id])));
  const newCount = staged.filter(x => stagedUsed.has(x.id)).length;
  const openForm = (i: number) => setForm({ line: i, draft: proposeItem(receipt.lines[i]!, receipt.store, g.stores, taxStore ?? ''), error: '' });
  const setDraft = (patch: Partial<ItemDraft>) => setForm(f => (f ? { ...f, draft: { ...f.draft, ...patch }, error: '' } : f));
  const stage = () => {
    if (!form) return;
    const r = stageDraft(form.draft, g.items, staged, `new:${++seq.current}`);
    if (!r.ok) { setForm({ ...form, error: r.error }); return; }
    setStaged(xs => [...xs, r.item]);
    setChoice(form.line, { itemId: r.item.id, include: true });
    setForm(null);
  };
  const unstage = (id: string) => {
    setStaged(xs => xs.filter(x => x.id !== id));
    setChoices(cs => cs.map(c => (c.itemId === id ? { itemId: null, include: false } : c)));
  };
  const apply = () => {
    const made = createStaged(plan, staged, { addGroceryItem: useAppStore.getState().addGroceryItem, items: () => useAppStore.getState().grocery.items });
    const real = remapPlan(plan, made.ids);
    const st = useAppStore.getState(); // read after the items were made
    const month = st.groceryMonths[mk];
    const snap = takeSnapshot(real, mk, month?.lines ?? {}, st.grocery.items, month?.tax, made.created.map(x => made.ids[x.id]!));
    const done = applyPlan(real, mk, st);
    closeModal();
    if (done > 0 || real.taxStore || made.created.length || made.refused.length) onApplied?.({ text: `Applied ${done} ${done === 1 ? 'item' : 'items'}${real.taxStore ? ` and ${real.taxStore} tax` : ''} for ${monthLabel(mk)}.${addedText(made.created, made.refused)}`, undo: () => restoreSnapshot(snap, useAppStore.getState()) });
  };
  const nothing = plan.steps.length === 0;
  return (
    <Sheet className="rcsheet">
      <h2 className="cond">Receipt</h2>
      <p className="rcmeta">
        {receipt.store && <span>Store <b>{receipt.store}</b></span>}
        {receipt.date && <span>Dated <b>{receipt.date}</b></span>}
        <span>Applies to <b>{monthLabel(mk)}</b></span>
      </p>
      {dateMonth && dateMonth !== mk && <p className="note rcwarn" role="status">This receipt is dated {monthLabel(dateMonth)}, but you are on {monthLabel(mk)}. Close this sheet and change the month first if that is not what you want.</p>}
      {!known && (receipt.taxCents ?? 0) > 0 && (
        <label className="field" htmlFor="rc-store">Store for the tax {receipt.store ? `("${receipt.store}" is not on your list)` : ''}
          <select id="rc-store" value={pickedStore} onChange={e => setPickedStore(e.target.value)}>
            <option value="">Do not set the tax</option>
            {g.stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      <div className={`rccheck${check.ok ? '' : ' bad'}`} role="status">
        <div className="rcnums"><span>Lines {money(plan.check.linesCents)}</span><span>Tax {money(plan.check.taxCents)}</span>{plan.check.totalCents !== null && <span>Receipt total {money(plan.check.totalCents)}</span>}</div>
        <small>{check.text}</small>
      </div>
      <ul className="rclines" aria-label="Receipt lines">
        {receipt.lines.map((l, i) => {
          const c = choices[i]!;
          const isNew = isStaged(c.itemId);
          const off = !c.itemId || !c.include;
          return (
            <li key={i} className={`rcrow${off ? ' rcoff' : ''}`}>
              <label className="rctick"><input type="checkbox" checked={!!c.itemId && c.include} disabled={!c.itemId || l.grossCents <= 0} onChange={e => setChoice(i, { include: e.target.checked })} aria-label={`Include ${l.text}`} /></label>
              <span className="rctext">{l.text}</span>
              <select aria-label={`Item for ${l.text}`} value={c.itemId ?? ''} disabled={l.grossCents <= 0} onChange={e => { if (form?.line === i) setForm(null); setChoice(i, { itemId: e.target.value || null, include: !!e.target.value }); }}>
                <option value="">Not on your list</option>
                {g.items.map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
                {staged.map(x => <option key={x.id} value={x.id}>{x.n} (new)</option>)}
              </select>
              {isNew && <span className="rcpill">New</span>}
              {isNew && <button type="button" className="btn sm ghost rcunstage" aria-label={`Remove new item for ${l.text}`} onClick={() => unstage(c.itemId!)}>Remove</button>}
              {!c.itemId && l.grossCents > 0 && form?.line !== i && <button type="button" className="btn sm rcaddbtn" aria-label={`Add to list: ${l.text}`} onClick={() => openForm(i)}>Add to list</button>}
              <span className="rcqty">{l.qty}{l.unit ? ` ${l.unit}` : ''}</span>
              <span className="rcnet">{l.discountCents > 0 && <s>{money(l.grossCents)}</s>}{money(netOf(l))}</span>
              {plan.notes[i] && <span className="note rcwarn rcnote">{plan.notes[i]}</span>}
              {form?.line === i && (
                <div className="rcnew" role="group" aria-label={`Add to your list: ${l.text}`}>
                  <label className="field">Name<input id="rc-new-name" value={form.draft.n} maxLength={80} onChange={e => setDraft({ n: e.target.value })} /></label>
                  <label className="field">Store
                    <select id="rc-new-store" value={form.draft.store} onChange={e => setDraft({ store: e.target.value })}>
                      <option value="">Anywhere</option>
                      {g.stores.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="field">{form.draft.unit ? `Weight (${form.draft.unit})` : 'Count'}<input id="rc-new-qty" inputMode="decimal" value={form.draft.qty} onChange={e => setDraft({ qty: e.target.value })} /></label>
                  <label className="field">{form.draft.unit ? `Price per ${form.draft.unit} (dollars)` : 'Price (dollars)'}<input id="rc-new-price" inputMode="decimal" value={form.draft.price} onChange={e => setDraft({ price: e.target.value })} /></label>
                  {form.error && <p className="note rcwarn rcformerr" role="alert">{form.error}</p>}
                  <div className="actions">
                    <button type="button" className="btn ghost" id="rc-new-cancel" onClick={() => setForm(null)}>Not now</button>
                    <button type="button" className="btn primary" id="rc-new-add" onClick={stage}>Add item</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="note">Existing prices on the ticked items are replaced. Lines that are not on your list are skipped and count only in the total check, unless you add them with Add to list.</p>
      <div className="rcfoot">
        <p className="note">{plan.items} {plan.items === 1 ? 'item' : 'items'}, {money(plan.itemsCents)}{plan.taxStore ? ` + ${plan.taxStore} tax ${money(plan.check.taxCents)}` : ''}{newCount > 0 ? `. ${newCount} new ${newCount === 1 ? 'item' : 'items'} will be added.` : ''}</p>
        <div className="actions">
          <button type="button" className="btn" id="rc-cancel" onClick={closeModal}>Cancel</button>
          <button type="button" className="btn primary" id="rc-apply" disabled={nothing} onClick={apply}>{`Apply ${plan.items} ${plan.items === 1 ? 'item' : 'items'}`}</button>
        </div>
      </div>
    </Sheet>
  );
}
