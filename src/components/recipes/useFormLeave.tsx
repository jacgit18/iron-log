import { useEffect, useRef, useState } from 'react';
import { setFormGuard } from '../../lib/recipeFormGuard.js';
import { backAction, sectionTap } from '../../lib/recipeSaferEditing.js';

/** "Discard changes?" for a recipe form (brief recipe-safer-editing): Back, Cancel, reload and a Daily section tap ask before edits are lost.
 *  `pickerOpen` is the amount picker on screen (only the recipe form has one). `leave` closes the form (the way Cancel does). The form sets `gone.current`
 *  once it saved, so leaving needs no question. A section tap hands over `go`, which runs instead of `leave` when the person discards. */
export function useFormLeave(o: { edited: boolean; pickerOpen: boolean; closePicker: () => void; leave: () => void }) {
  const [asking, setAsking] = useState(false);
  const gone = useRef(false);
  const pendingGo = useRef<(() => void) | null>(null);
  const live = useRef({ ...o, asking });
  live.current = { ...o, asking };
  const state = () => backAction({ edited: live.current.edited && !gone.current, pickerOpen: live.current.pickerOpen, asking: live.current.asking });
  const keep = () => { pendingGo.current = null; setAsking(false); };
  useEffect(() => setFormGuard({
    holds: () => state() !== 'leave',
    ask: () => { pendingGo.current = null; if (state() === 'close-picker') live.current.closePicker(); else setAsking(true); }, // Back: the picker first, the question next
    tap: go => { // a Daily section tap: the picker closes, then the tap goes on (sectionTap)
      const s = live.current;
      if (s.pickerOpen) s.closePicker();
      if (sectionTap({ edited: s.edited && !gone.current, asking: s.asking, pickerOpen: s.pickerOpen }) === 'ask') { pendingGo.current = go; setAsking(true); } else go();
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps -- reads the latest state through `live`
  useEffect(() => {
    if (!o.edited) return;
    const warn = (e: BeforeUnloadEvent) => { if (gone.current) return; e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [o.edited]);
  useEffect(() => { if (asking) document.getElementById('rc-keep')?.focus(); }, [asking]);
  const cancel = () => { if (o.edited && !gone.current) { pendingGo.current = null; setAsking(true); } else o.leave(); };
  const discard = () => { gone.current = true; setAsking(false); const go = pendingGo.current; pendingGo.current = null; if (go) go(); else o.leave(); };
  return { asking, gone, keep, cancel, discard };
}

/** The question itself; Escape takes it back. */
export function LeavePrompt({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="rc-leave" role="group" aria-label="Discard changes?" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onKeep(); } }}>
      <p><strong>Discard changes?</strong> Your edits to this recipe are not saved.</p>
      <button type="button" id="rc-keep" className="btn" onClick={onKeep}>Keep editing</button>
      <button type="button" className="btn" onClick={onDiscard}>Discard</button>
    </div>
  );
}
