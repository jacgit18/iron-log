import { useState } from 'react';
import { isTouchScreen } from '../lib/revealField.js';
import { CARD_TEXT, COPIED_LABEL, COPY_FAILED, SEND_LABEL, dismissProgramCard, programCardDismissed, sendLink, showProgramCard, type SendOutcome } from '../lib/programOnComputer.js';
import { useInstallHintShowing, useWaitingForSignIn } from '../lib/installHintState.js';
import Icon from './Icon.js';
import './ProgramOnComputer.css';

// "Send me the link": the phone's share sheet with this site's address; with no sheet, the address is copied. The same button is on the
// card and in Settings, so it lives here once. The label says what happened (copied, or could not copy) in the same live region.
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

// A one-time tip on the Program tab, on a phone or tablet: a person building a program is better off on a computer. It floats above the tab
// bar like the install hint (a card in the flow would push the Day buttons down), waits while that hint shows, and "Not now" hides it
// for good on this device. Rendered only on the Program tab (App.tsx), so the editor itself is untouched.
export default function ProgramOnComputer() {
  const [dismissed, setDismissed] = useState(programCardDismissed);
  const waitingForSignIn = useWaitingForSignIn();
  const installHintShowing = useInstallHintShowing();
  if (!showProgramCard({ touch: isTouchScreen(), programTab: true, waitingForSignIn, installHintShowing, dismissed })) return null;
  return (
    <section className="notice tip" id="program-computer-hint" aria-label="Tip: plan on a computer">
      <span className="pctext"><Icon name="info" /> {CARD_TEXT}</span>
      <span className="pcactions">
        <SendLinkButton primary />
        <button type="button" className="btn sm ghost" onClick={() => { dismissProgramCard(); setDismissed(true); }}>Not now</button>
      </span>
    </section>
  );
}
