import { useMemo, useState } from 'react';
import { applyPlan, checkText, matchStore, netOf, planReceipt, restoreSnapshot, takeSnapshot, type Choice } from '../../lib/groceryReceipt.js';
import { money, monthLabel } from '../../lib/grocery.js';
import type { Receipt } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import type { Applied } from './ReceiptScan.js';
import './ReceiptScan.css';

// The receipt review sheet (brief receipt-scan): each line with the item it matched, its quantity and its price after any discount; change a match, untick a
// line, check the total, then Apply. The plan and the checks are pure (lib/groceryReceipt.ts); this only holds the choices. Nothing is written before Apply.
export default function ReceiptSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const g = useAppStore(s => s.grocery);
  const receipt = modal?.receipt as Receipt | undefined;
  const mk = String(modal?.mk ?? '');
  const onApplied = modal?.onApplied as ((a: Applied) => void) | undefined;
  const [choices, setChoices] = useState<Choice[]>(() => (receipt?.lines ?? []).map(l => ({ itemId: l.matchId, include: !!l.matchId })));
  const [pickedStore, setPickedStore] = useState('');
  const known = receipt ? matchStore(receipt.store, g.stores) : null;
  const taxStore = known ?? (pickedStore || null);
  const plan = useMemo(() => (receipt ? planReceipt(receipt, choices, g.items, taxStore) : null), [receipt, choices, g.items, taxStore]);
  if (!receipt || !plan) return null;

  const check = checkText(plan.check);
  const dateMonth = receipt.date ? receipt.date.slice(0, 7) : null;
  const setChoice = (i: number, patch: Partial<Choice>) => setChoices(cs => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const apply = () => {
    const st = useAppStore.getState();
    const month = st.groceryMonths[mk];
    const snap = takeSnapshot(plan, mk, month?.lines ?? {}, st.grocery.items, month?.tax);
    const done = applyPlan(plan, mk, st);
    closeModal();
    if (done > 0 || plan.taxStore) onApplied?.({ text: `Applied ${done} ${done === 1 ? 'item' : 'items'}${plan.taxStore ? ` and ${plan.taxStore} tax` : ''} for ${monthLabel(mk)}.`, undo: () => restoreSnapshot(snap, useAppStore.getState()) });
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
          const off = !c.itemId || !c.include;
          return (
            <li key={i} className={`rcrow${off ? ' rcoff' : ''}`}>
              <label className="rctick"><input type="checkbox" checked={!!c.itemId && c.include} disabled={!c.itemId || l.grossCents <= 0} onChange={e => setChoice(i, { include: e.target.checked })} aria-label={`Include ${l.text}`} /></label>
              <span className="rctext">{l.text}</span>
              <select aria-label={`Item for ${l.text}`} value={c.itemId ?? ''} disabled={l.grossCents <= 0} onChange={e => setChoice(i, { itemId: e.target.value || null, include: !!e.target.value })}>
                <option value="">Not on your list</option>
                {g.items.map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
              </select>
              <span className="rcqty">{l.qty}{l.unit ? ` ${l.unit}` : ''}</span>
              <span className="rcnet">{l.discountCents > 0 && <s>{money(l.grossCents)}</s>}{money(netOf(l))}</span>
              {plan.notes[i] && <span className="note rcwarn rcnote">{plan.notes[i]}</span>}
            </li>
          );
        })}
      </ul>
      <p className="note">Existing prices on the ticked items are replaced. Lines that are not on your list are skipped and count only in the total check.</p>
      <div className="rcfoot">
        <p className="note">{plan.items} {plan.items === 1 ? 'item' : 'items'}, {money(plan.itemsCents)}{plan.taxStore ? ` + ${plan.taxStore} tax ${money(plan.check.taxCents)}` : ''}</p>
        <div className="actions">
          <button type="button" className="btn" id="rc-cancel" onClick={closeModal}>Cancel</button>
          <button type="button" className="btn primary" id="rc-apply" disabled={nothing} onClick={apply}>{`Apply ${plan.items} ${plan.items === 1 ? 'item' : 'items'}`}</button>
        </div>
      </div>
    </Sheet>
  );
}
