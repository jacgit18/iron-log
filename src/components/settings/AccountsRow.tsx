import { useFeature } from '../../features.js';
import { navigate } from '../useRoute.js';

// The Accounts row in Settings (brief admin-accounts-screen): admin-only for good (features.ts `adminAccounts`). Opening it pushes the page's
// address, so the browser's Back button returns to Settings.
export default function AccountsRow() {
  if (!useFeature('adminAccounts')) return null;
  return (
    <section className="panel accountsrow" aria-labelledby="accountsrow-h">
      <h3 id="accountsrow-h">Accounts</h3>
      <p>Sign-ups against the cap, plans, and suspending an account. Only you can see this.</p>
      <div className="actions">
        <button type="button" className="btn sm" id="open-accounts" onClick={() => navigate('settings/accounts', 'push')}>Open accounts</button>
      </div>
    </section>
  );
}
