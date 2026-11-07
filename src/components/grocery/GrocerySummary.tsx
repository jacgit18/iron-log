import { money, tally } from '../../lib/grocery.js';
import './GrocerySummary.css';

// The summary card over Shopping and Bought (brief groceries-shopping-bought-inventory): three numbers and the progress bar, in place of the one long line.
// Shopping says Bought, Spent and Planned; Bought says how many are bought and how many are still to get. The card is a status region, so a tick is announced.
type Tally = ReturnType<typeof tally>;

function Tile({ label, value, hint, last }: { label: string; value: string; hint?: string; last?: boolean }) {
  return (
    <div className="gsumtile">
      <small>{label}</small>{' '}
      <b>{value}</b>{hint && ' '}
      {hint && <em>{hint}</em>}
      {!last && <span className="vh"> · </span>}
    </div>
  );
}

export default function GrocerySummary({ t, view, empty }: { t: Tally; view: 'shopping' | 'bought'; empty: string }) {
  const spent = money(t.spent);
  if (!t.count) return <p className="note" id="groc-summary" role="status">{empty}</p>;
  return (
    <div className="gsum" id="groc-summary" role="status">
      <div className="gsumtiles">
        <Tile label="Bought" value={`${t.got} of ${t.count}`} />
        <Tile label="Spent" value={spent} hint={t.taxed ? 'with tax' : undefined} />
        {view === 'shopping' ? <Tile label="Planned" value={money(t.planned)} last /> : <Tile label="Still to get" value={String(t.count - t.got)} last />}
      </div>
      <div className="gprog" aria-hidden="true"><span style={{ width: `${Math.round((t.got / t.count) * 100)}%` }} /></div>
      {t.unpriced > 0 && <><span className="vh"> · </span><p className="note gwarn">{t.unpriced} without a price</p></>}
    </div>
  );
}
