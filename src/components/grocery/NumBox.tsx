import { useState } from 'react';

// A count or price box that keeps what is typed and saves when you leave it (or press Enter), so a half-typed "3." is not rewritten under you.
export function NumBox({ label, value, onCommit, className, error, disabled }: { label: string; value: string; onCommit: (text: string) => boolean; className: string; error?: string; disabled?: boolean }) {
  const [text, setText] = useState(value); const [seen, setSeen] = useState(value); const [bad, setBad] = useState(false);
  if (value !== seen) { setSeen(value); setText(value); setBad(false); } // the saved value changed from elsewhere
  const commit = () => { if (text === value) return setBad(false); setBad(!onCommit(text)); };
  return (
    <>
      <input type="text" inputMode="decimal" className={`gnum ${className}`} aria-label={label} aria-invalid={bad || undefined} disabled={disabled} value={text}
        onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
      {bad && error && <span className="note gerr" role="alert">{error}</span>}
    </>
  );
}
