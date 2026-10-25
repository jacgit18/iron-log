import { useState } from 'react';
import Notice from '../Notice.jsx';
import { BILLING_NOTICE_TEXT, dismissBillingNotice, isBillingNoticeDismissed } from '../../lib/billingNotice.js';

// The one-time "paid plans are here" announcement (Privacy section 14, Terms section 2), drawn by BillingPanel only for a signed-in person whose
// server has billing on. The rules (once per browser, a blocked storage shows it each visit) are in src/lib/billingNotice.ts.
export default function BillingNotice() {
  const [hidden, setHidden] = useState(() => isBillingNoticeDismissed()); // stays true for this visit even if the browser refused the write
  if (hidden) return null;
  return (
    <Notice kind="info" className="billingnotice" actions={[{ label: 'Dismiss', ghost: true, onClick: () => { dismissBillingNotice(); setHidden(true); } }]}>
      <span>{BILLING_NOTICE_TEXT} <a href="/terms.html">Read the updated Terms</a>.</span>
    </Notice>
  );
}
