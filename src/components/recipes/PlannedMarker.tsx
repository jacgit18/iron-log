import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { ymd } from '../../shared/dates.js';
import { PLANNED_DAYS, plannedIndex, plannedPill, plannedWhen, spotText, type PlannedIndex, type PlannedSpot } from '../../lib/plannedOnBoard.js';
import { useLegacyMeals } from '../../store/useLegacyMeals.js';
import { useToday } from '../../store/useToday.js';
import './PlannedMarker.css';

// The planned marker on Foods (brief foods-made-and-store-bought, PR 3): what the Nutrition board has planned in the next 7 days, read from the plan, never stored. The rules are in lib/plannedOnBoard.ts.

/** The board's planned foods for the next 7 days, by recipe id; recomputed only when the plan, the log, the foods or the day change. */
export function usePlannedIndex(): PlannedIndex {
  const plan = useAppStore(s => s.cfg.diet?.plan);
  const repeats = useAppStore(s => s.cfg.diet?.repeats);
  const repeatSkips = useAppStore(s => s.cfg.diet?.repeatSkips);
  const { moved } = useLegacyMeals();
  const entries = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const today = ymd(useToday(s => s.today));
  return useMemo(() => plannedIndex({ plan, repeats, repeatSkips, moved }, entries, recipes, today), [plan, repeats, repeatSkips, moved, entries, recipes, today]);
}

/** The pill on a Foods row: "Planned · Thu lunch". Text, not colour alone; nothing when the food is not planned. */
export function PlannedPill({ spots }: { spots: readonly PlannedSpot[] }) {
  const text = plannedPill(spots);
  return text ? <span className="rc-planned">{text}</span> : null;
}

/** The "Planned on the board" panel of a food's page: each planned day and meal in the next 7 days, or a line saying there are none. */
export function PlannedPanel({ id }: { id: string }) {
  const spots = plannedWhen(usePlannedIndex(), id);
  return (
    <section className="rc-plannedbox" aria-labelledby="rc-plannedh">
      <h3 id="rc-plannedh">Planned on the board</h3>
      {spots.length
        ? <p>{spots.map(spotText).join(', ')} <span className="rc-plannednote">(next {PLANNED_DAYS} days)</span></p>
        : <p>Not planned in the next {PLANNED_DAYS} days.</p>}
    </section>
  );
}
