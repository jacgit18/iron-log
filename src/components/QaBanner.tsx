import { useState } from 'react';
import { bannerText, qaEntries } from '../lib/qaPersonas.js';
import { flag, useAppStore } from '../store/useAppStore.js';
import { returnToAdmin } from '../sync/qaPersonas.js';
import { useQa } from '../sync/qaState.js';
import Icon from './Icon.js';

// While an admin is switched to a QA test account (brief qa-persona-picker): a notice on every screen that says so and brings them back. /api/me
// says `qa.persona` only on a QA service, so this draws nothing in production or staging. Switch opens the picker sheet (brief qa-picker-access).
export default function QaBanner() {
  const qa = useQa();
  const [busy, setBusy] = useState(false);
  if (!qa?.persona) return null;
  const back = async () => {
    setBusy(true);
    const out = await returnToAdmin();
    if (out === 'ok') { window.location.reload(); return; }
    setBusy(false);
    flag(out === 'unreachable' ? 'Could not reach the server. Still on the test account.' : 'Could not return to your account. Sign in with Google again.');
  };
  return (
    <div className="notice movewarn" role="status">
      <div><Icon name="info" /> <b>{bannerText(qa.persona)}</b></div>
      <div className="actions">
        {qaEntries(qa).bannerSwitch && <button type="button" className="btn sm" disabled={busy} onClick={() => useAppStore.getState().openModal({ type: 'qapicker' })}>Switch</button>}
        <button type="button" className="btn sm" disabled={busy} onClick={() => void back()}>{busy ? 'Returning…' : 'Return to admin'}</button></div>
    </div>
  );
}
