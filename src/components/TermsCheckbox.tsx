import { useId } from 'react';
import { PRIVACY_VERSION, TERMS_VERSION } from '../shared/termsVersion.js';
import './TermsCheckbox.css';

// "I agree to the Terms of Use and the Privacy Policy" (brief terms-acceptance): the unticked box that keeps the sign-in buttons off until it is ticked,
// and the same box on the accept screen. The links open the plain pages in a new tab so a half-filled sign-in is not lost. The visible text is the
// accessible name, and while the box is unticked a one-line hint below it says why the buttons are off (`hint`, on for sign-in, off on the accept screen).
export default function TermsCheckbox({ checked, onChange, hint = true }: { checked: boolean; onChange: (next: boolean) => void; hint?: boolean }) {
  const hintId = useId();
  const showHint = hint && !checked;
  return (
    <div className="termsblock">
      <label className="termsbox">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-describedby={showHint ? hintId : undefined} />
        <span>I agree to the <a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a> (version {TERMS_VERSION}) and the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a> (version {PRIVACY_VERSION})</span>
      </label>
      {showHint && <p className="note termshint" id={hintId}>Tick the box to sign in.</p>}
    </div>
  );
}
