import { useState } from 'react';
import { HOT_OZ, TRAIN_OZ_PER_30, hydrationView, longDay, shortDay } from '../../lib/nutritionBoard.js';
import { BOTTLES, CUP_OZ, cupsOf, fmtOz } from '../../lib/water.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import Sheet from '../Sheet.js';
import '../supplements/Supplements.css';

// The drink sheet (brief nutrition-board): the day's water against its goal, a button for every container size, another amount, hot day and training minutes, the goal broken down line by line, the drinks logged (Remove, with Undo). A day ahead sets the goal and logs no drinks.
// It calls the same store actions the Water panel did: addWater, removeWater, setWaterBoost. The base goal is changed in Targets and goal. `modal.day` is the day.
export default function DrinkSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const supp = useAppStore(s => s.supp);
  const body = useAppStore(s => s.body);
  const today = ymd(useToday(s => s.today));
  const day = typeof modal?.day === 'string' ? modal.day : today;
  const h = hydrationView(day, today, supp, body);
  const list = supp.water[day] ?? [];
  const mins = supp.boost[day]?.mins ? String(supp.boost[day]!.mins) : '';
  const [custom, setCustom] = useState('');
  const [m, setM] = useState(mins);
  const st = () => useAppStore.getState();
  const pct = Math.min(100, Math.round((h.drunk / h.goal) * 100));
  return (
    <Sheet className="nbsheet" aria-label={`Hydration, ${longDay(day)}`}>
      <h2 className="cond">Hydration · {shortDay(day)}{day === today ? ' · today' : ''}</h2>
      <div className="kpi wkpi" role="status">
        <span className="kv">{fmtOz(h.drunk)} <small>/ {fmtOz(h.goal)} oz</small></span>
        <span className="ks">{cupsOf(h.drunk)} of {cupsOf(h.goal)} cups · {h.left > 0 ? `${fmtOz(h.left)} oz to go` : 'goal met'}</span>
        <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
      </div>
      {h.future ? <p className="note">This day has not happened yet. Set the goal ahead; drinks are logged on the day.</p> : (
        <>
          <div className="sect">Add a drink</div>
          <div className="chips wchips" role="group" aria-label="Add water by container size">
            {BOTTLES.map(b => (
              <button type="button" key={b.oz} className="chip" id={`water-${b.oz}`} onClick={() => st().addWater(day, b.oz)}>
                <b>+{fmtOz(b.oz)} oz</b> <span className="note">{b.label}{b.oz % CUP_OZ === 0 ? ` · ${b.oz / CUP_OZ} cup${b.oz === CUP_OZ ? '' : 's'}` : ''}</span>
              </button>
            ))}
          </div>
          <form className="wcustom" noValidate onSubmit={e => { e.preventDefault(); if (st().addWater(day, custom)) setCustom(''); }}>
            <label className="field">Other amount (oz)<input id="water-custom" type="number" inputMode="decimal" min="0" step="any" value={custom} onChange={e => setCustom(e.target.value)} /></label>
            <button type="submit" className="btn sm primary" disabled={custom === ''}>Add</button>
          </form>
        </>
      )}
      <div className="sect">Hot day or training</div>
      <div className="wboost">
        <label className="whot"><input type="checkbox" className="chk" id="water-hot" checked={!!supp.boost[day]?.hot} onChange={e => st().setWaterBoost(day, { hot: e.target.checked })} /> Hot day (+{HOT_OZ} oz)</label>
        <label className="field">Training (minutes)<input id="water-train" type="number" inputMode="numeric" min="0" max="600" step="5" value={m} onChange={e => setM(e.target.value)} onBlur={() => { if (m !== mins && !st().setWaterBoost(day, { mins: m })) setM(mins); }} /></label>
      </div>
      <p className="note">{`Adds ${TRAIN_OZ_PER_30} oz per 30 minutes of training and ${HOT_OZ} oz on a hot day.`}</p>
      <div className="sect">Goal</div>
      <div className="nb-breakdown" role="group" aria-label="Goal breakdown">
        {h.lines.map(l => <div key={l.label}><span>{l.label}</span><b>{l.label.startsWith('Base') ? '' : '+'}{fmtOz(l.oz)} oz</b></div>)}
        <div><span><b>Goal</b></span><b>{fmtOz(h.goal)} oz</b></div>
      </div>
      <button type="button" className="btn sm ghost" id="water-goal-targets" onClick={() => st().openModal({ type: 'nbtargets' })}>Change base goal</button>
      {!h.future && (
        <>
          <div className="sect">Logged</div>
          <RemovedNotice scope={'water:' + day} />
          {!list.length ? <p className="note">Nothing logged yet.</p> : <Drinks day={day} list={list} />}
        </>
      )}
      <div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Done</button></div>
    </Sheet>
  );
}

function Drinks({ day, list }: { day: string; list: number[] }) {
  const [arming, setArming] = useState<number | null>(null);
  return (
    <ul className="exrows wlogged">
      {list.map((oz, i) => (
        <li className={`exrow${arming === i ? ' removing' : ''}`} key={i}>
          <span><b className="rmname">{fmtOz(oz)} oz</b> <span className="note">{cupsOf(oz)} cups</span></span>
          <ArmedButton className={`btn sm ${arming === i ? 'danger' : 'ghost'}`} aria-label={`Remove ${fmtOz(oz)} ounces, drink ${i + 1}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? i : null)} onConfirm={() => { setArming(null); useAppStore.getState().removeWater(day, i); }} />
        </li>
      ))}
    </ul>
  );
}
