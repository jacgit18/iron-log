import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore.js';

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
    <div className="notice movewarn removednote" role="status">
      <div><b>Removed</b> {r.text}.</div>
      <div className="actions">
        <button type="button" className="btn sm" ref={undoRef} onClick={st.undoRemoved}>Undo</button>
        <button type="button" className="btn sm ghost" onClick={() => st.dismissRemoved()}>Dismiss</button>
      </div>
    </div>
  );
}
