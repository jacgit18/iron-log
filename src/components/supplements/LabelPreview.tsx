import type { SupplementLabel } from '../../shared/dsldLabel.js';
import { formatAmount, otherShown, servingWords, type FillPlan } from '../../lib/supplementLabelFill.js';
import { nutrientLabel } from '../../lib/nutrientInfo.js';
import './LabelPreview.css';

// What a product's label says (brief supplement-label-amounts): the serving, the vitamins and minerals the app tracks and the active ingredients (omega-3, EPA, DHA, creatine, caffeine), then everything else on the label, read-only.
export function LabelAmounts({ label }: { label: SupplementLabel }) {
  const { lines, more } = otherShown(label);
  return (
    <div className="lbl">
      <h4 className="lblh">In one serving</h4>
      <p className="note">Serving: {servingWords(label)}</p>
      {label.rows.length || label.ingredients.length
        ? <ul className="lblrows">
            {label.rows.map(r => <li key={r.key}><span>{nutrientLabel(r.key)}</span><span>{formatAmount(r)}</span></li>)}
            {label.ingredients.map(r => <li key={`i-${r.name}`}><span>{r.name}</span><span>{formatAmount(r)}</span></li>)}
          </ul>
        : <p className="note">No amounts the app tracks were found on this label.</p>}
      {label.other.length > 0 && (
        <details className="lblmore">
          <summary>Also on the label ({label.other.length})</summary>
          <ul className="lblrows">{lines.map((o, i) => <li key={i}><span title={o.name}>{o.name}</span><span>{o.amount}</span></li>)}</ul>
          {more > 0 && <p className="note">and {more} more</p>}
        </details>
      )}
    </div>
  );
}

const CHANGE: Record<string, string> = { new: 'new', replace: 'replaced', same: 'same', kept: 'kept (not on the label)' };

// Fill from label: what the supplement has now beside what the label says, and what Replace would do. Nothing changes until Replace.
export function LabelCompare({ label, plan, onReplace, onCancel }: { label: SupplementLabel; plan: FillPlan; onReplace: () => void; onCancel: () => void }) {
  return (
    <div className="lbl lblcmp" role="group" aria-label="Label amounts">
      <h4 className="lblh">In one serving, from the label</h4>
      <p className="note">Serving on the label: {servingWords(label)}{plan.serving ? (plan.serving.now ? ` (now ${plan.serving.now.units} ${plan.serving.now.form || 'per serving'})` : '') : ''}</p>
      {plan.lines.length || plan.ingredientLines.length ? (
        <table className="lbltable">
          <thead><tr><th scope="col">Nutrient or ingredient</th><th scope="col">Now</th><th scope="col">Label</th><th scope="col">Result</th></tr></thead>
          <tbody>{plan.lines.map(l => (
            <tr key={l.key}>
              <th scope="row">{l.label}</th>
              <td>{l.current ? l.current.map(formatAmount).join(', ') : '–'}</td>
              <td>{l.fromLabel ? formatAmount(l.fromLabel) : '–'}</td>
              <td>{CHANGE[l.change]}</td>
            </tr>
          ))}
          {plan.ingredientLines.map(l => (
            <tr key={`i-${l.name}`}>
              <th scope="row">{l.name}</th>
              <td>{l.current ? l.current.map(formatAmount).join(', ') : '–'}</td>
              <td>{l.fromLabel ? formatAmount(l.fromLabel) : '–'}</td>
              <td>{CHANGE[l.change]}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="note">No amounts the app tracks were found on this label.</p>}
      {label.other.length > 0 && <p className="note">Also on the label: {label.other.length} more, not counted (see them when you add a supplement).</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={!plan.changes} onClick={onReplace}>{plan.changes ? 'Replace with label amounts' : 'Nothing to change'}</button>
      </div>
    </div>
  );
}
