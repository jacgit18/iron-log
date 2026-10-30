import { useState } from 'react';
import { bwSorted } from '../../lib/body.js';
import { oldestDay, shiftDay } from '../../lib/dietLog.js';
import { recommend, targetsFor } from '../../lib/dietTarget.js';
import { fmtDayDate, ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import Icon from '../Icon.jsx';
import DietLog from './DietLog.js';
import DietTargets from './DietTargets.js';
import './Diet.css';

// Diet (ADR 086): the daily calorie and protein target and what you ate, a day at a time. Sits inside Nutrition.
export default function DietPanel() {
  const cfg = useAppStore(s => s.cfg);
  const body = useAppStore(s => s.body);
  const today = ymd(useToday(s => s.today));
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const weights = bwSorted(body);
  const latest = weights.length ? Number(weights[weights.length - 1]!.w) : null;
  const goalLb = cfg.bwGoal ? Number(cfg.bwGoal.w) : null;
  const rec = recommend(goalLb, latest);
  const t = targetsFor(cfg.diet, rec);
  return (
    <section className="panel suppanel mt-16 dt" aria-labelledby="diet-h">
      <h2 id="diet-h">Diet</h2>
      <DietTargets typed={cfg.diet} rec={rec} goalLb={goalLb} />
      <div className="dt-day">
        <button type="button" className="btn sm" disabled={day <= oldestDay(today)} onClick={() => setPicked(shiftDay(day, -1))}><Icon name="chevron-left" /> Day before</button>
        <b>{day === today ? 'Today' : fmtDayDate(day)}</b>
        <button type="button" className="btn sm" disabled={day >= today} onClick={() => { const n = shiftDay(day, 1); setPicked(n >= today ? null : n); }}>Day after <Icon name="chevron-right" /></button>
      </div>
      <DietLog day={day} kcalTarget={t.kcal} proteinTarget={t.protein} />
    </section>
  );
}
