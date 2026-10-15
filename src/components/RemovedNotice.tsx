import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import Notice from './Notice.jsx';

// The "Removed X" notice with Undo, for the list named `scope` (ADR 023). The pressed delete button is gone with its
// row (or its sheet), so focus goes to Undo the first time a removal shows, even when the list only appears because
// of it. The Undo belongs to this visit: when the list goes away (another tab), it is dropped.
let lastFocused = 0;

export default function RemovedNotice({ scope }: { scope: string }) {
  const r = useAppStore(s => (s.removed && s.removed.scope === scope ? s.removed : null));
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (r && r.id > lastFocused) { lastFocused = r.id; undoRef.current?.focus(); } }, [r]);
  useEffect(() => () => { useAppStore.getState().dismissRemoved(scope); }, [scope]);
  if (!r) return null;
  const st = useAppStore.getState();
  return (
    <Notice className="movewarn removednote" actions={[{ label: 'Undo', onClick: st.undoRemoved, btnRef: undoRef }, { label: 'Dismiss', onClick: () => st.dismissRemoved(), ghost: true }]}>
      <b>Removed</b> {r.text}.
    </Notice>
  );
}
