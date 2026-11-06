import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> & { value: string | number | null | undefined; onCommit: (v: string) => unknown; onType?: (v: string) => void };

// Input that saves when you leave it or press Enter, and only if the value changed.
// If onCommit returns false the edit is rejected and the field goes back to the saved value.
// Remount it with a `key` when the value it edits is replaced from outside. `onType` reports every keystroke (for something shown beside the field).
export default function CommitInput({ value, onCommit, onType, ...rest }: Props) {
  const initial = value == null ? '' : String(value);
  const [v, setV] = useState(initial);
  const commit = () => { if (v !== initial && onCommit(v) === false) setV(initial); };
  return (
    <input
      {...rest}
      value={v}
      onChange={e => { setV(e.target.value); onType?.(e.target.value); }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}
