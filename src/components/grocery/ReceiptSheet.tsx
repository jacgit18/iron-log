import { useEffect, useMemo, useRef, useState } from 'react';
import { NEW_STORE, addedText, applyPlan, checkText, createStaged, isStaged, matchStore, movedText, moveNote, movesText, paidAfterRewards, parseRewards, planReceipt, proposeItem, receiptTotal, remapPlan, restoreSnapshot, stageDraft, stagedAt, takeSnapshot, withRewards, withoutReceiptMoney, type Choice, type ItemDraft, type Staged } from '../../lib/groceryReceipt.js';
import { aliasAddsFor, applyNames, movedFrom, resolveName, savedNamesText, type RowEdit } from '../../lib/groceryAliases.js';
import { madeFoodsText } from '../../lib/foodFromItem.js';
import { MAX_STORES, RESERVED_STORE, centsText, isReservedName, money, monthLabel, withoutUsed } from '../../lib/grocery.js';
import { duplicateOf, freshKey } from '../../lib/groceryLedger.js';
import { allPeople, hasSharing } from '../../lib/grocerySettle.js';
import { groupLines, mergeNote, rowAsLine } from '../../lib/receiptGroup.js';
import { ME } from '../../lib/grocerySplit.js';
import { NO_CHOICES, applyShares, isOwnRow, owedRows, owedText, rowParties, setRow, setWhole, shareForRow, shareWrites, tickedRows, wholeParties, wholeIsSet, type ShareChoices } from '../../lib/receiptShare.js';
import { earlierText, missingIntro, reconcile, untickedText } from '../../lib/receiptReconcile.js';
import { cleanStoreName } from '../../lib/receiptStoreName.js';
import { keepMeta, type KeepMeta } from '../../lib/receiptsClient.js';
import { claimResult, claimThenApply } from '../../lib/receiptToLog.js';
import { leaveSheet, setLeaveGuard } from '../../lib/backNav.js';
import { dropDraft, isEdited, keepDraft, newDraftId, shouldAskOnBack, type Draft } from '../../lib/receiptDraft.js';
import { askSharing } from '../../lib/sharingIntent.js';
import type { Receipt } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import { navigate } from '../useRoute.js';
import ReceiptApplyBar from './ReceiptApplyBar.js';
import ReceiptLeave from './ReceiptLeave.js';
import ReceiptLineName from './ReceiptLineName.js';
import { ReceiptSplitBox, ReceiptSplitOffer } from './ReceiptSplit.js';
import SharePicker from './SharePicker.js';
import type { Applied } from './ReceiptScan.js';
import './ReceiptScan.css';
import './ReceiptToLog.css';

/** The sheet's own edits, carried through Make a sharing group so the receipt comes back as it was left (the split choices are not kept: there was no group to choose with). */
interface Restore { choices: Choice[]; renames: Record<string, string>; touched: string[]; noRemember: string[]; separate: string[]; pickedStore: string; staged: Staged[]; seq: number; unticked?: string[]; addOn?: boolean; shareChoices?: ShareChoices; usual?: boolean | null; typedName?: string | null; rewards?: string }

// The receipt review sheet (brief receipt-scan): each line with the item it matched, its quantity and its price after any discount; change a match, untick a
// line, check the total, then Apply. The plan and the checks are pure (lib/groceryReceipt.ts); this only holds the choices. Nothing is written before Apply.
// A line with no item can be added to the list (brief receipt-add-item): the item is staged here, shown as New, and created only at Apply.
export default function ReceiptSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const gAll = useAppStore(s => s.grocery);
  const allMonths = useAppStore(s => s.groceryMonths);
  const g = useMemo(() => withoutUsed(gAll, allMonths), [gAll, allMonths]); // a used one-time item is not a match for a receipt line
  const scanned = modal?.receipt as Receipt | undefined; // as the scan read it; `receipt` below is it with the rewards the person left or typed
  const mk = String(modal?.mk ?? '');
  const onApplied = modal?.onApplied as ((a: Applied) => void) | undefined;
  const toLogId = typeof modal?.toLogId === 'string' ? modal.toLogId : ''; // a receipt opened from To log (brief receipt-snap-now-log-later): Apply updates that saved row, and no local draft is kept (To log is the account-wide one)
  const photoBlob = modal?.photo as Blob | undefined;
  const onRelease = modal?.onRelease as (() => Promise<void>) | undefined; // To log: puts the claimed row back when Apply then stopped before writing
  const onClaim = modal?.onClaim as ((r: Receipt) => Promise<string | null>) | undefined; // To log: claims the saved row before Apply writes anything; a text means another device got there first
  const canKeep = !!modal?.image; // the photo is held by Scan receipt only for an account that has Receipts (brief receipt-save-photo)
  const onKeep = modal?.onKeep as ((meta: KeepMeta) => void) | undefined;
  const remembered = (modal?.remembered ?? {}) as Record<number, string>; // line index to the item a saved receipt name matched it to (brief receipt-rename-memory)
  const restore = modal?.restore as Restore | undefined; // the sheet's own edits, kept while the person made a sharing group and came back (brief receipt-share)
  const [rewardsText, setRewardsText] = useState<string | null>(() => restore?.rewards ?? null); // brief receipt-rewards-credit: null until the box is touched (it then shows the scan's amount)
  const rewardsParse = scanned && rewardsText !== null ? parseRewards(rewardsText, receiptTotal(scanned)) : null;
  const rewardsCents = rewardsParse ? (rewardsParse.ok ? rewardsParse.cents : null) : scanned?.rewardsCents ?? null; // a bad amount counts as none and writes nothing
  const receipt = useMemo(() => (scanned ? withRewards(scanned, rewardsCents) : undefined), [scanned, rewardsCents]);
  const draftId = useRef((typeof modal?.draftId === 'string' && modal.draftId) || newDraftId()); // one id per receipt: a resumed draft keeps its own, so saving replaces it instead of adding a second
  const relinked = typeof modal?.relinked === 'number' ? modal.relinked : 0; // lines whose item was deleted since the draft was saved (set to no match on resume)
  const [renames, setRenames] = useState<Record<string, string>>(() => restore?.renames ?? {}); // item id to the name typed on the sheet; the item takes it at Apply
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set(restore?.touched)); // row keys whose name or item the person changed: only those can be remembered
  const [noRemember, setNoRemember] = useState<ReadonlySet<string>>(() => new Set(restore?.noRemember)); // row keys whose Remember tick is off (on by default)
  const [keep, setKeep] = useState(false); // off for every receipt: nothing is uploaded unless this is ticked and Apply is pressed
  const [separate, setSeparate] = useState<ReadonlySet<string>>(() => new Set(restore?.separate)); // brief receipt-merge-lines: text keys whose lines the person split back into their own rows (sheet only)
  const [choices, setChoices] = useState<Choice[]>(() => (restore?.choices?.length === receipt?.lines.length ? restore!.choices : (receipt?.lines ?? []).map(l => ({ itemId: l.matchId, include: !!l.matchId })))); // the lines of one row share a match (groupLines), so they start with one choice
  const [pickedStore, setPickedStore] = useState(restore?.pickedStore ?? '');
  const [usual, setUsual] = useState<boolean | null>(restore?.usual ?? null); // null until the box is touched: then ticked only when every moved item has no usual store; ticked, Apply also makes the receipt's store the items' usual store
  const monthLines = useAppStore(s => s.groceryMonths[mk]?.lines);
  const monthData = useAppStore(s => s.groceryMonths[mk]);
  const [shareChoices, setShareChoices] = useState<ShareChoices>(restore?.shareChoices ?? NO_CHOICES); // brief receipt-share: who shares what this receipt buys (null: each line keeps its usual)
  const [splitHidden, setSplitHidden] = useState(false); // Not now on the offer to make a sharing group
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set(restore?.unticked)); // brief receipt-reconcile-ticked: ticked items the receipt does not show that the person chose to untick (off for every receipt)
  const [again, setAgain] = useState(false); // brief receipt-tax-adds-up: a receipt already applied this month adds its tax and rewards again only when this is ticked (off for every receipt)
  const [stagedRaw, setStaged] = useState<Staged[]>(() => restore?.staged ?? []);
  const [form, setForm] = useState<{ line: number; draft: ItemDraft; error: string } | null>(null); // one form open at a time
  const seq = useRef(restore?.seq ?? 0);
  const [addOn, setAddOn] = useState(restore?.addOn ?? true); // brief receipt-add-store: ticked by default, and only offered when the receipt names a store the list does not have
  const [storeError, setStoreError] = useState(''); // the store could not be added: Apply stops here and nothing else is written
  const [typedName, setTypedName] = useState<string | null>(restore?.typedName ?? null); // null: the tidied name read from the photo, untouched
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
  const listed = useMemo(() => g.items.map(i => (renames[i.id] ? { ...i, n: renames[i.id]! } : i)), [g.items, renames]); // the list with the names typed here
  // Back guard and draft (brief receipt-back-guard): Back, a tap outside or Escape on a sheet with changes shows the leave prompt instead of closing it, and the receipt with its
  // edits is kept as a draft from the moment it opens, so a close that was not Apply or Discard can be resumed from Shopping (lib/receiptDraft.ts, ReceiptResume.tsx).
  const [asking, setAsking] = useState(false);
  const finished = useRef(false); // Apply or Discard: the draft is erased and must not be written again
  const initialChoices = useMemo(() => (receipt?.lines ?? []).map(l => ({ itemId: l.matchId, include: !!l.matchId })), [receipt]);
  const edited = isEdited({ choices, initial: initialChoices, renames: Object.keys(renames).length, touched: touched.size, noRemember: noRemember.size, separate: separate.size, staged: stagedRaw.length, unticked: unticked.size, keep, formOpen: form !== null, storePicked: pickedStore !== '', shared: shareChoices !== NO_CHOICES });
  const live = useRef({ edited, asking });
  useEffect(() => { live.current = { edited, asking }; }); // the guard below reads the latest values when Back arrives
  // One snapshot of the sheet's own edits, for the draft and for the round trip through Make a sharing group; a default that was never touched is left out, so a resumed sheet does not count as edited.
  const snapshot = (): Restore => ({ choices, renames, touched: [...touched], noRemember: [...noRemember], separate: [...separate], pickedStore, staged: stagedRaw, seq: seq.current, unticked: [...unticked], addOn, ...(shareChoices !== NO_CHOICES ? { shareChoices } : {}), ...(usual !== null ? { usual } : {}), ...(typedName !== null ? { typedName } : {}), ...(rewardsText !== null ? { rewards: rewardsText } : {}) });
  // The guard only holds while this receipt is the open sheet. Escape on the prompt takes it back (cancel).
  useEffect(() => setLeaveGuard({ holds: () => useAppStore.getState().modal?.type === 'receipt' && shouldAskOnBack(live.current.edited, live.current.asking), ask: () => setAsking(true), cancel: () => { if (!live.current.asking) return false; setAsking(false); return true; } }), []);
  const wasAsking = useRef(false);
  useEffect(() => { if (wasAsking.current && !asking) document.querySelector<HTMLElement>('.rcsheet')?.focus(); wasAsking.current = asking; }, [asking]); // Keep editing removed the focused button: focus goes back to the dialog, not to Apply
  // The first write is at once (a receipt closed a moment after it opened still leaves a draft); later edits are written 500 ms after the last one, and a pending one is flushed when the sheet closes.
  const written = useRef(false);
  const pending = useRef<Draft | null>(null);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (!scanned || finished.current || toLogId) return;
    setSaveError(''); // an edit since a failed Save for later: the old message no longer describes the sheet
    const d: Draft = { id: draftId.current, savedAt: Date.now(), mk, receipt: scanned, restore: snapshot() as unknown as Record<string, unknown> };
    if (!written.current) { written.current = true; keepDraft(d); return; }
    pending.current = d;
    const t = window.setTimeout(() => { keepDraft(d); pending.current = null; }, 500);
    return () => window.clearTimeout(t);
  }, [scanned, mk, choices, renames, touched, noRemember, separate, pickedStore, stagedRaw, unticked, shareChoices, usual, typedName, addOn, rewardsText]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot() reads exactly these
  useEffect(() => () => { if (pending.current && !finished.current) keepDraft(pending.current); }, []);
  const [claim, setClaim] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photoBlob) return;
    const u = URL.createObjectURL(photoBlob);
    setPhotoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photoBlob]);
  const discard = () => { finished.current = true; dropDraft(draftId.current); closeModal(); };
  // Save for later (brief receipt-drafts-list): writes the draft as it is now and closes with no prompt; a storage that refuses keeps the sheet open and says so.
  const saveLater = () => {
    const d: Draft = { id: draftId.current, savedAt: Date.now(), mk, receipt: scanned!, restore: snapshot() as unknown as Record<string, unknown> };
    if (!keepDraft(d)) { setSaveError('Could not save: this device refused it, or 5 drafts are already kept (discard one on Shopping first). Apply it now, or close and try again.'); return; }
    finished.current = true; pending.current = null;
    closeModal();
  };
  if (!receipt || !plan || !rec) return null;
  const dup = plan.receiptKey ? duplicateOf(monthData?.rcpts, plan.receiptKey) : null; // the same receipt (store, date, total, tax) is already in this month's ledger
  const skipMoney = !!dup && !again;
  const toWrite = skipMoney ? withoutReceiptMoney(plan) : plan; // what Apply will write: without the money, the bar and the Applied notice do not mention it
  const people = allPeople(g);
  const sharing = hasSharing(g) && people.length > 0; // the split shows where sharing shows today: once a group exists
  const withItem = [...listed, ...staged.map(x => ({ ...x, every: false, out: false }))];
  const shareRows = tickedRows(rows, choices);
  const partiesByKey = new Map(shareRows.map(r => [r.key, rowParties(g, withItem.find(x => x.id === r.itemId), monthLines?.[r.itemId!], shareForRow(shareChoices, r.key))] as const)); // once per render: the box, the chips and the owed line all read it
  const owed = sharing ? owedText(g, monthData, taxStore, owedRows(shareRows, r => partiesByKey.get(r.key)!), people) : '';
  const makeGroup = () => { askSharing({ ...(modal as unknown as Record<string, unknown>), draftId: draftId.current, restore: snapshot() satisfies Restore }); leaveSheet(window.history, window, () => navigate('daily/grocery/inventory', 'push'), closeModal); }; // a page opened at once would be undone by the sheet's own Back step (lib/backNav.ts)

  const check = checkText(plan.check);
  const paid = paidAfterRewards(receipt);
  const dateMonth = receipt.date ? receipt.date.slice(0, 7) : null;
  const setChoice = (lines: readonly number[], patch: Partial<Choice>) => setChoices(cs => cs.map((c, j) => (lines.includes(j) ? { ...c, ...patch } : c)));
  const stagedUsed = new Set(plan.steps.flatMap(s => (s.kind === 'tax' ? [] : [s.id])));
  const newCount = staged.filter(x => stagedUsed.has(x.id)).length;
  const openForm = (i: number) => setForm({ line: i, draft: proposeItem(rowAsLine(rows[i]!, receipt.lines), receipt.store, g.stores, newStore ? NEW_STORE : taxStore ?? ''), error: '' });
  const setDraft = (patch: Partial<ItemDraft>) => setForm(f => (f ? { ...f, draft: { ...f.draft, ...patch }, error: '' } : f));
  const touch = (key: string) => setTouched(x => new Set(x).add(key));
  const stageFrom = (line: number, draft: ItemDraft) => {
    const atNew = draft.store === NEW_STORE && !!newStore; // only when the choice was showing it: a renamed-to-existing or unticked store left the screen on Anywhere
    const r = stageDraft(draft.store === NEW_STORE ? { ...draft, store: atNew ? newStore : '' } : draft, g.items, staged, `new:${++seq.current}`);
    if (!r.ok) { setForm({ line, draft, error: r.error }); return; }
    setStaged(xs => [...xs, atNew ? { ...r.item, atNew: true } : r.item]);
    setChoice(rows[line]!.lines, { itemId: r.item.id, include: true });
    touch(rows[line]!.key);
    setForm(null);
  };
  const stage = () => { if (form) stageFrom(form.line, form.draft); };
  // A name typed in a row's field (brief receipt-rename-memory): another item with that name takes the row, else the row's item is renamed, else a row with no item gets a new one.
  const commitName = (i: number, typed: string) => {
    const row = rows[i]!, c = choices[row.lines[0]!]!, all = [...listed, ...staged];
    const cur = all.find(x => x.id === c.itemId) ?? null;
    const r = resolveName(typed, cur, all);
    if (r.kind === 'same') return;
    const n = typed.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (r.kind === 'new') { stageFrom(i, { ...proposeItem(rowAsLine(row, receipt.lines), receipt.store, g.stores, newStore ? NEW_STORE : taxStore ?? ''), n }); return; }
    touch(row.key);
    if (r.kind === 'match') setChoice(row.lines, { itemId: r.id, include: true });
    else if (isStaged(cur!.id)) setStaged(xs => xs.map(x => (x.id === cur!.id ? { ...x, n } : x)));
    else setRenames(m => ({ ...m, [cur!.id]: n }));
  };
  const unstage = (id: string) => {
    setStaged(xs => xs.filter(x => x.id !== id));
    setChoices(cs => cs.map(c => (c.itemId === id ? { itemId: null, include: false } : c)));
  };
  const doApply = (): boolean => {
    if (newStore) { const err = useAppStore.getState().addGroceryStore(newStore); if (err) { setStoreError(err); return false; } } // before the items, so a new item bought there finds the store; a store that cannot be made stops Apply with nothing written
    const made = createStaged(plan, staged, { addGroceryItem: useAppStore.getState().addGroceryItem, items: () => useAppStore.getState().grocery.items });
    const mapped = remapPlan(plan, made.ids);
    const real = skipMoney ? withoutReceiptMoney(mapped) : mapped.receiptKey ? { ...mapped, receiptKey: freshKey(useAppStore.getState().groceryMonths[mk]?.rcpts, mapped.receiptKey) } : mapped; // a receipt filed again (the tick, or one too bare to tell from another) gets its own key
    const st = useAppStore.getState(); // read after the items were made
    const month = st.groceryMonths[mk];
    const snap = takeSnapshot(real, mk, month?.lines ?? {}, st.grocery.items, month?.tax, made.created.map(x => made.ids[x.id]!), month?.credit);
    if (newStore) snap.addedStore = newStore;
    const out: { refused: string[]; unticked?: number; moneyFiled?: boolean } = { refused: [] };
    const done = applyPlan(real, mk, st, out, receipt.date); // the receipt's date stamps what it buys
    if (snap.receipt && out.moneyFiled === false) delete snap.receipt; // the key was already in the ledger: Undo must not remove an earlier receipt's entry and money
    const used = new Set(real.steps.flatMap(x => (x.kind === 'tax' ? [] : [x.id])));
    if (sharing) applyShares(shareWrites(shareChoices, shareRows, new Map(Object.entries(made.ids))).filter(w => used.has(w.id)), mk, useAppStore.getState()); // after the plan; Undo restores the lines as they were
    const edits: RowEdit[] = rows.map(r => { const c = choices[r.lines[0]!]!; return { text: r.text, itemId: c.itemId, include: c.include, touched: touched.has(r.key), remember: !noRemember.has(r.key) }; });
    const nm = applyNames({ items: () => useAppStore.getState().grocery.items, updateGroceryItem: st.updateGroceryItem }, Object.fromEntries(Object.entries(renames).filter(([id]) => used.has(id))), aliasAddsFor(edits, used, made.ids)); // after the plan: the plan works by id, so a rename cannot disturb it
    if (Object.keys(nm.names).length) snap.names = nm.names;
    if (Object.keys(nm.aliases).length) snap.aliases = nm.aliases;
    const namesText = `${savedNamesText(nm.saved)}${nm.refused.length ? ` Could not rename: ${nm.refused.join(', ')}.` : ''}`;
    const foodsText = madeFoodsText(made.created.map(x => made.ids[x.id]!), useAppStore.getState().recipes); // the Foods those new items made (brief groceries-make-foods); the receipt Undo takes back the untouched ones
    const storeText = newStore ? ` Added the store ${newStore}.` : '';
    finished.current = true; dropDraft(draftId.current); // applied: nothing left to resume
    closeModal();
    if (keep && canKeep) onKeep?.(keepMeta(receipt, mk));
    if (done > 0 || out.unticked || real.taxStore || real.creditStore || made.created.length || made.refused.length || nm.saved) onApplied?.({ text: done === 0 && out.unticked && !real.taxStore ? `Moved ${out.unticked} ${out.unticked === 1 ? 'item' : 'items'} back to Shopping for ${monthLabel(mk)}.${addedText(made.created, made.refused)}${foodsText}` : `Applied ${done} ${done === 1 ? 'item' : 'items'}${real.taxStore ? ` and ${real.taxStore} tax` : ''} for ${monthLabel(mk)}.${movedText(real.moves, real.makeUsual, out.refused)}${storeText}${addedText(made.created, made.refused)}${foodsText}${namesText}${untickedText(out.unticked ?? 0)}`, undo: () => restoreSnapshot(snap, useAppStore.getState()) });
    return true;
  };
  // A receipt from To log claims its saved row first (one PATCH, only if it still waits): if another device logged or deleted it, nothing is applied here and the sheet says so.
  const apply = () => {
    if (!toLogId || !onClaim) { doApply(); return; }
    setClaim({ busy: true, error: '' });
    void claimResult(claimThenApply(() => onClaim(receipt), doApply, async () => { await onRelease?.(); })).then(r => setClaim(r));
  };
  const unitOf = (i: number) => (receipt.lines[i]!.unit ? ` ${receipt.lines[i]!.unit}` : '');
  const nothing = plan.steps.length === 0 && plan.untick.length === 0;
  const shown = new Set<string>(); // one Was → Now note per item, under the first row that names it
  const moved = (id: string | null) => (id ? plan.moves.find(m => m.id === id) : undefined);
  const words = movesText(plan.moves);
  return (
    <Sheet className="rcsheet">
      <div className="rctop">
        <h2 className="cond">Receipt</h2>
        <button type="button" className="btn ghost rcclose" id="rc-cancel" aria-label="Close without applying" onClick={closeModal}>Close</button>
      </div>
      <p className="rcmeta">
        {receipt.store && <span>Store <b>{receipt.store}</b></span>}
        {receipt.date && <span>Dated <b>{receipt.date}</b></span>}
        <span>Applies to <b>{monthLabel(mk)}</b></span>
      </p>
      {photoUrl && <details className="rcphotoref" id="rc-photo"><summary>Show the receipt photo</summary><img src={photoUrl} alt="The saved photo of this receipt" /></details>}
      {relinked > 0 && <p className="note rcwarn" role="status">{relinked === 1 ? '1 line was matched to an item that is no longer on your list' : `${relinked} lines were matched to items that are no longer on your list`}. {relinked === 1 ? 'It is' : 'They are'} set to no match; pick another item or add {relinked === 1 ? 'it' : 'them'} to the list.</p>}
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
      {dup && (
        <div className="note rcdup" role="status">
          <span>Already applied to {monthLabel(mk)}: {receipt.store ?? taxStore}{receipt.date ? `, ${receipt.date}` : ''}. Tax and rewards are not added again.</span>
          <label className="rckeep" htmlFor="rc-again"><input id="rc-again" type="checkbox" checked={again} onChange={e => setAgain(e.target.checked)} /> Add tax and rewards again anyway</label>
        </div>
      )}
      <div className={`rccheck${check.ok ? '' : ' bad'}`} role="status">
        <div className="rcnums"><span>Lines {money(plan.check.linesCents)}</span><span>Tax {money(plan.check.taxCents)}</span>{plan.check.totalCents !== null && <span>Receipt total {money(plan.check.totalCents)}</span>}
          <label className="rcrew">Rewards $<input type="text" inputMode="decimal" placeholder="0.00" maxLength={9} aria-label={`Rewards${taxStore ? ` at ${taxStore}` : ''}, dollars`} value={rewardsText ?? centsText(scanned?.rewardsCents ?? null)} onChange={e => setRewardsText(e.target.value)} aria-invalid={rewardsParse?.ok === false} /></label>
          {paid !== null && <span className="rcpaid">You paid {money(paid)}</span>}</div>
        {paid !== null && !taxStore && <small>Pick a store above so the rewards also come off this month&apos;s spend.</small>}
        {rewardsParse?.ok === false && <small className="gerr" role="alert">{rewardsParse.error}</small>}
        <small>{check.text}</small>
      </div>
      {sharing && shareRows.length > 0 && <ReceiptSplitBox people={people} parties={wholeParties(g, shareChoices, shareRows.map(r => partiesByKey.get(r.key)!))} own={wholeIsSet(shareChoices)} owed={owed} onChange={sh => setShareChoices(c => setWhole(c, sh))} />}
      {!sharing && !hasSharing(g) && shareRows.length > 0 && <ReceiptSplitOffer hidden={splitHidden} onMake={makeGroup} onHide={() => setSplitHidden(true)} onShow={() => setSplitHidden(false)} />}
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
              <select aria-label={`Item for ${l.text}`} value={c.itemId ?? ''} disabled={!priced} onChange={e => { if (form?.line === i) setForm(null); touch(l.key); setChoice(l.lines, { itemId: e.target.value || null, include: !!e.target.value }); }}>
                <option value="">Not on your list</option>
                {listed.map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
                {staged.map(x => <option key={x.id} value={x.id}>{x.n} (new)</option>)}
              </select>
              {isNew && <span className="rcpill">New</span>}
              {isNew && <button type="button" className="rclink rcunstage" aria-label={`Remove new item for ${l.text}`} onClick={() => unstage(c.itemId!)}>Remove</button>}
              {!c.itemId && priced && form?.line !== i && <button type="button" className="rclink rcaddbtn" aria-label={`Add to list: ${l.text}`} onClick={() => openForm(i)}>Add to list</button>}
              <span className="rcqty">{l.qty}{unitOf(l.lines[0]!)}</span>
              <span className="rcnet">{l.discountCents > 0 && <s>{money(l.grossCents)}</s>}{money(l.netCents)}</span>
              <ReceiptLineName text={l.text} name={[...listed, ...staged].find(x => x.id === c.itemId)?.n ?? ''} disabled={!priced} hasItem={!!c.itemId && c.include} touched={touched.has(l.key)} remember={!noRemember.has(l.key)}
                onRemember={on => setNoRemember(x => { const n = new Set(x); if (on) n.delete(l.key); else n.add(l.key); return n; })}
                matched={l.lines.some(j => remembered[j] !== undefined && choices[j]!.itemId === remembered[j])} movedFrom={c.itemId ? movedFrom(g.items, l.text, c.itemId)?.n : undefined} onCommit={t => commitName(i, t)} />
              {sharing && !off && priced && (
                <span className="rcshare">
                  <SharePicker name={l.text} people={people} parties={partiesByKey.get(l.key) ?? [ME]} own={isOwnRow(shareChoices, l.key)} resetLabel={wholeIsSet(shareChoices) ? 'Same as the whole receipt' : 'Use the usual'} onChange={sh => setShareChoices(x => setRow(x, l.key, sh))} />
                </span>
              )}
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
        <div className="rcmiss" role="group" aria-label="Already bought, not on this receipt">
          <h3 className="cond">Already bought, not on this receipt ({rec.missing.length})</h3>
          <p className="note">{missingIntro(rec, plan.items)}</p>
          <details className="rcmissmore">
            <summary>{`Review these ${rec.missing.length} ${rec.missing.length === 1 ? 'item' : 'items'}${unticked.size > 0 ? ` (${unticked.size} moving back)` : ''}`}</summary>
            <ul>
              {rec.missing.map(m => (
                <li key={m.id}>
                  <span className="rcmisswhat">{m.name}<small>Bought: {m.held}</small></span>
                  <label className="rcuntick"><input type="checkbox" checked={unticked.has(m.id)} onChange={e => setUnticked(x => { const n = new Set(x); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} aria-label={`Move back to Shopping: ${m.name}`} /><span>Move back</span></label>
                  {unticked.has(m.id) && <span className="rcmissstate">Will move back to Shopping</span>}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {rec.earlier > 0 && <p className="note rcearlier">{earlierText(rec.earlier)}</p>}
      {words.summary && (
        <div className="rcbought">
          <p className="note" role="status">{words.summary}</p>
          {words.split && <p className="note rcwarn" role="status">{words.split}</p>}
          <label className="rckeep" htmlFor="rc-usual">
            <input id="rc-usual" type="checkbox" checked={plan.makeUsual} onChange={e => setUsual(e.target.checked)} />
            <span>Also make {plan.moves[0]!.to} the usual store for these items<small>Changes where they are listed on Inventory. Undo puts it back.</small></span>
          </label>
          <p className="note" role="status">{plan.makeUsual ? `Inventory will list these under ${plan.moves[0]!.to}.` : `Inventory stays as it is. Tick the box to list these under ${plan.moves[0]!.to} there.`}</p>
        </div>
      )}
      <p className="note">Existing prices on the ticked items are replaced. Lines that are not on your list are skipped and count only in the total check, unless you add them with Add to list.</p>
      {asking
        ? <ReceiptLeave onKeep={() => setAsking(false)} onDiscard={discard} />
        : <ReceiptApplyBar plan={toWrite} newCount={newCount} disabled={nothing || !!nameError || claim.busy} onApply={apply} keep={canKeep ? { checked: keep, onChange: setKeep } : undefined} onSave={toLogId ? undefined : saveLater} saveError={saveError || claim.error} />}
    </Sheet>
  );
}
