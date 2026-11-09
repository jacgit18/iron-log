import { money, tally } from '../../lib/grocery.js';
import './GroceryTotalBar.css';

// The phone's running total (brief groceries-shopping-bought-inventory follow-up, groceries-store-chips-owes): one line and a thin bar that stay above the tab bar while you shop,
// in place of the summary card. It is the status region on a phone, so a tick is announced; the card is that region on a larger screen.
export default function GroceryTotalBar({ t, view, empty }: { t: ReturnType<typeof tally>; view: 'shopping' | 'bought'; empty: string }) {
  if (!t.count) return <p className="note" id="groc-summary" role="status">{empty}</p>;
  return (
    <div className="gtotalbar" id="groc-summary" role="status">
      <div className="gtotalbarline">
        <b>Bought {t.got} of {t.count}</b>
        <span><span className="vh"> · </span>Spent {money(t.spent)}{t.taxed ? ' with tax' : ''}<span className="vh"> · </span>{view === 'shopping' ? `Planned ${money(t.planned)}` : `Still to get ${t.count - t.got}`}</span>
      </div>
      <div className="gprog" aria-hidden="true"><span style={{ width: `${Math.round((t.got / t.count) * 100)}%` }} /></div>
      {t.unpriced > 0 && <><span className="vh"> · </span><p className="note gwarn">{t.unpriced} without a price</p></>}
    </div>
  );
}
