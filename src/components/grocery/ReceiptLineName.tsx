import { useId, useState } from 'react';
import './ReceiptRename.css';

type Props = {
  text: string; // the receipt text of the row
  name: string; // the item's name now ('' when the row has no item)
  disabled: boolean; // a line with no price cannot be applied
  hasItem: boolean; // the row goes to an item (listed or new) and is ticked: without one there is nothing to remember
  touched: boolean; // the person changed this row's name or item: only then is Remember offered
  remember: boolean;
  onRemember: (on: boolean) => void;
  matched: boolean; // the row went to its item through a saved receipt name
  movedFrom?: string; // the item that holds this text now, when Remember would move it
  onCommit: (typed: string) => void;
};

// The name part of one receipt row (brief receipt-rename-memory, layout A): a name field on every row, a "Matched your earlier rename" chip, and, once the person changed
// the name or the item, a Remember tick. The typed text is applied when the field loses focus or on Enter, so a name is never half-applied while typing.
export default function ReceiptLineName({ text, name, disabled, hasItem, touched, remember, onRemember, matched, movedFrom, onCommit }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const done = () => { if (draft !== null) { setDraft(null); onCommit(draft); } };
  return (
    <div className="rcname">
      <label className="rcnamefield" htmlFor={id}>Name
        <input id={id} type="text" maxLength={80} value={draft ?? name} placeholder={name ? undefined : 'Name it to add it to your list'} aria-label={`Name for ${text}`} disabled={disabled}
          onChange={e => setDraft(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); done(); } }} />
      </label>
      {matched && <span className="rcmatched">Matched your earlier rename</span>}
      {touched && !disabled && hasItem && (
        <label className="rckeep rcremember" htmlFor={`${id}-r`}>
          <input id={`${id}-r`} type="checkbox" checked={remember} onChange={e => onRemember(e.target.checked)} aria-label={`Remember this name for ${text}`} />
          <span>Remember this name<small>Next time “{text}” is on a receipt it goes to this item.</small></span>
        </label>
      )}
      {touched && !disabled && hasItem && remember && movedFrom && <span className="note rcnote rcmoved">“{text}” is saved for {movedFrom} now. Remembering it moves it here.</span>}
    </div>
  );
}
