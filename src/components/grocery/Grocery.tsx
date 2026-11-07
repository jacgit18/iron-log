// Loads the components' stylesheets in the order Grocery.tsx imported them before it was split, so the cascade between them is unchanged.
import '../EmptyTiles.js';
import './BulkShare.js';
import './GroceryBoughtTabs.js';
import './GroceryMore.js';
import './GroceryPhoneBar.js';
import './GroceryQuickAdd.js';
import './GroceryRail.js';
import './InventoryRail.js';
import './GroceryStoreChips.js';
import './GroceryTotalBar.js';
import './GrocerySummary.js';
import '../Notice.jsx';
import './GrocerySpend.js';
import './PriceChips.js';
import './ReceiptNames.js';
import './ReceiptScan.js';
import './Receipts.js';
import './SharePicker.js';
import './SharingGroups.js';
import './SplitSection.js';
import './StoreTax.js';
import './StoreMoney.js';
import { useEffect, useMemo, useState } from 'react';
import { useFeature } from '../../features.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { emptyMonth, monthKey } from '../../lib/grocery.js';
import { viewCounts } from '../../lib/groceryBought.js';
import { pageOf } from '../../lib/route.js';
import { navigate, useRoutePath } from '../useRoute.js';
import GroceryBoughtTabs, { type BoughtView } from './GroceryBoughtTabs.js';
import GrocerySpend from './GrocerySpend.js';
import Receipts from './Receipts.js';
import AtHome from './AtHome.js';
import ToGet from './ToGet.js';
import './Grocery.css';
import './GroceryLayout.css';
import './PriceHistory.css';
// Three views (ADR 038, changed by ADR 054 and 079): Shopping is this month's list; Bought is what you ticked this month, with Spending history (what you spent by month and store) as its second switch;
// Inventory is every item you buy, ticked while you have it (a new month keeps last month's ticks). A bought item counts as had. A new month starts with last month’s ticks (ADR 079).
type View = 'shopping' | 'bought' | 'inventory';
const VIEWS: readonly string[] = ['shopping', 'bought', 'inventory'];
const SUBTITLE: Record<View | 'history', string> = { shopping: 'What is left to buy this month, by store.', bought: 'Bought this month. These count as in your inventory. Tap a box to put one back on Shopping.', inventory: 'Your usual items. Tick what you already have.', history: 'What you spent by month and store.' };

export default function Grocery() {
  const g = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const today = useToday(s => s.today);
  const ready = useAppStore(s => s.isReady());
  const nowKey = monthKey(today);
  useEffect(() => { if (ready) useAppStore.getState().carryGroceryTicks(nowKey); }, [ready, nowKey]); // a new month starts with the At home ticks of the last one (ADR 079)
  const [chosen, setChosen] = useState<View>(() => (g.items.length ? 'shopping' : 'inventory')); // nothing to get from an empty list: start where you add
  const [monthOff, setMonthOff] = useState(0); // the month Shopping and Bought are showing, kept when you switch between them
  const [priceFor, setPriceFor] = useState<string | null>(null); // the item whose price field the tick notice's Add price opens on Bought
  const routed = pageOf(useRoutePath(), 'daily/grocery'); // #/daily/grocery/bought/history wins over the default (the old #/daily/grocery/spend lands there)
  const routedView = routed?.split('/')[0] ?? null; // `bought/history` is the Bought view's second switch
  const receiptsOn = useFeature('receipts');
  const showReceipts = routed === 'receipts' && receiptsOn; // the saved receipts page (brief receipt-save-photo): admin only, and a reload of its address falls back to the list for anyone else
  const view = (routedView && VIEWS.includes(routedView) ? routedView : chosen) as View;
  const inner: BoughtView = view === 'bought' && routed === 'bought/history' ? 'history' : 'month';
  const setView = (v: View) => { setChosen(v); navigate(`daily/grocery/${v}`, 'replace'); }; // leaving Bought, or pressing it, starts at This month
  const setInner = (v: BoughtView) => navigate(v === 'history' ? 'daily/grocery/bought/history' : 'daily/grocery/bought', 'replace');
  const counts = useMemo(() => viewCounts(g, months[nowKey] || emptyMonth()), [g, months, nowKey]);
  if (showReceipts) return <section className="panel groc" aria-labelledby="rcs-h"><Receipts /></section>;
  const tab = (v: View, label: string, n?: number) => (
    <button type="button" id={`groc-view-${v}`} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>{label}{n !== undefined && n > 0 ? ` ${n}` : ''}</button>
  );
  return (
    <section className="panel groc" aria-labelledby="groc-h">
      <div className="gtop">
        <h2 id="groc-h">Groceries</h2>
        <div className="seg" role="group" aria-label="Grocery view">
          {tab('shopping', 'Shopping', counts.shopping)}
          {tab('bought', 'Bought', counts.bought)}
          {tab('inventory', 'Inventory')}
        </div>
      </div>
      {view === 'bought' && <GroceryBoughtTabs value={inner} onChange={setInner} />}
      <p className="note gviewsub" id="groc-sub">{SUBTITLE[view === 'bought' && inner === 'history' ? 'history' : view]}</p>
      {view === 'bought' && inner === 'history' ? <GrocerySpend nowKey={nowKey} /> : view === 'shopping' || view === 'bought' ? <ToGet key={view} g={g} months={months} nowKey={nowKey} mode={view} off0={monthOff} onOff={setMonthOff} priceFor={priceFor} onAddPrice={id => { setPriceFor(id); if (id) setView('bought'); }} /> : <AtHome g={g} months={months} nowKey={nowKey} />}
    </section>
  );
}
