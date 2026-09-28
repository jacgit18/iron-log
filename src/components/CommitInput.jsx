import { useState } from 'react';

// Input that saves when you leave it or press Enter, and only if the value changed.
// If onCommit returns false the edit is rejected and the field goes back to the saved value.
// Remount it with a `key` when the value it edits is replaced from outside.
export default function CommitInput({ value, onCommit, ...rest }) {
  const initial = value == null ? '' : String(value);
  const [v, setV] = useState(initial);
  const commit = () => { if (v !== initial && onCommit(v) === false) setV(initial); };
  return (
    <input
      {...rest}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}
