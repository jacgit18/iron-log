import './ReceiptLeave.css';

// The leave prompt of the receipt sheet (brief receipt-back-guard, owner picked A from a preview): Back, a tap outside or Escape on a sheet with changes shows this
// in place of the Apply bar, with the receipt still in view. Keep editing is the primary button and takes focus, so a second stray swipe or Enter cannot erase anything.
export default function ReceiptLeave({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="rcfoot rcleave" role="group" aria-labelledby="rc-leave-q">
      <p className="rcleaveq" id="rc-leave-q"><b>Leave this receipt?</b><span>Your changes are not applied yet. Discard erases them.</span></p>
      <div className="rcleavebtns">
        <button type="button" className="btn primary" id="rc-leave-keep" autoFocus onClick={onKeep}>Keep editing</button>
        <button type="button" className="btn" id="rc-leave-discard" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
