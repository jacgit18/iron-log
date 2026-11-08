import { bwSorted, goalStatus } from '../../lib/body.js';
import { recommend } from '../../lib/dietTarget.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import DietTargets from './DietTargets.js';
import './Diet.css';

// Diet (ADR 086), now just the daily targets: the day's food, plan, supplements and water live on the Nutrition week board (nutritionBoard/). PR 2 of brief nutrition-board moves this into a Targets and goal sheet.
export default function DietPanel() {
  const cfg = useAppStore(s => s.cfg);
  const body = useAppStore(s => s.body);
  const now = useToday(s => s.today);
  const weights = bwSorted(body);
  const latest = weights.length ? Number(weights[weights.length - 1]!.w) : null;
  const goalLb = cfg.bwGoal ? Number(cfg.bwGoal.w) : null;
  const g = goalStatus(cfg.bwGoal, body, now);
  const weeksLeft = g && 'weeksLeft' in g && typeof g.weeksLeft === 'number' ? g.weeksLeft : null; // weeks to the goal date, when one is set
  const rec = recommend(goalLb, latest, weeksLeft, cfg.diet);
  return (
    <section className="panel suppanel dt" aria-labelledby="diet-h">
      <h2 id="diet-h">Diet</h2>
      <DietTargets typed={cfg.diet} rec={rec} goalLb={goalLb} hasDate={weeksLeft !== null && weeksLeft > 0} />
    </section>
  );
}
