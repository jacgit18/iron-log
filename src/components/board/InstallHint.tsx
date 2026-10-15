import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { usePwa, install, isIOS } from '../../lib/pwa.js';
import { showInstallHint, installHintDismissed, dismissInstallHint } from '../../lib/installHint.js';
import './InstallHint.css';

// One-time notice, on any tab, once the person is in: install the app. Dismissing it hides it for good on this device.
export default function InstallHint() {
  const { installEvent, installed } = usePwa();
  const [dismissed, setDismissed] = useState(installHintDismissed);
  // With sync on, wait until the data has loaded and nobody needs to sign in or pick an account: until then the cards for those are
  // what the person should see (the iPhone path has no browser event to wait for, so it would show at once).
  const signedOut = useAppStore(st => st.sync !== null && (!st.isReady() || (st.sync.state === 'paused' && (st.sync.pausedBecause === 'auth' || st.sync.pausedBecause === 'account'))));
  if (!showInstallHint({ installed, canPrompt: !!installEvent, ios: isIOS(), signedOut, dismissed })) return null;
  const hide = () => { dismissInstallHint(); setDismissed(true); };
  return (
    <div className="notice tip" id="install-hint">
      <span>{installEvent ? 'Install Iron Log to open it from your home screen. It works without a connection.' : 'To install: in Safari tap Share, then Add to Home Screen.'}</span>
      <span>
        {installEvent && <><button type="button" className="btn sm" onClick={() => { void install(); hide(); }}>Install</button>{' '}</>}
        <button type="button" className="btn sm ghost" onClick={hide}>{installEvent ? 'Not now' : 'Got it'}</button>
      </span>
    </div>
  );
}
