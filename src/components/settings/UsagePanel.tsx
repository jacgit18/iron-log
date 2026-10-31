import { useState } from 'react';
import { setUsage, usageOn } from '../../lib/usage.js';

// Opt-in anonymous usage counts (brief opt-in-usage-counts). Off until the person turns it on; what is sent is spelled out here and on the
// privacy page. Saved on this phone only: switching it off makes the phone forget its random id.
export default function UsagePanel() {
  const [on, setOn] = useState(usageOn);
  return (
    <section className="panel" aria-labelledby="usage-h">
      <h3 id="usage-h">Usage counts (optional)</h3>
      <label className="inline">
        <input type="checkbox" checked={on} aria-describedby="usage-what" onChange={e => { setUsage(e.target.checked); setOn(usageOn()); }} /> Share anonymous usage counts
      </label>
      <p id="usage-what">Off unless you turn it on. When it is on, once a day Loadbearer sends how many times the app was opened and how often six features were used: logging a workout, editing a program, exporting, syncing, alerts. It never sends your name, your email or anything you logged, and it is not linked to your account. Turn it off and this phone forgets its random ID. Saved on this device only. <a href="/privacy.html">Privacy Policy</a></p>
    </section>
  );
}
