import { useMemo, useRef, useState } from 'react';
import { NEW_STORE, addedText, applyPlan, checkText, createStaged, isStaged, matchStore, movedText, moveNote, movesText, planReceipt, proposeItem, remapPlan, restoreSnapshot, stageDraft, stagedAt, takeSnapshot, type Choice, type ItemDraft, type Staged } from '../../lib/groceryReceipt.js';
import { MAX_STORES, RESERVED_STORE, isReservedName, money, monthLabel } from '../../lib/grocery.js';
import { groupLines, mergeNote, rowAsLine } from '../../lib/receiptGroup.js';
import { missingIntro, reconcile, untickedText } from '../../lib/receiptReconcile.js';
import { cleanStoreName } from '../../lib/receiptStoreName.js';
import { keepMeta, type KeepMeta } from '../../lib/receiptsClient.js';
import type { Receipt } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import type { Applied } from './ReceiptScan.js';
import './ReceiptScan.css';

// The receipt review sheet (brief receipt-scan): each line with the item it matched, its quantity and its price after any discount; change a match, untick a
// line, check the total, then Apply. The plan and the checks are pure (lib/groceryReceipt.ts); this only holds the choices. Nothing is written before Apply.
// A line with no item can be added to the list (brief receipt-add-item): the item is staged here, shown as New, and created only at Apply.
export default function ReceiptSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const g = useAppStore(s => s.grocery);
  const receipt = modal?.receipt as Receipt | undefined;
  const mk = String(modal?.mk ?? '');
  const onApplied = modal?.onApplied as ((a: Applied) => void) | undefined;
  const canKeep = !!modal?.image; // the photo is held by Scan receipt only for an account that has Receipts (brief receipt-save-photo)
  const onKeep = modal?.onKeep as ((meta: KeepMeta) => void) | undefined;
  const [keep, setKeep] = useState(false); // off for every receipt: nothing is uploaded unless this is ticked and Apply is pressed
  const [separate, setSeparate] = useState<ReadonlySet<string>>(() => new Set()); // brief receipt-merge-lines: text keys whose lines the person split back into their own rows (sheet only)
  const [choices, setChoices] = useState<Choice[]>(() => (receipt?.lines ?? []).map(l => ({ itemId: l.matchId, include: !!l.matchId }))); // the lines of one row share a match (groupLines), so they start with one choice
  const [pickedStore, setPickedStore] = useState('');
  const [usual, setUsual] = useState<boolean | null>(null); // null until the box is touched: then ticked only when every moved item has no usual store; ticked, Apply also makes the receipt's store the items' usual store
  const monthLines = useAppStore(s => s.groceryMonths[mk]?.lines);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set()); // brief receipt-reconcile-ticked: ticked items the receipt does not show that the person chose to untick (off for every receipt)
  const [stagedRaw, setStaged] = useState<Staged[]>([]);
  const [form, setForm] = useState<{ line: number; draft: ItemDraft; error: string } | null>(null); // one form open at a time
  const seq = useRef(0);
  const [addOn, setAddOn] = useState(true); // brief receipt-add-store: ticked by default, and only offered when the receipt names a store the list does not have
  const [storeError, setStoreError] = useState(''); // the store could not be added: Apply stops here and nothing else is written
  const [typedName, setTypedName] = useState<string | null>(null); // null: the tidied name read from the photo, untouched
  const known = receipt ? matchStore(receipt.store, g.stores) : null;
  const cleaned = cleanStoreName(receipt?.store);
  const offer = !!receipt && !known && !!cleaned && receipt.lines.length > 0 && g.stores.length < MAX_STORES && !pickedStore; // picking a store in the list instead hides the box
  const nameText = (typedName ?? cleaned ?? '').trim().replace(/\s+/g, ' ');
  const sameName = g.stores.find(s => s.toLowerCase() === nameText.toLowerCase());
  const addStore = offer && addOn && nameText ? (sameName ?? nameText) : null;
  const taxStore = known ?? addStore ?? (pickedStore || null);
  const staged = useMemo(() => stagedRaw.map(x => stagedAt(x, addStore)), [stagedRaw, addStore]); // an item added to the store this receipt adds follows its name, and falls back to Anywhere if the box is unticked
  const base = useMemo(() => (receipt ? planReceipt(receipt, choices, g.items, taxStore, staged, { at: taxStore, makeUsual: usual, g, lines: monthLines ?? {} }) : null), [receipt, choices, g, taxStore, staged, usual, monthLines]);
  const newStore = addStore && !sameName ? addStore : null; // the store Apply will create
  const nameError = newStore ? (isReservedName(newStore) ? RESERVED_STORE : storeError) : '';
  const rec = useMemo(() => (base ? reconcile(base, choices, g.items, monthLines ?? {}, taxStore) : null), [base, choices, g.items, monthLines, taxStore]);
  const plan = useMemo(() => (base && rec ? { ...base, untick: rec.missing.filter(m => unticked.has(m.id)).map(m => m.id) } : null), [base, rec, unticked]); // an item the person re-included leaves the missing list, so its Untick no longer counts
  const rows = useMemo(() => groupLines(receipt?.lines ?? [], separate), [receipt, separate]);
  if (!receipt || !plan || !rec) return null;

  const check = checkText(plan.check);
  const dateMonth = receipt.date ? receipt.date.slice(0, 7) : null;
  const setChoice = (lines: readonly number[], patch: Partial<Choice>) => setChoices(cs => cs.map((c, j) => (lines.includes(j) ? { ...c, ...patch } : c)));
  const stagedUsed = new Set(plan.steps.flatMap(s => (s.kind === 'tax' ? [] : [s.id])));
  const newCount = staged.filter(x => stagedUsed.has(x.id)).length;
  const openForm = (i: number) => setForm({ line: i, draft: proposeItem(rowAsLine(rows[i]!, receipt.lines), receipt.store, g.stores, newStore ? NEW_STORE : taxStore ?? ''), error: '' });
  const setDraft = (patch: Partial<ItemDraft>) => setForm(f => (f ? { ...f, draft: { ...f.draft, ...patch }, error: '' } : f));
  const stage = () => {
    if (!form) return;
    const atNew = form.draft.store === NEW_STORE && !!newStore; // only when the choice was showing it: a renamed-to-existing or unticked store left the screen on Anywhere
    const r = stageDraft(form.draft.store === NEW_STORE ? { ...form.draft, store: atNew ? newStore : '' } : form.draft, g.items, staged, `new:${++seq.current}`);
    if (!r.ok) { setForm({ ...form, error: r.error }); return; }
    setStaged(xs => [...xs, atNew ? { ...r.item, atNew: true } : r.item]);
    setChoice(rows[form.line]!.lines, { itemId: r.item.id, include: true });
    setForm(null);
  };
  const unstage = (id: string) => {
    setStaged(xs => xs.filter(x => x.id !== id));
    setChoices(cs => cs.map(c => (c.itemId === id ? { itemId: null, include: false } : c)));
  };
  const apply = () => {
    if (newStore) { const err = useAppStore.getState().addGroceryStore(newStore); if (err) { setStoreError(err); return; } } // before the items, so a new item bought there finds the store; a store that cannot be made stops Apply with nothing written
    const made = createStaged(plan, staged, { addGroceryItem: useAppStore.getState().addGroceryItem, items: () => useAppStore.getState().grocery.items });
    const real = remapPlan(plan, made.ids);
    const st = useAppStore.getState(); // read after the items were made
    const month = st.groceryMonths[mk];
    const snap = takeSnapshot(real, mk, month?.lines ?? {}, st.grocery.items, month?.tax, made.created.map(x => made.ids[x.id]!));
    if (newStore) snap.addedStore = newStore;
    const out: { refused: string[]; unticked?: number } = { refused: [] };
    const done = applyPlan(real, mk, st, out);
    const storeText = newStore ? ` Added the store ${newStore}.` : '';
    closeModal();
    if (keep && canKeep) onKeep?.(keepMeta(receipt, mk));
    if (done > 0 || out.unticked || real.taxStore || made.created.length || made.refused.length) onApplied?.({ text: done === 0 && out.unticked && !real.taxStore ? `Moved ${out.unticked} ${out.unticked === 1 ? 'item' : 'items'} back to to-get for ${monthLabel(mk)}.${addedText(made.created, made.refused)}` : `Applied ${done} ${done === 1 ? 'item' : 'items'}${real.taxStore ? ` and ${real.taxStore} tax` : ''} for ${monthLabel(mk)}.${movedText(real.moves, real.makeUsual, out.refused)}${storeText}${addedText(made.created, made.refused)}${untickedText(out.unticked ?? 0)}`, undo: () => restoreSnapshot(snap, useAppStore.getState()) });
  };
  const unitOf = (i: number) => (receipt.lines[i]!.unit ? ` ${receipt.lines[i]!.unit}` : '');
  const nothing = plan.steps.length === 0 && plan.untick.length === 0;
  const shown = new Set<string>(); // one Was → Now note per item, under the first row that names it
  const moved = (id: string | null) => (id ? plan.moves.find(m => m.id === id) : undefined);
  const words = movesText(plan.moves);
  return (
    <Sheet className="rcsheet">
      <h2 className="cond">Receipt</h2>
      <p className="rcmeta">
        {receipt.store && <span>Store <b>{receipt.store}</b></span>}
        {receipt.date && <span>Dated <b>{receipt.date}</b></span>}
        <span>Applies to <b>{monthLabel(mk)}</b></span>
      </p>
      {dateMonth && dateMonth !== mk && <p className="note rcwarn" role="status">This receipt is dated {monthLabel(dateMonth)}, but you are on {monthLabel(mk)}. Close this sheet and change the month first if that is not what you want.</p>}
      {offer && (
        <div className="rcaddstore">
          <label className="rckeep" htmlFor="rc-add-on"><input id="rc-add-on" type="checkbox" checked={addOn} onChange={e => setAddOn(e.target.checked)} />
            <span>Add this store to your stores<small>Read from the photo as "{receipt.store}". Nothing is saved until Apply; Undo removes it again.</small></span>
          </label>
          {addOn && (
            <label className="field" htmlFor="rc-add-store">Store name
              <input id="rc-add-store" type="text" maxLength={40} value={typedName ?? cleaned ?? ''} onChange={e => { setTypedName(e.target.value); setStoreError(''); }} aria-describedby={nameError ? 'rc-add-store-err' : undefined} />
              {nameError && <small className="rcwarn" id="rc-add-store-err" role="alert">{nameError}</small>}
            </label>
          )}
        </div>
      )}
      {!known && receipt.lines.length > 0 && (
        <label className="field" htmlFor="rc-store">Store for this receipt {receipt.store ? `("${receipt.store}" is not on your list)` : ''}
          <select id="rc-store" value={pickedStore} onChange={e => setPickedStore(e.target.value)}>
            <option value="">Do not set the store or the tax</option>
            {g.stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      )}
      <div className={`rccheck${check.ok ? '' : ' bad'}`} role="status">
        <div className="rcnums"><span>Lines {money(plan.check.linesCents)}</span><span>Tax {money(plan.check.taxCents)}</span>{plan.check.totalCents !== null && <span>Receipt total {money(plan.check.totalCents)}</span>}</div>
        <small>{check.text}</small>
      </div>
      <ul className="rclines" aria-label="Receipt lines">
        {rows.map((l, i) => {
          const c = choices[l.lines[0]!]!;
          const merged = l.lines.length > 1;
          const note = l.lines.map(j => plan.notes[j]).find(Boolean);
          const isNew = isStaged(c.itemId);
          const off = !c.itemId || !c.include;
          const priced = l.grossCents > 0;
          const cmp = !off && c.itemId && !shown.has(c.itemId) ? rec.compare[c.itemId] : undefined;
          if (cmp) shown.add(cmp.id);
          return (
            <li key={l.lines.join("-")} className={`rcrow${off ? ' rcoff' : ''}`}>
              <label className="rctick"><input type="checkbox" checked={!!c.itemId && c.include} disabled={!c.itemId || !priced} onChange={e => setChoice(l.lines, { include: e.target.checked })} aria-label={`Include ${l.text}`} /></label>
              <span className="rctext">{l.text}</span>
              <select aria-label={`Item for ${l.text}`} value={c.itemId ?? ''} disabled={!priced} onChange={e => { if (form?.line === i) setForm(null); setChoice(l.lines, { itemId: e.target.value || null, include: !!e.target.value }); }}>
                <option value="">Not on your list</option>
                {g.items.map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
                {staged.map(x => <option key={x.id} value={x.id}>{x.n} (new)</option>)}
              </select>
              {isNew && <span className="rcpill">New</span>}
              {isNew && <button type="button" className="btn sm ghost rcunstage" aria-label={`Remove new item for ${l.text}`} onClick={() => unstage(c.itemId!)}>Remove</button>}
              {!c.itemId && priced && form?.line !== i && <button type="button" className="btn sm rcaddbtn" aria-label={`Add to list: ${l.text}`} onClick={() => openForm(i)}>Add to list</button>}
              <span className="rcqty">{l.qty}{unitOf(l.lines[0]!)}</span>
              <span className="rcnet">{l.discountCents > 0 && <s>{money(l.grossCents)}</s>}{money(l.netCents)}</span>
              {merged && (
                <span className="note rcnote rcmerge">
                  {mergeNote(l)}
                  <button type="button" className="rclink" aria-label={`Show these lines separately: ${l.text}`} onClick={() => { if (form) setForm(null); setSeparate(x => new Set([...x, l.key])); }}>Show these lines separately</button>
                </span>
              )}
              {cmp && <span className="note rcnote rcwas"><span className={`rctag${cmp.same ? ' rcsame' : ''}`}>{cmp.label}</span>Was <b>{cmp.was}</b>, now <b>{cmp.now}</b></span>}
              {note && <span className="note rcwarn rcnote">{note}</span>}
              {!off && moved(c.itemId) && <span className="note rcnote rcatnote">{moveNote(moved(c.itemId)!)}</span>}
              {form?.line === i && (
                <div className="rcnew" role="group" aria-label={`Add to your list: ${l.text}`}>
                  <label className="field">Name<input id="rc-new-name" value={form.draft.n} maxLength={80} onChange={e => setDraft({ n: e.target.value })} /></label>
                  <label className="field">Store
                    <select id="rc-new-store" value={form.draft.store === NEW_STORE && !newStore ? '' : form.draft.store} onChange={e => setDraft({ store: e.target.value })}>
                      <option value="">Anywhere</option>
                      {newStore && <option value={NEW_STORE}>{newStore} (new)</option>}
                      {g.stores.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="field">{form.draft.unit ? `Weight (${form.draft.unit})` : 'Count'}<input id="rc-new-qty" inputMode="decimal" value={form.draft.qty} onChange={e => setDraft({ qty: e.target.value })} /></label>
                  <label className="field">{form.draft.unit ? `Price per ${form.draft.unit} (dollars)` : 'Price (dollars)'}<input id="rc-new-price" inputMode="decimal" value={form.draft.price} onChange={e => setDraft({ price: e.target.value })} /></label>
                  {form.error && <p className="note rcwarn rcformerr" role="alert">{form.error}</p>}
                  <div className="actions">
                    <button type="button" className="btn ghost" id="rc-new-cancel" onClick={() => setForm(null)}>Not now</button>
                    <button type="button" className="btn primary" id="rc-new-add" onClick={stage}>Add item</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {rec.missing.length > 0 && (
        <div className="rcmiss" role="group" aria-label="Marked bought, but not on this receipt">
          <h3 className="cond">Marked bought, but not on this receipt</h3>
          <p className="note">{missingIntro(rec)}</p>
          <ul>
            {rec.missing.map(m => (
              <li key={m.id}>
                <label className="rcuntick"><input type="checkbox" checked={unticked.has(m.id)} onChange={e => setUnticked(x => { const n = new Set(x); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} aria-label={`Move back to to-get: ${m.name}`} /><span>Move back to to-get</span></label>
                <span className="rcmisswhat">{m.name}<small>Marked bought: {m.held}</small></span>
                <span className="rcmissstate">{unticked.has(m.id) ? 'Will move back to to-get' : 'Stays bought'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {words.summary && (
        <div className="rcbought">
          <p className="note" role="status">{words.summary}</p>
          {words.split && <p className="note rcwarn" role="status">{words.split}</p>}
          <label className="rckeep" htmlFor="rc-usual">
            <input id="rc-usual" type="checkbox" checked={plan.makeUsual} onChange={e => setUsual(e.target.checked)} />
            <span>Also make {plan.moves[0]!.to} the usual store for these items<small>Changes where they are listed on At home. Undo puts it back.</small></span>
          </label>
          <p className="note" role="status">{plan.makeUsual ? `At home will list these under ${plan.moves[0]!.to}.` : `At home stays as it is. Tick the box to list these under ${plan.moves[0]!.to} there.`}</p>
        </div>
      )}
      <p className="note">Existing prices on the ticked items are replaced. Lines that are not on your list are skipped and count only in the total check, unless you add them with Add to list.</p>
      <div className="rcfoot">
        {canKeep && (
          <label className="rckeep" htmlFor="rc-keep">
            <input id="rc-keep" type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} />
            <span>Keep a copy of this photo<small>Saved under Receipts. Only you can see it, and you can delete it any time.</small></span>
          </label>
        )}
        <p className="note">{plan.items} {plan.items === 1 ? 'item' : 'items'}, {money(plan.itemsCents)}{plan.taxStore ? ` + ${plan.taxStore} tax ${money(plan.check.taxCents)}` : ''}{newCount > 0 ? `. ${newCount} new ${newCount === 1 ? 'item' : 'items'} will be added.` : ''}{plan.untick.length > 0 ? `. ${plan.untick.length} will move back to to-get.` : ''}</p>
        <div className="actions">
          <button type="button" className="btn" id="rc-cancel" onClick={closeModal}>Cancel</button>
          <button type="button" className="btn primary" id="rc-apply" disabled={nothing || !!nameError} onClick={apply}>{plan.items === 0 && plan.untick.length > 0 && !plan.taxStore ? `Move ${plan.untick.length} ${plan.untick.length === 1 ? 'item' : 'items'} back to to-get` : `Apply ${plan.items} ${plan.items === 1 ? 'item' : 'items'}`}</button>
        </div>
      </div>
    </Sheet>
  );
}
