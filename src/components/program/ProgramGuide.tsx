import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { GUIDE_STEPS, GUIDE_TITLE, dismissProgramGuide, programGuideDismissed } from '../../lib/programGuide.js';
import { SendLinkButton } from '../SendLinkButton.js';
import './ProgramGuide.css';

// The first-time card at the top of the Programs view. It is in the page flow from the first paint (the choice is read synchronously), so it never moves anything after load.
// "Got it" hides it for good on this device. Step 4 is the "plan on a computer" tip, with its Send me the link button.
export default function ProgramGuide() {
  const [hidden, setHidden] = useState(programGuideDismissed);
  if (hidden) return null;
  return (
    <section className="panel proguide" aria-labelledby="proguide-title">
      <h2 id="proguide-title">{GUIDE_TITLE}</h2>
      <ol>
        {GUIDE_STEPS.map((s, i) => (
          <li key={s.title}>
            <b>{s.title}</b>
            <span className="note">{s.text}</span>
            {i === GUIDE_STEPS.length - 1 && <span className="pcactions"><SendLinkButton /></span>}
          </li>
        ))}
      </ol>
      <div className="actions start flexwrap">
        <button type="button" className="btn primary" onClick={() => { dismissProgramGuide(); setHidden(true); }}>Got it</button>
        <button type="button" className="btn ghost" onClick={() => useAppStore.getState().openModal({ type: 'help' })}>Open help</button>
      </div>
    </section>
  );
}
