import { useId, useState } from 'react';
import { ymd } from '../../shared/dates.js';
import { ESTIMATED } from '../../lib/microLine.js';
import { showsEstimateNote } from '../../lib/recipeNutrition.js';
import { recipeMicroRows } from '../../lib/recipeMicroRows.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { Recipe } from '../../types.ts';
import './RecipeMicro.css';

// The vitamins and minerals of a recipe or ready-made food that has its own `micro` (brief recipe-auto-nutrition, preview option A): the same folded control and words as `MealMicroBars`, one bar per nutrient against a day's
// recommended amount. A meal built from linked foods gets no rows (`recipeMicroRows`) and keeps its part-by-part bars.
export default function RecipeMicro({ recipe }: { recipe: Recipe }) {
  const profile = useAppStore(s => s.cfg.profile);
  const today = ymd(useToday(s => s.today));
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rows = recipeMicroRows(recipe, profile, today);
  if (!rows.length) return null;
  return (
    <section className="rmi" aria-label="Vitamins and minerals">
      <button type="button" className="btn sm rmi-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
        {open ? 'Hide vitamins and minerals' : `Vitamins and minerals: ${rows.length} listed`}
      </button>
      {open && (
        <div id={panelId} className="rmi-panel">
          <ul className="rmi-rows">
            {rows.map(r => (
              <li className="rmi-row" key={r.key}>
                <div className="rmi-top"><strong>{r.label}</strong><span className="rmi-val">{r.figure}<span className="rmi-pct"> · {r.percent}% of a day</span></span></div>
                <div className="rmi-track" role="img" aria-label={r.name}><i style={{ width: `${r.bar}%` }} /></div>
              </li>
            ))}
          </ul>
          <p className="note">Numbers are per serving, against a day’s recommended amount.{recipe.est && !showsEstimateNote(recipe) ? ` ${ESTIMATED}: worked out from ${recipe.est.of} of ${recipe.est.n} ingredients, not from a label.` : ''}</p>
        </div>
      )}
    </section>
  );
}
