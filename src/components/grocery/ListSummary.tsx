import './ListSummary.css';

/* ---------- List summary ---------- */
// One line above a grocery list: how many rows are on screen, and one Show details / Hide details button for all of them (replaces the button on every store heading).
// `all` is true when every row on screen is open. Same words on Shopping, Bought and Inventory in Edit mode.
export default function ListSummary({ text, all, onToggle }: { text: string; all: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="glistsum">
      <b id="groc-listsum" role="status">{text}</b>
      <button type="button" className="btn sm ghost" id="groc-details-all" aria-label={`${all ? 'Hide' : 'Show'} details on all rows`} onClick={() => onToggle(!all)}>{all ? 'Hide details' : 'Show details'}</button>
    </div>
  );
}
