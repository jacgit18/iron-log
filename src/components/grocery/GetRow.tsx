import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { centsText, lineCost, lineOf, money, unitWords } from '../../lib/grocery.js';
import { allPeople, hasSharing, partiesFor, shareText } from '../../lib/grocerySettle.js';
import { hasNoPrice } from '../../lib/groceryChips.js';
import Icon from '../Icon.jsx';
import { COUNT_ERROR, PRICE_ERROR } from './groceryMessages.js';
import { commitPrice, commitQty } from './commitNumber.js';
import { NumBox } from './NumBox.js';
import PriceChips from './PriceChips.js';
import SharePicker from './SharePicker.js';
import type { Grocery as GroceryT, GroceryItem, GroceryMonth } from '../../types.ts';

/* ---------- To get ---------- */
// One line of the shopping list: the whole row ticks it, and the trailing "2 × $3.49" opens the count and price for this month.
export default function GetRow({ g, item, month, mk, future, carries, onGot, open, onOpen, onMove, pick }: { g: GroceryT; item: GroceryItem; month: GroceryMonth; mk: string; future: boolean; carries: boolean; onGot: (on: boolean) => void; open: boolean; onOpen: (on: boolean) => void; onMove: (id: string) => void; pick?: { on: boolean; set: (on: boolean) => void } }) {
  const s = useAppStore.getState();
  const l = lineOf(item, month); const total = lineCost(l); const w = unitWords(item.unit);
  const moreId = `groc-more-${item.id}`;
  const usual = g.items.find(x => x.id === item.id)?.store ?? item.store; // `item` is already under the store it is bought at this month
  const [moveErr, setMoveErr] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (!open) setMoveErr(null); } // a Move to message does not wait for the next time the row opens
  const split = hasSharing(g); const raw = month.lines[item.id]; const people = allPeople(g);
  const pill = l.prices ? `${l.prices.length} × avg ${money(Math.round(total / l.prices.length))}` : l.got && hasNoPrice(l) ? 'Add price' : `${w.qty(l.qty)} × ${l.cents == null ? 'no price' : `${money(l.cents)}${w.per}`}`; // the visible words of the count and price button; its accessible name starts with them
  // Said on every row that is not plain "Just me": the store's group split shows by default, not only after the row is changed (ADR 059 amended 2026-10-23).
  const parties = partiesFor(g, item, raw); // always computed: with no groups it reads Just me, never Not mine
  const customSplit = raw?.packShares?.some(Boolean) ? 'Packs split' : raw?.share || item.share || (split && shareText(parties) !== 'Just me') ? shareText(parties) : '';
  return (
    <li className={`gget${l.got ? ' got' : ''}${pick?.on ? ' picked' : ''}`}>
      <div className="ggetline">
        {pick && <label className="gtickbox"><input type="checkbox" className="chk" aria-label={`Select ${item.n}`} checked={pick.on} onChange={e => pick.set(e.target.checked)} /></label>}
        {/* Only the checkbox ticks (a 44px target of its own): tapping the name opens the count, price and Move to panel, so a stray tap on the row cannot mark it bought. */}
        {!pick && <label className="gtickbox">
          <input type="checkbox" className="chk" id={`groc-${item.id}`} aria-label={`Got ${item.n}`} checked={l.got} disabled={future} onChange={e => onGot(e.target.checked)} />
        </label>}
        <button type="button" className="gtickname gnamebtn" aria-expanded={open} aria-controls={moreId} onClick={() => onOpen(!open)}>
          {item.n}
          {item.note && <small className="gnote">{item.note}</small>}
          {item.store !== usual && <small className="gnote gmoved">Usually {usual || 'Anywhere'}</small>}
          {split && customSplit && <span className="gsplittag gsplitunder">{customSplit}</span>}
        </button>
        <button type="button" className="gqty" aria-expanded={open} aria-controls={moreId} aria-label={`${pill}, ${w.count.toLowerCase()} and price of ${item.n}`} onClick={() => onOpen(!open)}>
          <span className={`gpill${l.cents == null && !l.prices ? ' noprice' : ''}`}>{pill}</span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} />
        </button>
      </div>
      <div className="gmore" id={moreId} hidden={!open}>{open && (<>
          <label className="gfield">{w.count}
            <NumBox label={`${w.count} of ${item.n}`} className="gcount" value={String(l.qty)} error={COUNT_ERROR}
              onCommit={t => commitQty(t, n => s.setGroceryQty(mk, item.id, n))} />
          </label>
          <label className="gfield">{w.price}
            <NumBox label={`${w.price} of ${item.n}, dollars`} className="gprice" value={l.prices ? '' : centsText(l.cents)} error={PRICE_ERROR} disabled={!!l.prices && !item.unit}
              onCommit={t => commitPrice(t, c => s.setGroceryCents(mk, item.id, c))} />
          </label>
          {l.prices && !item.unit && <span className="note">Each pack has its own price, below. Remove them to set one price.</span>}
          {g.stores.length > 0 && (
            <label className="gfield">Move to
              <select id={`groc-store-${item.id}`} aria-label={`Store for ${item.n} this month`} value={item.store}
                onChange={e => { onMove(item.id); setMoveErr(s.setGroceryLineStore(mk, item.id, e.target.value)); }}>
                <option value="">Anywhere</option>
                {g.stores.map(x => <option key={x} value={x}>{x}</option>)}
                {item.store && !g.stores.includes(item.store) && <option value={item.store}>{item.store} (removed)</option>}
              </select>
            </label>
          )}
          {item.store !== usual && (
            <button type="button" className="btn sm ghost gusual" aria-label={`Make ${item.store || 'Anywhere'} its usual store for ${item.n}`} onClick={() => setMoveErr(s.makeGroceryStoreUsual(mk, item.id))}>Make {item.store || 'Anywhere'} its usual store</button>
          )}
          {moveErr && <p className="note gerr" role="alert">{moveErr}</p>}
          {!item.unit && <PriceChips name={item.n} prices={l.prices} onChange={p => s.setGroceryPrices(mk, item.id, p)} />}
          {split && !l.prices && <SharePicker name={item.n} people={people} parties={partiesFor(g, item, raw)} own={!!raw?.share} hint={carries ? (future ? 'Saved as the usual from now on: it also changes this month’s items you have not bought yet.' : 'Saved as the usual for next month too.') : undefined} resetLabel={carries ? 'Back to the store’s split' : undefined} onChange={sh => s.setGroceryLineShare(mk, item.id, sh)} />}
          {split && l.prices?.map((c, i) => (
            <div key={i} className="gpackshare"><span>Pack {i + 1}, {money(c)}</span>
              <SharePicker name={`${item.n} pack ${i + 1}`} people={people} parties={partiesFor(g, item, raw, i)} own={!!raw?.packShares?.[i]} onChange={sh => s.setGroceryPackShare(mk, item.id, i, sh)} />
            </div>
          ))}
          <span className="gtotal" aria-label={`Total for ${item.n}`}>{l.cents == null && !l.prices ? '' : money(total)}</span>
          {!future && !l.got && <button type="button" className="btn sm ghost gtake" aria-label={`I have this: ${item.n}`} onClick={() => s.takeGroceryOff(mk, item.id)}>I have this</button>}
      </>)}</div>
    </li>
  );
}
