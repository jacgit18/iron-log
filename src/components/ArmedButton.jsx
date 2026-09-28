import { useState } from 'react';

// Destructive action that needs a second press to confirm. It stays armed until you press it again or
// move away (no time limit), and the armed state is part of its accessible name.
export default function ArmedButton({ label, armedLabel, onConfirm, onBlur, ...rest }) {
  const [armed, setArmed] = useState(false);
  const name = rest['aria-label'];
  return (
    <button
      type="button"
      {...rest}
      aria-label={armed && name ? `${armedLabel} ${name}` : name}
      onBlur={e => { setArmed(false); onBlur?.(e); }}
      onClick={() => { if (!armed) { setArmed(true); return; } setArmed(false); onConfirm(); }}
    >{armed ? armedLabel : label}</button>
  );
}
