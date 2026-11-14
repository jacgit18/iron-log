import type { ComboChip } from '../../lib/recipeCombos.js';
import { chipsShown } from '../../lib/recipeCombos.js';
import './ComboChips.css';

/** The chip line under a food's row in Mine (brief recipes-combo-chips): each chip opens a combo made from this food; "+N more" lists them in Meals. */
export default function ComboChips({ chips, owner, onOpen, onMore }: { chips: readonly ComboChip[]; owner: string; onOpen: (id: string) => void; onMore: () => void }) {
  const { shown, more } = chipsShown(chips);
  return (
    <div className="rc-combos">
      {shown.map(c => <button key={c.id} type="button" className="rc-combochip" aria-label={`Open ${c.name}`} onClick={() => onOpen(c.id)}>{c.label}</button>)}
      {more > 0 && <button type="button" className="rc-combochip more" aria-label={`+${more} more with ${owner}`} onClick={onMore}>+{more} more</button>}
    </div>
  );
}
