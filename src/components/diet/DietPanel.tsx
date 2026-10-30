import { bwSorted, goalStatus } from '../../lib/body.js';
import { recommend, targetsFor } from '../../lib/dietTarget.js';
import { fmtDayDate, ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import DietLog from './DietLog.js';
import DietPlan from './DietPlan.js';
import DietTargets from './DietTargets.js';
import './Diet.css';

// Diet (ADR 086): the daily targets and what you ate on `day`. Sits inside Nutrition, which owns the date bar (so Diet, Supplements and Water show the same day).
export default function DietPanel({ day }: { day: string }) {
  const cfg = useAppStore(s => s.cfg);
  const body = useAppStore(s => s.body);
  const now = useToday(s => s.today);
  const today = ymd(now);
  const weights = bwSorted(body);
  const latest = weights.length ? Number(weights[weights.length - 1]!.w) : null;
  const goalLb = cfg.bwGoal ? Number(cfg.bwGoal.w) : null;
  const g = goalStatus(cfg.bwGoal, body, now);
  const weeksLeft = g && 'weeksLeft' in g && typeof g.weeksLeft === 'number' ? g.weeksLeft : null; // weeks to the goal date, when one is set
  const rec = recommend(goalLb, latest, weeksLeft, cfg.diet);
  const t = targetsFor(cfg.diet, rec);
  return (
    <section className="panel suppanel dt" aria-labelledby="diet-h">
      <h2 id="diet-h">Diet</h2>
      <DietTargets typed={cfg.diet} rec={rec} goalLb={goalLb} hasDate={weeksLeft !== null && weeksLeft > 0} />
      <DietPlan targets={t} />
      <h3>Food eaten · {day === today ? 'Today' : fmtDayDate(day)}</h3>
      <DietLog day={day} targets={t} />
    </section>
  );
}
