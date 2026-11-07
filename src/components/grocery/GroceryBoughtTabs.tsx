import './GroceryBoughtTabs.css';

// The second-level switch under Bought (brief groceries-spending-buttons-quick-add): This month is the Bought page, Spending history is the chart. It swaps the address, so the parent owns the choice.
export type BoughtView = 'month' | 'history';
const TABS: readonly { key: BoughtView; label: string }[] = [{ key: 'month', label: 'This month' }, { key: 'history', label: 'Spending history' }];

export default function GroceryBoughtTabs({ value, onChange }: { value: BoughtView; onChange: (v: BoughtView) => void }) {
  return (
    <div className="gbtabs" role="group" aria-label="Bought view">
      {TABS.map(t => <button key={t.key} type="button" id={`groc-bought-${t.key}`} className={value === t.key ? 'on' : ''} aria-pressed={value === t.key} onClick={() => onChange(t.key)}>{t.label}</button>)}
    </div>
  );
}
