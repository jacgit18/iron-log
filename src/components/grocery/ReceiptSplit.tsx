import type { GroceryPerson, GroceryShare } from '../../types.ts';
import SharePicker from './SharePicker.js';
import './ReceiptSplit.css';

// The receipt sheet's split (brief receipt-share). With a sharing group: a box under the total check holds the split for the whole receipt (the same picker as Shopping) and
// says what each person owes. With none: a card offers to make one; "Not now" folds it to a "Split it" link. Nothing is written until Apply.
export function ReceiptSplitBox({ people, parties, own, owed, onChange }: { people: GroceryPerson[]; parties: readonly string[]; own: boolean; owed: string; onChange: (share: GroceryShare | null) => void }) {
  return (
    <div className="rcsplit" role="group" aria-label="Split this receipt">
      <p className="rcsplith">Split this receipt</p>
      <SharePicker name="this receipt" people={people} parties={parties} own={own} onChange={onChange} />
      {owed && <p className="rcsplitres" role="status">{owed}</p>}
      <p className="note">Applies to every ticked line. Change one line below to split it differently.</p>
    </div>
  );
}

export function ReceiptSplitOffer({ hidden, onMake, onHide, onShow }: { hidden: boolean; onMake: () => void; onHide: () => void; onShow: () => void }) {
  if (hidden) return <p className="note rcsplitlater">Counts as all yours. <button type="button" className="rclink" id="rc-split-show" onClick={onShow}>Split it</button></p>;
  return (
    <div className="rcsplit rcsplitoffer" role="group" aria-label="Split this receipt">
      <p className="rcsplith">Split this receipt?</p>
      <p className="note">You have no sharing group yet, so this receipt counts as all yours. Make a group and add the people you split groceries with, then come back here to set who pays what.</p>
      <div className="actions">
        <button type="button" className="btn ghost" id="rc-split-hide" onClick={onHide}>Not now</button>
        <button type="button" className="btn primary" id="rc-split-make" onClick={onMake}>Make a sharing group</button>
      </div>
    </div>
  );
}
