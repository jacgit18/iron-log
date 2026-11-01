import './QaAccountsPanel.css';
import QaPersonaList from '../QaPersonaList.js';
import { useQa } from '../../sync/qaState.js';

// QA test accounts (briefs qa-persona-picker, qa-picker-access): an admin on a QA service sees the seeded accounts, described, and switches to one.
// Open by default, with the same list as the picker sheet. Draws nothing anywhere else: /api/me only says `qa.canSwitch` on QA, to an admin.
export default function QaAccountsPanel() {
  const qa = useQa();
  if (qa?.canSwitch !== true) return null;
  return (
    <section className="panel qapanel" aria-labelledby="qa-h">
      <h3 id="qa-h">QA test accounts</h3>
      <p className="note">Switch to a seeded account to see the app as that user. The banner at the top brings you back. Because this device holds your own data, the app then asks to wipe it and carry on as the test account; your account keeps its data on the server.</p>
      <QaPersonaList idPrefix="qa-panel" />
    </section>
  );
}
