import { draftAge, type Draft } from '../../lib/receiptDraft.js';
import './ReceiptResume.css';

// The Resume row on Shopping (brief receipt-back-guard, owner picked A from a preview): a receipt closed without Apply or Discard is kept as a draft for 2 hours
// (lib/receiptDraft.ts). Resume reopens the sheet with its edits (the callbacks are Scan receipt's, passed in); Discard erases the draft.
export default function ReceiptResume({ draft, now, onResume, onDiscard }: { draft: Draft; now: number; onResume: () => void; onDiscard: () => void }) {
  const n = draft.receipt.lines.length;
  return (
    <div className="rcresume" id="groc-resume" role="group" aria-label="Receipt draft">
      <p className="rcresumewhat"><b>Resume your receipt</b><span>{draft.receipt.store ? `${draft.receipt.store}, ` : ''}{n} {n === 1 ? 'line' : 'lines'}, closed {draftAge(draft.savedAt, now)}</span></p>
      <div className="rcresumebtns">
        <button type="button" className="btn sm primary" id="groc-resume-go" onClick={onResume}>Resume</button>
        <button type="button" className="btn sm" id="groc-resume-discard" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}
