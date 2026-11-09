import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.js';

export type NewChoice = 'scan' | 'meal' | 'recipe' | 'library' | 'food';
// One + New button for every way to add (brief recipes-find-type-tabs): a disclosure of plain buttons, closed again by a choice, Escape or a tap outside.
// "Add a food by hand" is the old New ready-made food button: the brief lists four entries, and without it a food with no barcode and no label photo could not be typed in.
const CHOICES: { key: NewChoice; label: string; hint: string }[] = [
  { key: 'scan', label: 'Scan a food', hint: 'Barcode or label, fills a ready-made food' },
  { key: 'meal', label: 'Build a meal', hint: 'Ingredients and steps' },
  { key: 'recipe', label: 'Write a recipe', hint: 'Your own, ingredient by ingredient' },
  { key: 'library', label: 'Browse the Library', hint: 'Copy a ready recipe into Mine' },
  { key: 'food', label: 'Add a food by hand', hint: 'A packaged food and its numbers' },
];

export default function RecipeNewMenu({ onChoose }: { onChoose: (c: NewChoice) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
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
