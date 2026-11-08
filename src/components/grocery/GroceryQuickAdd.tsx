import { useRef, useState, type FormEvent } from 'react';
import { findQuickAdded, quickAddForm, quickAddLabel } from '../../lib/groceryQuickAdd.js';
import { useAppStore } from '../../store/useAppStore.js';
import Icon from '../Icon.js';
import './GroceryQuickAdd.css';

// The `+ Add item to <store>` row at the end of a store's list on Shopping (brief groceries-spending-buttons-quick-add): a name and Enter adds a one-time item through the
// same add-item rules as Inventory (a duplicate name, an empty name and a full list answer with their usual messages). `onAdded` tells Shopping what was made, for its notice.
export default function GroceryQuickAdd({ idKey, label, store, onAdded }: { idKey: string; label: string; store: string; onAdded: (a: { id: string; name: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); setName(''); setErr(null); window.setTimeout(() => opener.current?.focus(), 0); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = useAppStore.getState();
    const m = s.addGroceryItem(quickAddForm(name, store));
    if (m) { setErr(m); return; }
    const made = findQuickAdded(useAppStore.getState().grocery.items, name, store);
    onAdded({ id: made?.id ?? '', name: made?.n ?? name.trim() });
    close();
  };
  if (!open) return <button type="button" ref={opener} className="btn ghost gqaopen" id={`groc-qa-${idKey}`} onClick={() => setOpen(true)}><Icon name="plus" /> {quickAddLabel(label)}</button>;
  return (
    <form className="gqaform" noValidate aria-label={quickAddLabel(label)} onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}>
      <input type="text" className="gqaname" id={`groc-qa-name-${idKey}`} aria-label={`Item name, to add to ${label}`} placeholder="Item name" maxLength={80} autoComplete="off" autoFocus value={name} onChange={e => { setName(e.target.value); setErr(null); }} />
      <button type="submit" className="btn" id={`groc-qa-add-${idKey}`}>Add</button>
      <button type="button" className="btn ghost" id={`groc-qa-cancel-${idKey}`} onClick={close}>Cancel</button>
      {err && <p className="note gerr gqaerr" role="alert">{err}</p>}
    </form>
  );
}
