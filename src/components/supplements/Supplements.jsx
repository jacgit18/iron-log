import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { ymd, parseDate, addDays, fmtShort, DAY_NAMES } from '../../lib/dates.js';
import { SLOTS, scheduled, scheduleOf, slotTally } from '../../lib/supplements.js';
import { HOT_OZ, TRAIN_OZ_PER_30, BOTTLES, CUP_OZ, OZ_PER_LB, fmtOz, cupsOf, sumOz, lastDays, goalFor } from '../../lib/water.js';

function Slot({ slot, label, date, items, taken, editing }) {
  const s = useAppStore.getState();
  const [name, setName] = useState(''); const [dose, setDose] = useState('');
  const list = scheduleOf(items)[slot]; const t = slotTally(items, taken, date, slot);
  const add = e => { e.preventDefault(); if (s.addSupplement(slot, name, dose)) { setName(''); setDose(''); } };
  return (
    <div className={`card${t.full ? ' done' : ''}`} role="group" aria-labelledby={`supp-h-${slot}`}>
      <div className="warmhead">
        <h3 id={`supp-h-${slot}`} className="exh"><b>{label}</b></h3>
        <span className="note">{t.total ? `${t.done}/${t.total}` : ''}</span>
      </div>
      {!list.length && <p className="note">{editing ? 'Nothing here yet. Add one below.' : 'Nothing scheduled.'}</p>}
      {list.map(x => (
        <div key={x.id} className={`warmrow${(taken[date] || {})[x.id] ? ' idone' : ''}`}>
          <label className="exname">
            <input type="checkbox" className="chk" id={`supp-${x.id}`} checked={!!(taken[date] || {})[x.id]} onChange={e => s.setSupplementTaken(date, x.id, e.target.checked)} />{' '}
            {x.n}{x.dose && <span className="rx"> · {x.dose}</span>}
          </label>
          {editing && <button type="button" className="btn sm ghost" aria-label={`Take ${x.n} off ${label}`} onClick={() => s.removeSupplement(x.id)}>Remove</button>}
        </div>
      ))}
      {editing && (
        <form className="warmadd" onSubmit={add}>
          <input type="text" id={`suppname-${slot}`} aria-label={`Supplement name, ${label}`} placeholder="Supplement" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
          <input type="text" aria-label={`Dose, ${label} (optional)`} placeholder="Dose (optional)" maxLength={40} value={dose} onChange={e => setDose(e.target.value)} />
          <button type="submit" className="btn sm" id={`suppadd-${slot}`} disabled={!name.trim()}>Add</button>
        </form>
      )}
      {editing && items.some(i => !i.slot) && (
        <label className="field">Add from your library
          <select id={`supplib-${slot}`} value="" onChange={e => { if (e.target.value) s.setSupplementSlot(e.target.value, slot); }}>
            <option value="">Choose…</option>
            {items.filter(i => !i.slot).map(i => <option key={i.id} value={i.id}>{i.n}{i.dose ? ` · ${i.dose}` : ''}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

function Schedule({ date, supp }) {
  const [editing, setEditing] = useState(false);
  const all = scheduled(supp.items); const done = all.filter(x => (supp.taken[date] || {})[x.id]).length;
  return (
    <section className="panel" aria-labelledby="sched-h">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="sched-h">Supplements</h2>
        <span className="inline"><span className="note" role="status">{all.length ? `${done} of ${all.length} taken` : ''}</span>
          <button type="button" className="btn sm ghost" id="sched-edit" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? 'Done' : 'Edit'}</button></span>
      </div>
      {!all.length && !editing && <p className="note">Nothing scheduled yet. Use Edit to add what you take in the morning, at noon and at night, or build your list in Program, Supplement library.</p>}
      {SLOTS.map(([k, l]) => <Slot key={k} slot={k} label={l} date={date} items={supp.items} taken={supp.taken} editing={editing} />)}
    </section>
  );
}

function WaterGoal({ goal, mode }) {
  const s = useAppStore.getState();
  const [editing, setEditing] = useState(false); const [v, setV] = useState('');
  const text = goal.source === 'weight' ? `Base goal: ${fmtOz(goal.baseOz)} oz, half your ${fmtOz(goal.lb)} lb body weight`
    : goal.source === 'default' ? `Base goal: ${fmtOz(goal.baseOz)} oz (log your body weight on the Board to set it from your weight)` : `Base goal: ${fmtOz(goal.baseOz)} oz, set by you`;
  if (!editing) return <div className="inline"><span className="note">{text}</span><button type="button" className="btn sm ghost" id="water-goal-edit" onClick={() => { setV(fmtOz(goal.baseOz)); setEditing(true); }}>Change goal</button></div>;
  return (
    <form className="inline" noValidate style={{ flexWrap: 'wrap' }} onSubmit={e => { e.preventDefault(); if (s.setWaterGoal(v)) setEditing(false); }}>
      <label className="field">Fixed daily goal (oz)<input type="number" inputMode="decimal" min="8" max="500" step="any" value={v} autoFocus onChange={e => setV(e.target.value)} /></label>
      <button type="submit" className="btn sm primary">Use this amount</button>
      {mode === 'fixed' && <button type="button" className="btn sm" onClick={() => { s.setWaterByWeight(); setEditing(false); }}>Use my weight ({OZ_PER_LB} oz per lb)</button>}
      <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

function Boost({ date, boost, extra }) {
  const s = useAppStore.getState(); const [m, setM] = useState(''); const mins = boost && boost.mins ? String(boost.mins) : '';
  useEffect(() => { setM(mins); }, [date, mins]);
  return (
    <div>
      <div className="sect">Hot day or training</div>
      <div className="inline" style={{ flexWrap: 'wrap' }}>
        <label><input type="checkbox" className="chk" id="water-hot" checked={!!(boost && boost.hot)} onChange={e => s.setWaterBoost(date, { hot: e.target.checked })} /> Hot day (+{HOT_OZ} oz)</label>
        <label className="field">Training (minutes)<input id="water-train" type="number" inputMode="numeric" min="0" max="600" step="5" value={m} onChange={e => setM(e.target.value)} onBlur={() => { if (m !== mins) s.setWaterBoost(date, { mins: m }); }} /></label>
      </div>
      <p className="note">{extra.oz > 0 ? `+${fmtOz(extra.oz)} oz on the goal${extra.hot ? ` (heat ${fmtOz(extra.hot)}` : ''}${extra.hot && extra.train ? ', ' : extra.hot ? ')' : ''}${extra.train ? `${extra.hot ? '' : ' ('}training ${fmtOz(extra.train)})` : ''}` : `Adds ${TRAIN_OZ_PER_30} oz per 30 minutes of training and ${HOT_OZ} oz on a hot day.`}</p>
    </div>
  );
}

function Week({ water, goalOf, end, selected, onPick }) {
  const days = lastDays(water, end, 7, ymd).map(x => ({ ...x, goal: goalOf(x.d) })); const max = Math.max(...days.map(x => Math.max(x.goal, x.oz)));
  return (
    <div className="mbars" role="list" aria-label="Last 7 days of water">
      {days.map(x => (
        <button type="button" role="listitem" key={x.d} className="mbar" aria-current={x.d === selected ? 'date' : undefined} aria-label={`${DAY_NAMES[x.date.getDay()]} ${fmtShort(x.date)}: ${fmtOz(x.oz)} oz${x.oz >= x.goal ? ', goal met' : ''}`} onClick={() => onPick(x.d)}>
          <span>{DAY_NAMES[x.date.getDay()].slice(0, 3)} {x.date.getDate()}</span>
          <span className="track"><i className="l3" style={{ width: `${x.oz / max * 100}%`, background: x.oz >= x.goal ? 'var(--accent)' : undefined }} /></span>
          <b>{fmtOz(x.oz)}</b>
        </button>
      ))}
    </div>
  );
}

export default function Supplements() {
  const supp = useAppStore(s => s.supp);
  const body = useAppStore(s => s.body);
  const today = useToday(s => s.today);
  const s = useAppStore.getState();
  const todayKey = ymd(today);
  const [sel, setSel] = useState(null); const date = sel || todayKey;
  const [custom, setCustom] = useState('');
  const list = supp.water[date] || []; const total = sumOz(list); const gi = goalFor(supp, body, date); const goal = gi.oz;
  const pct = Math.min(100, Math.round(total / goal * 100)); const left = Math.max(0, goal - total);
  const d = parseDate(date); const isToday = date === todayKey;
  const step = n => { const k = ymd(addDays(d, n)); if (k <= todayKey) setSel(k === todayKey ? null : k); };
  const add = oz => { s.addWater(date, oz); };
  return (
    <div>
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous day" onClick={() => step(-1)}>‹</button>
          <h2 className="cond">{isToday ? 'Today' : DAY_NAMES[d.getDay()]} · {fmtShort(d)}</h2>
          <button type="button" className="btn sm" aria-label="Next day" disabled={isToday} onClick={() => step(1)}>›</button>
          {!isToday && <button type="button" className="btn sm ghost" onClick={() => setSel(null)}>Today</button>}
        </div>
      </div>
      <Schedule date={date} supp={supp} />
      <section className="panel" style={{ marginTop: 16 }} aria-labelledby="water-h">
        <h2 id="water-h">Water</h2>
        <div className="kpi" role="status">
          <span className="kl">{isToday ? 'Today' : 'That day'}</span>
          <span className="kv">{fmtOz(total)} <small>/ {fmtOz(goal)} oz</small></span>
          <span className="ks">{cupsOf(total)} of {cupsOf(goal)} cups · {left > 0 ? `${fmtOz(left)} oz (${cupsOf(left)} cups) to go` : 'goal met'}</span>
          <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div>
          <div className="sect">Add a drink</div>
          <div className="chips" role="group" aria-label="Add water by container size">
            {BOTTLES.map(b => (
              <button type="button" key={b.oz} className="chip" id={`water-${b.oz}`} aria-label={`Add ${fmtOz(b.oz)} ounces, ${b.label}`} onClick={() => add(b.oz)}>
                <b>+{fmtOz(b.oz)} oz</b> <span className="note">{b.label}{b.oz % CUP_OZ === 0 ? ` · ${b.oz / CUP_OZ} cup${b.oz === CUP_OZ ? '' : 's'}` : ''}</span>
              </button>
            ))}
          </div>
          <form className="inline" noValidate style={{ marginTop: 8 }} onSubmit={e => { e.preventDefault(); if (s.addWater(date, custom)) setCustom(''); }}>
            <label className="field">Other amount (oz)<input id="water-custom" type="number" inputMode="decimal" min="0" step="any" value={custom} onChange={e => setCustom(e.target.value)} /></label>
            <button type="submit" className="btn sm primary" disabled={custom === ''}>Add</button>
          </form>
        </div>
        <div>
          <div className="sect">{isToday ? 'Logged today' : 'Logged'}</div>
          {!list.length ? <p className="note">Nothing logged yet.</p> : (
            <ul className="exrows" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {list.map((oz, i) => (
                <li className="exrow" key={i}>
                  <span><b>{fmtOz(oz)} oz</b> <span className="note">{cupsOf(oz)} cups</span></span>
                  <button type="button" className="btn sm ghost" aria-label={`Remove ${fmtOz(oz)} ounces, drink ${i + 1}`} onClick={() => s.removeWater(date, i)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Boost date={date} boost={supp.boost[date]} extra={gi.extra} />
        <WaterGoal goal={gi} mode={supp.waterMode} />
      </section>
      <section className="panel" style={{ marginTop: 16 }} aria-labelledby="water7-h">
        <h2 id="water7-h">Last 7 days</h2>
        <Week water={supp.water} goalOf={k => goalFor(supp, body, k).oz} end={d} selected={date} onPick={k => setSel(k === todayKey ? null : k)} />
        <p className="note">Ounces per day. A full bar means you hit your goal.</p>
      </section>
    </div>
  );
}
