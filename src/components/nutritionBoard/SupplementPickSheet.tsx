import { longDay, shortDay, suppPickList } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './EatenRows.css';

// The Add supplement picker (brief nutrition-items-row-sheet-and-more): the supplements in your library with no time of day, one tap each to tick one as taken on that day (Add supplement, pick: two taps). Ones with a time of day are already on the board with their own tick.
// A supplement that is not in the library yet goes through the one add sheet (+ New supplement); Manage keeps the library. `day` is the day it ticks for.
export default function SupplementPickSheet({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const closeModal = useAppStore(s => s.closeModal);
  const list = suppPickList(supp, day);
  const st = () => useAppStore.getState();
  const pick = (id: string) => { st().setSupplementTaken(day, id, true); closeModal(); };
  return (
    <Sheet className="nbsheet" aria-label={`Add supplement, ${longDay(day)}`}>
      <h2 className="cond">Add supplement · {shortDay(day)}</h2>
      {list.length > 0 ? (
        <>
          <p className="note">Pick one you took. It is ticked for {longDay(day)}.</p>
          <ul className="nb-suppick" aria-label="Supplements with no time of day">
            {list.map(i => <li key={i.id}><button type="button" className="btn" onClick={() => pick(i.id)}>{i.n}{i.dose ? ` · ${i.dose}` : ''}</button></li>)}
          </ul>
        </>
      ) : <p className="note">{supp.items.length === 0 ? 'No supplements yet.' : 'Every supplement you have is already on the board with a time of day, or taken today.'} Add a new one, or set times in Manage.</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={() => st().openModal({ type: 'suppadd' })}>+ New supplement</button>
        <button type="button" className="btn" onClick={() => st().openModal({ type: 'nbmanage' })}>Manage</button>
        <button type="button" className="btn primary" onClick={closeModal}>Close</button>
      </div>
    </Sheet>
  );
}
