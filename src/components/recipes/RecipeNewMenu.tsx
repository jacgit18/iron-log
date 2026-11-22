import { useRef, useState } from 'react';
import Icon from '../Icon.js';
import { useDismiss } from '../useDismiss.js';

export type NewChoice = 'recipe' | 'food';
// One + New button for every way to add (briefs recipes-find-type-tabs, recipes-list-compact: the Library is the other tab; one way into a food, R4 of the button review: two rows): a disclosure of plain buttons, closed again by a choice, Escape or a tap outside.
// "Add a food" opens the food form, which has the scan buttons (barcode, label photo, choose photo) and the lookup box: one way in, not a separate scan entry.
const CHOICES: { key: NewChoice; label: string; hint: string }[] = [
  { key: 'recipe', label: 'Recipe or meal', hint: 'Ingredients and steps' },
  { key: 'food', label: 'Add a food', hint: 'Type it, or scan a barcode or a label photo. Nothing is saved until you save' },
];

export default function RecipeNewMenu({ onChoose }: { onChoose: (c: NewChoice) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(open, box, () => setOpen(false), { returnFocus: () => box.current?.querySelector('button')?.focus() });
  return (
    <div className="rc-new" ref={box}>
      <button type="button" className="btn" id="recipes-new" aria-expanded={open} aria-controls="recipes-new-list" onClick={() => setOpen(!open)}><Icon name="plus" /> New</button>
      {open && (
        <ul className="rc-newlist" id="recipes-new-list">
          {CHOICES.map(c => (
            <li key={c.key}><button type="button" onClick={() => { setOpen(false); onChoose(c.key); }}><b>{c.label}</b><span>{c.hint}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
