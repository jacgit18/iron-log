import { useState, type ButtonHTMLAttributes, type FocusEvent } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'> & { label: string; armedLabel: string; onConfirm: () => unknown; onBlur?: (e: FocusEvent<HTMLButtonElement>) => void; onArmedChange?: (armed: boolean) => void };

// Destructive action that needs a second press to confirm. It stays armed until you press it again or
// move away (no time limit), and the armed state is part of its accessible name. `onArmedChange` lets the
// caller mark what the second press would act on (the Program editor highlights the row about to go).
export default function ArmedButton({ label, armedLabel, onConfirm, onBlur, onArmedChange, ...rest }: Props) {
  const [armed, setArmedState] = useState(false);
  const setArmed = (v: boolean) => { if (v !== armed) onArmedChange?.(v); setArmedState(v); };
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
