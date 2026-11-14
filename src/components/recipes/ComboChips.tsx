import { useState } from 'react';
import type { ComboChip } from '../../lib/recipeCombos.js';
import { chipsShown } from '../../lib/recipeCombos.js';
import './ComboChips.css';

/** The chip line under a food's row in Mine (brief recipes-combo-chips): each chip opens a combo made from this food; "+N more" expands the rest in place, "Show fewer" folds them again (nothing else in the list changes). */
export default function ComboChips({ food, chips, onOpen }: { food: string; chips: readonly ComboChip[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { shown, more } = chipsShown(chips, expanded);
  return (
    <div className="rc-combos">
      {shown.map(c => <button key={c.id} type="button" className="rc-combochip" aria-label={`Open ${c.name}`} onClick={() => onOpen(c.id)}>{c.label}</button>)}
      {more > 0 && <button type="button" className="rc-combochip more" aria-expanded={expanded} aria-label={`${expanded ? 'Show fewer' : `+${more} more`} with ${food}`} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `+${more} more`}</button>}
    </div>
  );
}
