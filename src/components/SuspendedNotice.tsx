import { useSuspended } from '../sync/suspendedState.js';
import Icon from './Icon.js';

// Shown on every screen while an admin has suspended this account (brief admin-accounts-screen). The server refuses every call but /api/me,
// erase and delete, so changes stay safe on this device and sync pauses; restoring the account brings it all back.
export default function SuspendedNotice() {
  if (!useSuspended()) return null;
  return (
    <div className="notice movewarn" role="alert">
      <div><Icon name="info" /> <b>This account is suspended.</b> Your data is safe and nothing was deleted. Contact the app owner to get access back. You can still export or delete your data in Settings.</div>
    </div>
  );
}
