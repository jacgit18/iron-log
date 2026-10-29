import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ---------- "Saved" ticks ----------
   A field that saves when you leave it gets a short tick beside it, so a change is seen to land without scrolling up to the header.
   Kept here, not in CommitInput: Settings remounts a field (its `key`) once its value saves. Visual only: the header's status line
   already announces "Saved" to screen readers. */
const SAVED_MS = 3000;
const SavedCtx = createContext<{ saved: string | null; mark: (id: string) => void }>({ saved: null, mark: () => {} });
export function SavedTicks({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mark = useCallback((id: string) => {
    setSaved(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(null), SAVED_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <SavedCtx.Provider value={{ saved, mark }}>{children}</SavedCtx.Provider>;
}
// Wraps a field's onCommit: a save that was not refused ticks that field.
export function useSaving() {
  const { mark } = useContext(SavedCtx);
  return (id: string, save: (v: string) => unknown) => (v: string) => { const r = save(v); if (r !== false) mark(id); return r; };
}
export function Tick({ id }: { id: string }) {
  const { saved } = useContext(SavedCtx);
  return saved === id ? <span className="savedtick" aria-hidden="true">✓ Saved</span> : null;
}
