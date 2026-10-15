// The search above a long Experiments list (Workout board and Stretches). `shown` of `total` is announced as the list narrows.
export default function ExperimentSearch({ id, q, onQ, shown, total, what }: { id: string; q: string; onQ: (v: string) => void; shown: number; total: number; what: string }) {
  const filtering = q.trim() !== '';
  return (
    <div className="filterbar" role="search">
      <label className="field" htmlFor={id}>Search<input id={id} type="search" value={q} placeholder="Name or note" onChange={e => onQ(e.target.value)} /></label>
      {filtering && <button type="button" className="btn sm ghost" onClick={() => onQ('')}>Clear</button>}
      <span className="note" role="status">{filtering ? `${shown} of ${total} ${what}` : `${total} ${what}`}</span>
    </div>
  );
}
