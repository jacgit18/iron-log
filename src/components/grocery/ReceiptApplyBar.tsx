import { applyLabel, applySummary, needsConfirm } from '../../lib/receiptApplyLabel.js';
import type { Plan } from '../../lib/groceryReceipt.js';
import ArmedButton from '../ArmedButton.js';

type Props = { plan: Plan; newCount: number; disabled: boolean; onApply: () => void; keep?: { checked: boolean; onChange: (v: boolean) => void } };

// The sticky bottom bar of the receipt sheet (brief receipt-apply-footer): the optional photo checkbox, a summary line and one wide Apply. Cancel is Close in the sheet's header,
// so nothing else sits beside Apply. When the lines and tax do not match the receipt total Apply is armed: the first tap asks, the second applies (like Skip all).
export default function ReceiptApplyBar({ plan, newCount, disabled, onApply, keep }: Props) {
  const mismatch = needsConfirm(plan.check);
  return (
    <div className="rcfoot">
      {keep && (
        <label className="rckeep" htmlFor="rc-keep">
          <input id="rc-keep" type="checkbox" checked={keep.checked} onChange={e => keep.onChange(e.target.checked)} />
          <span>Keep a copy of this photo<small>Saved under Receipts. Only you can see it, and you can delete it any time.</small></span>
        </label>
      )}
      <p className={`note rcsum${mismatch ? ' rcsumbad' : ''}`}>{applySummary(plan, newCount, mismatch)}</p>
      {mismatch
        ? <ArmedButton className="btn primary rcapply" id="rc-apply" disabled={disabled} label="Apply anyway" armedLabel="Tap again to apply anyway" onConfirm={onApply} />
        : <button type="button" className="btn primary rcapply" id="rc-apply" disabled={disabled} onClick={onApply}>{applyLabel(plan)}</button>}
    </div>
  );
}
