import { useState } from 'react';
import { feedbackLink } from '../../lib/feedback.js';
import { problemDetails } from '../../lib/problemDetails.js';
import { flag, useAppStore } from '../../store/useAppStore.js';

export default function FeedbackPanel() {
  const href = feedbackLink();
  const sync = useAppStore(s => s.sync);
  // Shown instead of copied when the browser will not let the page use the clipboard, so the details are never out of reach.
  const [shown, setShown] = useState<string | null>(null);
  if (!href) return null;

  const copy = async () => {
    const text = problemDetails({
      version: __APP_VERSION__,
      sync,
      online: navigator.onLine,
      userAgent: navigator.userAgent,
      standalone: window.matchMedia?.('(display-mode: standalone)').matches === true,
    });
    try {
      await navigator.clipboard.writeText(text);
      setShown(null);
      flag('Details copied. Paste them into the form.');
    } catch {
      setShown(text);
    }
  };

  return (
    <section className="panel">
      <h3>Send feedback</h3>
      <p>Found a bug or have an idea? It opens a short form in a new tab. For a bug, copy the details first and paste them into the form: they hold the app build and how syncing stands, and nothing you logged.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={() => void copy()}>Copy problem details</button>
        <a className="btn" href={href} target="_blank" rel="noopener noreferrer">Open feedback form</a>
      </div>
      {shown && (
        <label>
          Select all and copy
          <textarea readOnly rows={7} value={shown} onFocus={e => e.currentTarget.select()} />
        </label>
      )}
    </section>
  );
}
