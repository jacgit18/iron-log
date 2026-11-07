import { useMemo, useState } from 'react';
import { money, monthLabel, monthKey, unitWords } from '../../lib/grocery.js';
import { itemHistory, shortMonth, type Purchase } from '../../lib/itemHistory.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './PriceHistory.css';

// The price and place history of one At home item (brief grocery-price-history): average and most-used store, a small price line from three priced purchases,
// then every purchase newest first, the first 12 and Show older for the rest. Read-only; the rules are in lib/itemHistory.ts.
const SHOWN = 12;
export default function PriceHistorySheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const item = useAppStore(s => s.grocery.items.find(i => i.id === modal?.id));
  const months = useAppStore(s => s.groceryMonths);
  const [older, setOlder] = useState(false);
  const h = useMemo(() => (item ? itemHistory(item, months) : null), [item, months]);
  if (!modal || !item || !h) return null;
  const now = monthKey(new Date());
  const w = unitWords(item.unit);
  const rows = older ? h.purchases : h.purchases.slice(0, SHOWN);
  return (
    <Sheet className="phsheet">
      <h2 className="cond">{item.n}</h2>
      {!h.purchases.length ? (
        <p className="note">Nothing bought yet. Prices and stores show here after you tick this item bought or apply a receipt.</p>
      ) : (<>
        <dl className="phsum">
          <div><dt>Average {w.per ? `per ${item.unit}` : 'each'}</dt><dd>{h.averageEach == null ? 'No prices saved' : money(h.averageEach)}</dd></div>
          <div><dt>Bought most often at</dt><dd>{h.topStore || 'Anywhere'}</dd></div>
        </dl>
        <PriceLine purchases={h.purchases} now={now} />
        <ul className="phlist">
          {rows.map(p => {
            const cheapest = p.each != null && p.each === h.cheapestEach && h.priced > 1;
            return (
              <li key={p.month} className="phrow">
                <span className="phmo">{shortMonth(p.month, now)}</span>
                <span className="phwhere">{p.store || 'Anywhere'}<small>{detail(p, w.per, w.qty)}</small></span>
                <span className="phprice">{p.each == null ? '' : money(p.each) + w.per}{cheapest && <span className="phcheap">Cheapest</span>}</span>
              </li>
            );
          })}
        </ul>
        {!older && h.purchases.length > SHOWN && <button type="button" className="btn" id="ph-older" onClick={() => setOlder(true)}>Show older ({h.purchases.length - SHOWN})</button>}
        <p className="note">Price {w.per ? `per ${item.unit}` : 'each'}; packs use their average. Months with no price are listed but not counted.</p>
      </>)}
      <div className="actions"><button type="button" className="btn" id="ph-close" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}

function detail(p: Purchase, per: string, qty: (q: number) => string): string {
  if (p.each == null) return 'No price saved';
  if (p.prices) return `${p.prices.map(money).join(' + ')} (${p.prices.length} packs)`;
  return `${qty(p.qty)} × ${money(p.each)}${per}`;
}

/** A small line of the last 12 priced purchases, oldest to newest; drawn only from three. The text below it says the same in words for a screen reader. */
function PriceLine({ purchases, now }: { purchases: readonly Purchase[]; now: string }) {
  const pts = purchases.filter(p => p.each != null).slice(0, SHOWN).reverse();
  if (pts.length < 3) return null;
  const v = pts.map(p => p.each as number), lo = Math.min(...v), hi = Math.max(...v), W = 300, H = 56, pad = 6;
  const xy = v.map((c, i) => [pad + (i * (W - 2 * pad)) / (v.length - 1), H - pad - (hi === lo ? 0.5 : (c - lo) / (hi - lo)) * (H - 2 * pad)] as const);
  return (
    <svg className="phline" viewBox={`0 0 ${W} ${H + 16}`} role="img" aria-label={`Price from ${money(v[0]!)} in ${monthLabel(pts[0]!.month)} to ${money(v[v.length - 1]!)} in ${monthLabel(pts[pts.length - 1]!.month)}`}>
      <path d={xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {xy.map((p, i) => <circle key={pts[i]!.month} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={i === xy.length - 1 ? 4 : 2.5} fill="currentColor" />)}
      <text x="0" y={H + 13}>{shortMonth(pts[0]!.month, now)}</text>
      <text x={W} y={H + 13} textAnchor="end">{shortMonth(pts[pts.length - 1]!.month, now)}</text>
    </svg>
  );
}
