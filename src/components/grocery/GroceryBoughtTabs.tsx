import SubNav from '../SubNav.js';
import './GroceryBoughtTabs.css';

// The second-level switch under Bought (brief groceries-spending-buttons-quick-add): This month is the Bought page, Spending history is the chart. It swaps the address, so the parent owns the choice.
export type BoughtView = 'month' | 'history';
const TABS = [{ key: 'month', label: 'This month', id: 'groc-bought-month' }, { key: 'history', label: 'Spending history', id: 'groc-bought-history' }] as const;

export default function GroceryBoughtTabs({ value, onChange }: { value: BoughtView; onChange: (v: BoughtView) => void }) {
  return <SubNav className="gbtabs" label="Bought view" items={TABS} value={value} onChange={k => onChange(k as BoughtView)} />;
}
