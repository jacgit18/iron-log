import { useState } from 'react';
import { usePwa, install, isIOS } from '../../lib/pwa.js';
import { showInstallHint, installHintDismissed, dismissInstallHint } from '../../lib/installHint.js';

// One-time board notice: install the app. Dismissing it hides it for good on this device.
export default function InstallHint() {
  const { installEvent, installed } = usePwa();
  const [dismissed, setDismissed] = useState(installHintDismissed);
  const phone = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  if (!showInstallHint({ installed, canPrompt: !!installEvent, ios: isIOS(), phone, dismissed })) return null;
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
