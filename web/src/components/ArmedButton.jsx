import { useEffect, useRef, useState } from 'react';

// Destructive action that needs a second tap within 3 seconds; the label changes to confirm.
export default function ArmedButton({ label, armedLabel, onConfirm, ...rest }) {
  const [armed, setArmed] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      {...rest}
      onClick={() => {
        if (!armed) { setArmed(true); clearTimeout(t.current); t.current = setTimeout(() => setArmed(false), 3000); return; }
        clearTimeout(t.current); setArmed(false); onConfirm();
      }}
    >{armed ? armedLabel : label}</button>
  );
}
