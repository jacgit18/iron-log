import type { ComboChip } from '../../lib/recipeCombos.js';
import { chipsShown } from '../../lib/recipeCombos.js';
import './ComboChips.css';

/** The chip line under a food's row in Mine (brief recipes-combo-chips): each chip opens a combo made from this food; "+N more" expands the rest in place, "Show fewer" folds them again (nothing else in the list changes). The list holds `expanded`, so it outlives a combo's page on a phone. */
export default function ComboChips({ food, chips, expanded, onToggle, onOpen }: { food: string; chips: readonly ComboChip[]; expanded: boolean; onToggle: () => void; onOpen: (id: string) => void }) {
  const { shown, more } = chipsShown(chips, expanded);
  return (
    <div className="rc-combos">
      {shown.map(c => <button key={c.id} type="button" className="rc-combochip" aria-label={`Open ${c.name}`} onClick={() => onOpen(c.id)}>{c.label}</button>)}
      {more > 0 && <button type="button" className="rc-combochip more" aria-label={`${expanded ? 'Show fewer' : `+${more} more`} with ${food}`} onClick={onToggle}>{expanded ? 'Show fewer' : `+${more} more`}</button>}
    </div>
  );
}
