import { useRef, useState } from 'react';
import Icon from '../Icon.js';
import { useDismiss } from '../useDismiss.js';

export type NewChoice = 'scan' | 'recipe' | 'food';
// One + New button for every way to add (briefs recipes-find-type-tabs, recipes-list-compact: three rows; the Library is the other tab): a disclosure of plain buttons, closed again by a choice, Escape or a tap outside.
// "Add a food by hand" is the old New ready-made food button: the brief lists four entries, and without it a food with no barcode and no label photo could not be typed in.
const CHOICES: { key: NewChoice; label: string; hint: string }[] = [
  { key: 'recipe', label: 'Recipe or meal', hint: 'Ingredients and steps' },
  { key: 'scan', label: 'Scan to fill a food form', hint: 'Barcode or label photo. Nothing is saved until you save' },
  { key: 'food', label: 'Add a food by hand', hint: 'A packaged food and its numbers' },
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
