import { useState } from 'react';
import { useWaitingForSignIn } from '../../lib/installHintState.js';
import { usePwa, install, isIOS } from '../../lib/pwa.js';
import { showInstallHint, installHintDismissed, dismissInstallHint } from '../../lib/installHint.js';
import './InstallHint.css';

// One-time notice, on any tab, once the person is in: install the app. Dismissing it hides it for good on this device.
export default function InstallHint() {
  const { installEvent, installed } = usePwa();
  const [dismissed, setDismissed] = useState(installHintDismissed);
  const signedOut = useWaitingForSignIn();
  if (!showInstallHint({ installed, canPrompt: !!installEvent, ios: isIOS(), signedOut, dismissed })) return null;
  const hide = () => { dismissInstallHint(); setDismissed(true); };
  return (
    <div className="notice tip" id="install-hint">
      <span>{installEvent ? 'Install Loadbearer to open it from your home screen. It works without a connection.' : 'To install: in Safari tap Share, then Add to Home Screen.'}</span>
      <span>
        {installEvent && <><button type="button" className="btn sm" onClick={() => { void install(); hide(); }}>Install</button>{' '}</>}
        <button type="button" className="btn sm ghost" onClick={hide}>{installEvent ? 'Not now' : 'Got it'}</button>
      </span>
    </div>
  );
}
