import { useMemo, useState } from 'react';
import { findMatches, type Resolved } from '../../../lib/dietPlan.js';
import { MARK_LABEL, SLOT_LABEL, boardDay, type BoardDay, type BoardSlot } from '../../../lib/weekBoard.js';
import { quickMeals } from '../../../lib/quickMeals.js';
import { parseDate } from '../../../shared/dates.js';
import type { Targets } from '../../../lib/dietTarget.js';
import { useAppStore } from '../../../store/useAppStore.js';
import type { PlanSlot } from '../../../types.ts';
import BoardCard from './BoardCard.js';
import DayBars from './DayBars.js';
import { useWideBoard } from './useWideBoard.js';
import './WeekBoard.css';

const short = (d: string) => `${parseDate(d).toLocaleDateString('en-US', { weekday: 'short' })} ${parseDate(d).getDate()}`;

// The week board (brief week-board): seven day columns (one day at a time under 1280 px), each day as Breakfast, Lunch, Dinner and Snack with a plate check and one-tap fixes,
// three bars on top, a tray of favorites and meals to add from, and drag between meals and days. Rules: lib/weekBoard.ts, lib/plate.ts.
export default function WeekBoard({ days, today, targets, onLog, onMsg }: { days: string[]; today: string; targets: Targets; onLog: (r: Resolved) => void; onMsg: (t: string) => void }) {
  const plan = useAppStore(s => s.cfg.diet?.plan) ?? {};
  const meals = useAppStore(s => s.cfg.diet?.meals) ?? [];
  const recipes = useAppStore(s => s.recipes);
  const wide = useWideBoard();
  const [pick, setPick] = useState(days[0]!);
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // "day:slot" with the finder open
  const [q, setQ] = useState('');
  const shown = days.includes(pick) ? pick : days[0]!;
  const views = useMemo(() => days.map(d => boardDay(plan, d, recipes, meals, targets.kcal)), [days, plan, recipes, meals, targets.kcal]);
  const tray = useMemo(() => [...recipes.filter(r => r.fav && r.kcal !== undefined), ...quickMeals(recipes)].filter((r, i, a) => a.findIndex(x => x.id === r.id) === i).slice(0, 10), [recipes]);
  const dayList = days.map(d => ({ id: d, label: short(d) }));
  const st = () => useAppStore.getState();
  const add = (day: string, id: string, slot: PlanSlot) => onMsg(st().addPlanItem(day, 'r', id, slot) ?? '');
  const drop = (e: React.DragEvent, day: string, slot: PlanSlot) => {
    e.preventDefault();
    try {
      const d = JSON.parse(e.dataTransfer.getData('text/plain')) as { day?: string; index?: number; tray?: string };
      if (d.tray) add(day, d.tray, slot);
      else if (d.day !== undefined && d.index !== undefined) onMsg(st().movePlanItem(d.day, d.index, day, slot) ?? '');
    } catch { /* not ours */ }
  };
  const slotView = (v: BoardDay, s: BoardSlot) => {
    const key = `${v.day}:${s.slot ?? 'none'}`;
    return (
      <div key={key} className="wb-slot" onDragOver={e => { if (s.slot) e.preventDefault(); }} onDrop={e => { if (s.slot) drop(e, v.day, s.slot); }}>
        <div className="wb-slothd"><b>{s.slot ? SLOT_LABEL[s.slot] : 'Not set'}</b><span>{s.items.length ? `${s.kcal.toLocaleString('en-US')}${s.share ? ` / ${s.share.toLocaleString('en-US')}` : ''} kcal` : s.share ? `${s.share.toLocaleString('en-US')} kcal` : ''}</span></div>
        {s.need.length > 0 && s.items.length > 0 && (
          <div className="wb-plate" role="group" aria-label={`${s.slot ? SLOT_LABEL[s.slot] : ''} plate check`}>
            {s.need.map(m => <span key={m} className={`wb-mk${s.have.includes(m) ? ' on' : ''}`}>{s.have.includes(m) ? '✓ ' : ''}{MARK_LABEL[m]}</span>)}
          </div>
        )}
        {s.items.map(x => {
          const ck = `${v.day}:${x.index}`;
          return <BoardCard key={ck} item={x} day={v.day} today={today} days={dayList} open={open === ck} moving={moving === ck} onOpen={() => { setOpen(open === ck ? null : ck); setMoving(null); }} onMoveOpen={() => setMoving(moving === ck ? null : ck)} onLog={onLog} onMsg={onMsg} />;
        })}
        {s.slot && s.fixes.map(f => <button type="button" key={f.mark} className="wb-fix" onClick={() => add(v.day, f.recipe.id, s.slot!)}>+ Add {f.mark === 'carb' ? 'a carb' : f.mark === 'protein' ? 'a protein' : 'a veg'}: {f.recipe.n}{f.why ? ` (${f.why})` : ''}</button>)}
        {s.slot && (adding === key ? (
          <div className="wb-find">
            <label className="field" htmlFor={`wb-q-${key}`}>Find a recipe
              <input id={`wb-q-${key}`} type="search" value={q} maxLength={80} autoComplete="off" onChange={e => setQ(e.target.value)} />
            </label>
            <ul className="wb-results" aria-label="Recipes to plan">
              {findMatches(recipes, q).map(r => <li key={r.id}><button type="button" className="btn sm" onClick={() => { add(v.day, r.id, s.slot!); setAdding(null); setQ(''); }}>{r.n}</button></li>)}
            </ul>
            <button type="button" className="btn sm" onClick={() => { setAdding(null); setQ(''); }}>Cancel</button>
          </div>
        ) : <button type="button" className="wb-add" aria-label={`Add to ${SLOT_LABEL[s.slot]} on ${short(v.day)}`} onClick={() => { setAdding(key); setQ(''); }}>+ Add</button>)}
      </div>
    );
  };
  const column = (v: BoardDay) => {
    const slots = [...v.slots];
    for (const s of ['breakfast', 'lunch', 'dinner', 'snack'] as const) if (!slots.some(x => x.slot === s)) slots.push({ slot: s, items: [], kcal: 0, share: null, need: [], have: [], fixes: [] });
    slots.sort((a, b) => ['', 'breakfast', 'lunch', 'dinner', 'snack'].indexOf(a.slot ?? '') - ['', 'breakfast', 'lunch', 'dinner', 'snack'].indexOf(b.slot ?? ''));
    return (
      <div key={v.day} className={`wb-col${v.day === today ? ' today' : ''}`}>
        <div className="wb-colhd"><b>{short(v.day)}{v.day === today ? ' · today' : ''}</b><span>{v.count}/8</span></div>
        <DayBars day={v} targets={targets} />
        {slots.map(s => slotView(v, s))}
      </div>
    );
  };
  return (
    <div className="wb">
      <div className="wb-legend" aria-hidden="true"><span><i className="kcal" />Calories</span><span><i className="prot" />Protein</span><span><i className="fat" />Fat</span><span><i className="over" />Over the target</span></div>
      {tray.length > 0 && (
        <div className="wb-tray" role="group" aria-label="Favorites and meals to add">
          <span className="wb-trayl">Drag, or tap to add to Dinner on {short(shown)}:</span>
          {tray.map(r => <button type="button" key={r.id} className="wb-chip" draggable onClick={() => add(shown, r.id, 'dinner')} onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify({ tray: r.id })); e.dataTransfer.effectAllowed = 'copy'; }}>{r.n}</button>)}
        </div>
      )}
      {wide ? (
        <div className="wb-board">{views.map(column)}</div>
      ) : (
        <>
          <div className="wb-daytabs" role="group" aria-label="Day">
            {dayList.map(d => <button type="button" key={d.id} className="btn sm" aria-pressed={d.id === shown} onClick={() => { setPick(d.id); setOpen(null); setMoving(null); }}>{d.label}{(plan[d.id] ?? []).length ? ` · ${(plan[d.id] ?? []).length}` : ''}</button>)}
          </div>
          {column(views[days.indexOf(shown)]!)}
        </>
      )}
    </div>
  );
}
