import { draftAge, type Draft } from '../../lib/receiptDraft.js';
import { draftLabel, draftWhat } from '../../lib/receiptDraftRow.js';
import './ReceiptResume.css';

// The Drafts rows on Shopping (briefs receipt-back-guard and receipt-drafts-list, owner picked stacked rows from a preview): a receipt left without Apply or Discard is kept as a draft on this
// device for 7 days, up to 5 (lib/receiptDraft.ts). One row each: Resume reopens the sheet with its edits (the callbacks are Scan receipt's, passed in); Discard erases that draft only.
export default function ReceiptResume({ drafts, now, onResume, onDiscard }: { drafts: Draft[]; now: number; onResume: (id: string) => void; onDiscard: (id: string) => void }) {
  return (
    <div className="rcdrafts" id="groc-resume" role="group" aria-label={drafts.length === 1 ? 'Receipt draft' : 'Receipt drafts'}>
      <p className="rcdraftshead"><b>{drafts.length === 1 ? 'Draft receipt' : `Draft receipts (${drafts.length})`}</b><span>Kept on this device for 7 days</span></p>
      <ul className="rcdraftlist">
        {drafts.map(d => {
          const label = draftLabel(d);
          return (
            <li key={d.id} className="rcresume" data-draft={d.id}>
              <p className="rcresumewhat"><b>{label}</b><span>{draftWhat(d)}, saved {draftAge(d.savedAt, now)}</span></p>
              <div className="rcresumebtns">
                <button type="button" className="btn sm primary rcresumego" aria-label={`Resume ${label}`} onClick={() => onResume(d.id)}>Resume</button>
                <button type="button" className="btn sm rcresumediscard" aria-label={`Discard ${label}`} onClick={() => onDiscard(d.id)}>Discard</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
