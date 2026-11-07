import { useState } from 'react';
import { COPIED_LABEL, COPY_FAILED, SEND_LABEL, sendLink, type SendOutcome } from '../lib/programOnComputer.js';
import './SendLinkButton.css';

// "Send me the link": the phone's share sheet with this site's address; with no sheet, the address is copied. The same button is in the
// Program tab's guide card and in Settings, so it lives here once. The label says what happened (copied, or could not copy) in the same live region.
export function SendLinkButton({ primary = false }: { primary?: boolean }) {
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const send = async () => {
    const result = await sendLink(window.location.origin, {
      share: typeof navigator.share === 'function' ? d => navigator.share(d) : undefined,
      writeText: navigator.clipboard ? t => navigator.clipboard.writeText(t) : undefined,
    });
    setOutcome(result === 'shared' || result === 'cancelled' ? null : result);
  };
  return (
    <>
      <button type="button" className={primary ? 'btn sm primary' : 'btn sm'} onClick={() => void send()}>{outcome === 'copied' ? COPIED_LABEL : SEND_LABEL}</button>
      <span className="sr" role="status">{outcome === 'copied' ? COPIED_LABEL : outcome === 'failed' ? COPY_FAILED : ''}</span>
      {outcome === 'failed' && <span className="note pcfail">{COPY_FAILED}</span>}
    </>
  );
}
