import { useState } from 'react';
import { bwSorted, goalStatus } from '../../lib/body.js';
import { recommend } from '../../lib/dietTarget.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import DietTargets from '../diet/DietTargets.js';
import Sheet from '../Sheet.js';
import WaterGoal from './WaterGoal.js';
import '../diet/Diet.css';
import '../supplements/Supplements.css';

// Targets and goal (brief nutrition-board, PR 2): one sheet for the calorie and protein targets (typed or recommended), body weight, goal weight and date, and the base water goal.
// Each part keeps the store action it always had: setDietTarget / setDietPace (DietTargets), saveBodyWeight, setBodyGoal, clearBodyGoal, setWaterGoal.
export default function TargetsSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  const cfg = useAppStore(s => s.cfg);
  const body = useAppStore(s => s.body);
  const now = useToday(s => s.today);
  const weights = bwSorted(body);
  const latest = weights.length ? Number(weights[weights.length - 1]!.w) : null;
  const goalLb = cfg.bwGoal ? Number(cfg.bwGoal.w) : null;
  const g = goalStatus(cfg.bwGoal, body, now);
  const weeksLeft = g && 'weeksLeft' in g && typeof g.weeksLeft === 'number' ? g.weeksLeft : null; // weeks to the goal date, when one is set
  const rec = recommend(goalLb, latest, weeksLeft, cfg.diet);
  const [w, setW] = useState('');
  const [gw, setGw] = useState(goalLb !== null ? String(goalLb) : '');
  const [by, setBy] = useState(cfg.bwGoal?.by ?? '');
  const st = () => useAppStore.getState();
  return (
    <Sheet className="nbsheet" aria-label="Targets and goal">
      <h2 className="cond" id="diet-h">Targets and goal</h2>
      <div className="dt"><DietTargets typed={cfg.diet} rec={rec} goalLb={goalLb} hasDate={weeksLeft !== null && weeksLeft > 0} /></div>
      <div className="sect">Body weight</div>
      <form className="wcustom" noValidate onSubmit={e => { e.preventDefault(); if (st().saveBodyWeight(w)) setW(''); }}>
        <label className="field">{latest !== null ? `Weight this week (lb), last ${latest}` : 'Weight this week (lb)'}<input id="nbt-weight" type="number" inputMode="decimal" min="0" step="any" value={w} onChange={e => setW(e.target.value)} /></label>
        <button type="submit" className="btn sm primary" disabled={w === ''}>Save weight</button>
      </form>
      <div className="sect">Goal weight</div>
      <form className="wgoalform" noValidate onSubmit={e => { e.preventDefault(); st().setBodyGoal(gw, by || undefined); }}>
        <label className="field">Goal weight (lb)<input id="nbt-goal" type="number" inputMode="decimal" min="0" step="any" value={gw} onChange={e => setGw(e.target.value)} /></label>
        <label className="field">By (optional)<input id="nbt-goal-by" type="date" value={by} onChange={e => setBy(e.target.value)} /></label>
        <button type="submit" className="btn sm primary" disabled={gw === ''}>Save goal</button>
        {cfg.bwGoal && <button type="button" className="btn sm ghost" onClick={() => { st().clearBodyGoal(); setGw(''); setBy(''); }}>Clear goal</button>}
      </form>
      <div className="sect">Water</div>
      <WaterGoal day={ymd(now)} />
      <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Done</button></div>
    </Sheet>
  );
}
