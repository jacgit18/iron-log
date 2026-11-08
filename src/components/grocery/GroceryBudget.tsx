import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { budgetStatus } from '../../lib/groceryBudget.js';
import { centsText, money, parseDollars } from '../../lib/grocery.js';
import './GroceryBudget.css';

// The monthly grocery budget (brief grocery-budget): one amount kept in the settings, like the body-weight goal, and a bar of how much of it this month has spent.
// It sits under the summary on Shopping and Bought. Spent includes tax, as the summary does; a plan above the budget is said before anything is bought.
export default function GroceryBudget({ spent, planned }: { spent: number; planned: number }) {
  const budget = useAppStore(s => s.cfg.groceryBudget);
  const setBudget = useAppStore(s => s.setGroceryBudget);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);
  const open = () => { setValue(budget ? centsText(budget) : ''); setBad(false); setEditing(true); };
  const save = () => { const c = parseDollars(value); if (!c || !setBudget(c)) { setBad(true); return; } setEditing(false); };

  if (editing || !budget) {
    if (!editing) return <div className="gbudget"><span className="gbl">Monthly budget</span><button type="button" className="btn sm ghost" id="groc-budget-set" onClick={open}>Set a budget</button></div>;
    return (
      <form className="gbudget" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <label className="gbl" htmlFor="groc-budget-in">Monthly budget</label>
        <span className="gbin">$ <input id="groc-budget-in" type="text" inputMode="decimal" autoFocus value={value} placeholder="400" aria-invalid={bad} aria-describedby={bad ? 'groc-budget-err' : undefined}
          onChange={e => { setValue(e.target.value); setBad(false); }} /></span>
        <button type="submit" className="btn sm primary">Save</button>
        <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
        {budget && <button type="button" className="btn sm ghost" onClick={() => { if (setBudget(null)) setEditing(false); }}>Remove</button>}
        {bad && <p className="note gbwarn" id="groc-budget-err" role="alert">Enter an amount in dollars, like 400 or 425.50.</p>}
      </form>
    );
  }
  const s = budgetStatus(budget, spent, planned);
  const line = s.tone === 'over' ? `${money(s.over)} over budget` : `${money(s.left)} left`;
  return (
    <div className={`gbudget gbudget-${s.tone}`} id="groc-budget" role="status">
      <div className="gbudgetline">
        <span className="gbl">Budget</span>
        <b>{money(spent)} of {money(budget)}</b>
        <span className="gbstate">{line}</span>
        <button type="button" className="btn sm ghost" id="groc-budget-edit" onClick={open}>Edit</button>
      </div>
      <div className="gprog gbbar" aria-hidden="true"><span style={{ width: `${s.pct}%` }} /></div>
      {s.plannedOver > 0 && <p className="note gbwarn">This month’s list is planned {money(s.plannedOver)} over your budget.</p>}
    </div>
  );
}
