import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { MAX_NOTE, UNITS, centsText, storeChoices, unitWords } from '../../lib/grocery.js';
import { allPeople, hasSharing, partiesFor, shareText } from '../../lib/grocerySettle.js';
import ArmedButton from '../ArmedButton.jsx';
import Icon from '../Icon.jsx';
import ReceiptNames from './ReceiptNames.js';
import SharePicker from './SharePicker.js';
import type { Grocery as GroceryT, GroceryItem, GroceryUnit } from '../../types.ts';
import { COUNT_ERROR, PRICE_ERROR } from './groceryMessages.js';
import { commitPrice, commitQty } from './commitNumber.js';
import { NumBox } from './NumBox.js';
import './GroceryOneTime.css';

export default function EditRow({ item, g, have, onHave, adjust, open, onOpen, onMove, onRemoved }: { item: GroceryItem; g: GroceryT; have: boolean; onHave: (on: boolean) => void; adjust: boolean; open: boolean; onOpen: (on: boolean) => void; onMove: (id: string) => void; onRemoved: (id: string) => void }) {
  const s = useAppStore.getState();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(item.n);
  const [arming, setArming] = useState(false); // Remove was pressed once
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) { setName(item.n); setErr(null); } } // a rejected rename and its message do not outlive the open row
  const { mine, suggested } = storeChoices(g);
  const split = hasSharing(g);
  const w = unitWords(item.unit);
  const usualPrice = item.unit ? `Usual price per ${item.unit}` : 'Usual price each'; // this box sets the item's usual price; To get's Price each is this month's
  // One tree for closed and open, with the arrow in the same place in it, so it keeps keyboard focus when the row opens or closes. The arrow is the one
  // toggle (aria-expanded); the name beside it is a shortcut when closed and the name field when open.
  const shut = !open;
  return (
    <li className={shut ? 'gedit gedshut' : `gedit${arming ? ' removing' : ''}`}>
      <input type="checkbox" className="chk gedithave" aria-label={`Have ${item.n}`} checked={have} onChange={e => onHave(e.target.checked)} />
      {shut
        ? <button type="button" className="gedname" onClick={() => onOpen(true)}>{item.n}{item.note && <small className="gnote">{item.note}</small>}</button>
        : <input type="text" className="gname" aria-label={`Name of ${item.n}`} maxLength={80} value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== item.n) setErr(s.updateGroceryItem(item.id, { n: name })); else setName(item.n); }} />}
      {shut && item.unit && <span className="gchip">by the {item.unit}</span>}
      {shut && split && item.share && <span className="gsplittag">{shareText(partiesFor(g, item))}</span>}
      <button type="button" className="garrow" id={`groc-edit-arrow-${item.id}`} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${item.n}`} onClick={() => onOpen(!open)}><Icon name={open ? 'chevron-up' : 'chevron-down'} /></button>
      {open && (<>
        <div className="gedrow">
          <input type="text" className="gnoteinput" aria-label={`Note for ${item.n}`} placeholder="Note (optional)" maxLength={MAX_NOTE} key={item.note ?? ''} defaultValue={item.note ?? ''}
            onBlur={e => { if (e.target.value.trim() !== (item.note ?? '')) setErr(s.updateGroceryItem(item.id, { note: e.target.value })); }} />
          <select id={`groc-edit-store-${item.id}`} aria-label={`Store for ${item.n}`} value={item.store} onChange={e => { onMove(item.id); setErr(s.updateGroceryItem(item.id, { store: e.target.value })); }}>
            <option value="">Anywhere</option>
            {mine.map(x => <option key={x} value={x}>{x}</option>)}
            {suggested.length > 0 && <optgroup label="Suggested">{suggested.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>}
            {item.store && !mine.includes(item.store) && !suggested.includes(item.store) && <option value={item.store}>{item.store} (removed)</option>}
          </select>
        </div>
        <select className="gunit" aria-label={`Sold by, for ${item.n}`} value={item.unit ?? ''} onChange={e => setErr(s.updateGroceryItem(item.id, { unit: e.target.value as GroceryUnit | '' }))}>
          <option value="">Each</option>
          {UNITS.map(u => <option key={u} value={u}>by the {u}</option>)}
        </select>
        <div className="gedrow">
          <label className="gfield">{w.count}
            <NumBox label={`${w.count} of ${item.n}`} className="gcount" value={String(item.qty)} error={COUNT_ERROR}
              onCommit={t => commitQty(t, n => setErr(s.updateGroceryItem(item.id, { qty: n })))} />
          </label>
          <label className="gfield">{usualPrice}
            <NumBox label={`${usualPrice} of ${item.n}, dollars`} className="gprice" value={centsText(item.cents)} error={PRICE_ERROR}
              onCommit={t => commitPrice(t, c => setErr(s.updateGroceryItem(item.id, { cents: c })))} />
          </label>
        </div>
        <label className="gonetime"><input type="checkbox" className="chk" checked={!!item.oneTime} onChange={e => setErr(s.updateGroceryItem(item.id, { oneTime: e.target.checked }))} /> One-time item <span className="note">Leaves Inventory and next month’s list after you buy it.</span></label>
        <ReceiptNames item={item} />
        {split && (adjust || !!item.share) && <SharePicker name={item.n} people={allPeople(g)} parties={partiesFor(g, item)} own={!!item.share} onChange={sh => s.setGroceryItemShare(item.id, sh)} />}
        <ArmedButton className={`btn sm ${arming ? 'danger' : 'ghost'}`} aria-label={`Remove ${item.n} from your list`} label="Remove" armedLabel="Tap again to remove" onArmedChange={setArming} onConfirm={() => { setArming(false); onRemoved(item.id); onOpen(false); s.removeGroceryItem(item.id); }} />
        {err && <p className="note gerr" role="alert">{err}</p>}
      </>)}
    </li>
  );
}
