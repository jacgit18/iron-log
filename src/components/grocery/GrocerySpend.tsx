import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { money, monthLabel, spendByMonth } from '../../lib/grocery.js';
import { hasSharing, shareByMonth } from '../../lib/grocerySettle.js';
import './GrocerySpend.css';

// What you bought each month: one bar per month (ticked items × price paid), a line at the average of the months you shopped in,
// and the same numbers as text so the chart never carries information alone.
const RANGES = [6, 12] as const;
const whole = (c: number) => (c / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const short = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: 'short' });

export default function GrocerySpend({ nowKey }: { nowKey: string }) {
  const g = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const [count, setCount] = useState<(typeof RANGES)[number]>(6);
  // With sharing on, the bars are your share of what was bought (your own spending), not the whole bill; what you paid is said in the text.
  const split = hasSharing(g);
  const shares = split ? shareByMonth(g, months, nowKey, count) : null;
  const rows = spendByMonth(g, months, nowKey, count).map((r, i) => (shares ? { ...r, spent: shares[i]!.yours } : r));
  const paidTotal = shares ? shares.reduce((a, r) => a + r.paid, 0) : 0;
  const shopped = rows.filter(r => r.bought > 0);
  const total = shopped.reduce((a, r) => a + r.spent, 0);
  const avg = shopped.length ? Math.round(total / shopped.length) : 0;
  const top = shopped.reduce((a, r) => (r.spent > a.spent ? r : a), shopped[0]);
  const max = Math.max(1, avg, ...rows.map(r => r.spent));
  const now = rows[rows.length - 1];
  return (
    <>
      <div className="gspendhead">
        <p className="note" id="groc-spend-summary" role="status">
          {shopped.length
            ? `Average ${money(avg)} a month over ${shopped.length} ${shopped.length === 1 ? 'month' : 'months'} you shopped · This month ${money(now.spent)} so far`
            : 'Tick items on To get and each month’s spending shows up here.'}
        </p>
        <div className="seg" role="group" aria-label="Months shown">
          {RANGES.map(n => <button key={n} type="button" className={count === n ? 'on' : ''} aria-pressed={count === n} onClick={() => setCount(n)}>{n} mo</button>)}
        </div>
      </div>
      {shopped.length > 0 && (
        <>
          <div className="gspend" style={{ ['--avg' as string]: `${(avg / max) * 100}%` }}>
            <div className="gplot">
              <span className="gavg" aria-hidden="true" />
              <ul className="gbars">
                {rows.map(r => (
                  <li key={r.key} className={r.key === nowKey ? 'cur' : ''} style={{ ['--h' as string]: `${(r.spent / max) * 100}%` }}
                    aria-label={`${monthLabel(r.key)}: ${r.bought ? `${money(r.spent)} on ${r.bought} ${r.bought === 1 ? 'item' : 'items'}` : 'nothing bought'}`}>
                    <span className="gval" aria-hidden="true">{r.bought ? whole(r.spent) : ''}</span>
                    <i aria-hidden="true" />
                    <span className="gmo" aria-hidden="true">{short(r.key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="gkey" aria-hidden="true"><i className="kbar" /> Bought <i className="kavg" /> Average {whole(avg)} <i className="kcur" /> This month so far</p>
          <p className="note">Total {money(total)} over {count} months{top ? ` · Most in ${monthLabel(top.key)} (${money(top.spent)})` : ''}. The current month is still filling in.</p>
          {shares && <p className="note" id="groc-spend-share">These are your shares of what was split. You paid {money(paidTotal)} in all over these months.</p>}
        </>
      )}
    </>
  );
}
