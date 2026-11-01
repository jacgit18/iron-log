import type { Boost as BoostT, SupplementItem, SupplementSlot, Supplements, Taken } from '../../types.ts';
import type { MineOption, PickerChoice } from '../../lib/picker.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { ymd, parseDate, addDays, fmtShort, DAY_NAMES } from '../../shared/dates.js';
import { SLOTS, scheduled, scheduleOf, slotLabel, slotTally } from '../../lib/supplements.js';
import { pickerKey } from '../../lib/picker.js';
import Icon from '../Icon.jsx';
import ItemPicker from '../ItemPicker.jsx';
import Diet from './Diet.js';
import SupplementLibrary from './SupplementLibrary.jsx';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import './Supplements.css';
import { HOT_OZ, TRAIN_OZ_PER_30, BOTTLES, CUP_OZ, OZ_PER_LB, fmtOz, cupsOf, sumOz, lastDays, goalFor, boostOz } from '../../lib/water.js';

// One of yours as the add picker lists it: where it is now and its dose; badged Library or Custom only when syncing (ADR 027).
const mineOf = (i: SupplementItem, syncing: boolean): MineOption => ({
  id: i.id, name: i.n, ...(i.brand ? { brand: i.brand } : {}), ...(i.catalogId ? { catalogId: i.catalogId } : {}),
  meta: [i.brand, i.slot ? `In ${slotLabel(i.slot)}` : 'Library only', i.dose].filter(Boolean).join(' · '),
  ...(syncing ? { badge: i.catalogId ? 'Library' : 'Custom' } : {}),
});
// The same supplement: name and brand, any case (instances of one supplement share both).
const sameName = (a: SupplementItem, b: SupplementItem) => a.n.toLowerCase() === b.n.toLowerCase() && (a.brand || '').toLowerCase() === (b.brand || '').toLowerCase();
const pickedName = (c: PickerChoice | null, items: SupplementItem[]) =>
  !c ? null : c.kind === 'mine' ? items.find(i => i.id === c.id)?.n ?? null : c.kind === 'catalog' ? c.item.name : c.name;

function Slot({ slot, label, date, items, taken, editing }: { slot: SupplementSlot; label: string; date: string; items: SupplementItem[]; taken: Taken; editing: boolean }) {
  const s = useAppStore.getState();
  const syncing = useAppStore(x => x.sync !== null);
  const [name, setName] = useState(''); const [dose, setDose] = useState('');
  // What was picked in the name field (ADR 036), used by Add while the name still matches it.
  const [pick, setPick] = useState<PickerChoice | null>(null);
  const [err, setErr] = useState('');
  const [arming, setArming] = useState<string | null>(null); // the supplement whose Remove was pressed once
  const list = scheduleOf(items)[slot]; const t = slotTally(items, taken, date, slot);
  const held = pick && pickerKey(pickedName(pick, items)) === pickerKey(name) ? pick : null;
  const heldItem = held?.kind === 'mine' ? items.find(i => i.id === held.id) : undefined;
  const done = () => { setName(''); setDose(''); setPick(null); setErr(''); };
  // Add: one of yours moves into this section, a catalog product joins your library in it, anything else is a new supplement.
  const add = (e: FormEvent) => {
    e.preventDefault();
    // One of yours that is already scheduled stays where it is and gets another instance here (taken twice a day); a library-only one moves in.
    if (held?.kind === 'mine') { if (heldItem?.slot ? s.addSupplementInstance(held.id, slot, dose) : s.setSupplementSlot(held.id, slot, dose)) done(); return; }
    if (held?.kind === 'catalog') {
      const m = s.addCatalogSupplement(held.item, { slot, dose });
      // null also means nothing was saved (still loading): keep what was typed unless it is really there now.
      if (m) setErr(m); else if (useAppStore.getState().supp.items.some(i => i.catalogId === held.item.id)) done();
      return;
    }
    if (s.addSupplement(slot, name, dose)) done();
  };
  return (
    <section className={`sslot${t.full ? ' done' : ''}`} role="group" aria-labelledby={`supp-h-${slot}`}>
      <div className="sslothead">
        <h3 id={`supp-h-${slot}`}>{label}</h3>
        <span className="note">{t.total ? `${t.done}/${t.total}` : ''}</span>
      </div>
      <RemovedNotice scope={'suppslot:' + slot} />
      {!list.length && <p className="note">{editing ? 'Nothing here yet. Add one below.' : 'Nothing scheduled.'}</p>}
      <ul className="slist">
        {list.map(x => (
          <li key={x.id} className={`srow${(taken[date] || {})[x.id] ? ' taken' : ''}${arming === x.id ? ' removing' : ''}`}>
            <label className="stick">
              <input type="checkbox" className="chk" id={`supp-${x.id}`} checked={!!(taken[date] || {})[x.id]} onChange={e => s.setSupplementTaken(date, x.id, e.target.checked)} />
              <span className="sname"><span className="rmname">{x.n}</span>{x.dose && <span className="sdose">{x.dose}</span>}</span>
            </label>
            {editing && <ArmedButton className={`btn sm ${arming === x.id ? 'danger' : 'ghost'}`} aria-label={`Remove ${x.n} from ${label}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? x.id : null)} onConfirm={() => { setArming(null); s.removeSupplement(x.id); }} />}
          </li>
        ))}
      </ul>
      {editing && (
        <form className="suppadd" onSubmit={add}>
          <ItemPicker id={`suppname-${slot}`} label={`Add to ${label}`} kind="supplement" value={name} maxLength={60} placeholder="Name or brand, e.g. creatine now"
            mine={items.filter((i, k) => i.slot !== slot && !list.some(l => sameName(l, i)) && items.findIndex(j => j.slot !== slot && sameName(j, i)) === k).map(i => mineOf(i, syncing))} also={list.map(i => mineOf(i, syncing))}
            catalogMeta={c => [c.brand, c.data.form].filter(Boolean).join(' · ')} createLabel={n => `Add “${n}” as a new supplement`}
            onText={v => { setName(v); setErr(''); }} onPick={setPick} />
          <label className="field">Dose (optional)<input type="text" id={`suppdose-${slot}`} placeholder="e.g. 5 g" maxLength={40} value={dose} onChange={e => setDose(e.target.value)} /></label>
          <button type="submit" className="btn sm" id={`suppadd-${slot}`} disabled={!name.trim()}>Add</button>
          {held?.kind === 'mine' && <p className="note">{heldItem?.slot
            ? `Adds another ${heldItem.n} to ${label}, so you can take it more than once a day${dose.trim() ? ', with this dose' : ''}.`
            : `Moves it to ${label}${dose.trim() ? ' with this dose' : ''}.`}</p>}
          {held?.kind === 'catalog' && <p className="note">From the catalog. It joins your supplements in {label}.</p>}
          {err && <p className="note err" role="alert">{err}</p>}
        </form>
      )}
    </section>
  );
}

// `editing` lives in the tab, so Edit also shows the whole library under the schedule.
function Schedule({ date, supp, editing, setEditing }: { date: string; supp: Supplements; editing: boolean; setEditing: (f: (v: boolean) => boolean) => void }) {
  const all = scheduled(supp.items); const done = all.filter(x => (supp.taken[date] || {})[x.id]).length;
  return (
    <section className="panel suppanel" aria-labelledby="sched-h">
      <div className="sstop">
        <h2 id="sched-h">Supplements</h2>
        <span className="sstopend"><span className="note" role="status">{all.length ? `${done} of ${all.length} taken` : ''}</span>
          <button type="button" className="btn sm ghost" id="sched-edit" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? 'Done' : 'Edit'}</button></span>
      </div>
      {!all.length && !editing && <p className="note">Nothing scheduled yet. Use Edit to add what you take in the morning, at noon and at night; Edit also shows your whole supplement list.</p>}
      {SLOTS.map(([k, l]) => <Slot key={k} slot={k} label={l} date={date} items={supp.items} taken={supp.taken} editing={editing} />)}
    </section>
  );
}

function WaterGoal({ goal, mode }: { goal: ReturnType<typeof goalFor>; mode: Supplements['waterMode'] }) {
  const s = useAppStore.getState();
  const [editing, setEditing] = useState(false); const [v, setV] = useState('');
  const text = goal.source === 'weight' ? `Base goal: ${fmtOz(goal.baseOz)} oz, half your ${fmtOz(goal.lb as number)} lb body weight`
    : goal.source === 'default' ? `Base goal: ${fmtOz(goal.baseOz)} oz (log your body weight on the Board to set it from your weight)` : `Base goal: ${fmtOz(goal.baseOz)} oz, set by you`;
  if (!editing) return <div className="wgoal"><span className="note">{text}</span><button type="button" className="btn sm ghost" id="water-goal-edit" onClick={() => { setV(fmtOz(goal.baseOz)); setEditing(true); }}>Change goal</button></div>;
  return (
    <form className="wgoalform" noValidate onSubmit={e => { e.preventDefault(); if (s.setWaterGoal(v)) setEditing(false); }}>
      <label className="field">Fixed daily goal (oz)<input type="number" inputMode="decimal" min="8" max="500" step="any" value={v} autoFocus onChange={e => setV(e.target.value)} /></label>
      <button type="submit" className="btn sm primary">Use this amount</button>
      {mode === 'fixed' && <button type="button" className="btn sm" onClick={() => { s.setWaterByWeight(); setEditing(false); }}>Use my weight ({OZ_PER_LB} oz per lb)</button>}
      <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

function Boost({ date, boost, extra }: { date: string; boost: BoostT | undefined; extra: ReturnType<typeof boostOz> }) {
  const s = useAppStore.getState(); const mins = boost && boost.mins ? String(boost.mins) : ''; const [m, setM] = useState(mins);
  return (
    <div>
      <div className="sect">Hot day or training</div>
      <div className="wboost">
        <label className="whot"><input type="checkbox" className="chk" id="water-hot" checked={!!(boost && boost.hot)} onChange={e => s.setWaterBoost(date, { hot: e.target.checked })} /> Hot day (+{HOT_OZ} oz)</label>
        <label className="field">Training (minutes)<input id="water-train" type="number" inputMode="numeric" min="0" max="600" step="5" value={m} onChange={e => setM(e.target.value)} onBlur={() => { if (m !== mins) s.setWaterBoost(date, { mins: m }); }} /></label>
      </div>
      <p className="note">{extra.oz > 0 ? `+${fmtOz(extra.oz)} oz on the goal${extra.hot ? ` (heat ${fmtOz(extra.hot)}` : ''}${extra.hot && extra.train ? ', ' : extra.hot ? ')' : ''}${extra.train ? `${extra.hot ? '' : ' ('}training ${fmtOz(extra.train)})` : ''}` : `Adds ${TRAIN_OZ_PER_30} oz per 30 minutes of training and ${HOT_OZ} oz on a hot day.`}</p>
    </div>
  );
}

function Week({ water, goalOf, end, selected, onPick }: { water: Record<string, number[]>; goalOf: (d: string) => number; end: Date; selected: string; onPick: (d: string) => void }) {
  const days = lastDays(water, end, 7, ymd).map(x => ({ ...x, goal: goalOf(x.d) })); const max = Math.max(...days.map(x => Math.max(x.goal, x.oz)));
  return (
    <div className="mbars" role="group" aria-label="Last 7 days of water">
      {days.map(x => (
        <button type="button" key={x.d} className="mbar" aria-current={x.d === selected ? 'date' : undefined} aria-label={`${DAY_NAMES[x.date.getDay()].slice(0, 3)} ${x.date.getDate()} ${fmtOz(x.oz)} oz, ${DAY_NAMES[x.date.getDay()]} ${fmtShort(x.date)}${x.oz >= x.goal ? ', goal met' : ''}`} onClick={() => onPick(x.d)}>
          <span>{DAY_NAMES[x.date.getDay()].slice(0, 3)} {x.date.getDate()}</span>{' '}
          <span className="track"><i className="l3" style={{ width: `${x.oz / max * 100}%`, background: x.oz >= x.goal ? 'var(--accent)' : undefined }} /></span>{' '}
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
  const [sel, setSel] = useState<string | null>(null); const date = sel || todayKey;
  const [custom, setCustom] = useState('');
  const [editing, setEditing] = useState(false);
  const [armingDrink, setArmingDrink] = useState<number | null>(null); // the drink whose Remove was pressed once
  const list = supp.water[date] || []; const total = sumOz(list); const gi = goalFor(supp, body, date); const goal = gi.oz;
  const pct = Math.min(100, Math.round(total / goal * 100)); const left = Math.max(0, goal - total);
  const d = parseDate(date); const isToday = date === todayKey;
  const step = (n: number) => { const k = ymd(addDays(d, n)); if (k <= todayKey) setSel(k === todayKey ? null : k); };
  const add = (oz: string | number) => { s.addWater(date, oz); };
  return (
    <div>
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous day" onClick={() => step(-1)}><Icon name="chevron-left" /></button>
          <h2 className="cond">{isToday ? 'Today' : DAY_NAMES[d.getDay()]} · {fmtShort(d)}</h2>
          <button type="button" className="btn sm" aria-label="Next day" disabled={isToday} onClick={() => step(1)}><Icon name="chevron-right" /></button>
          {!isToday && <button type="button" className="btn sm ghost" onClick={() => setSel(null)}>Today</button>}
        </div>
      </div>
      <div className="nutcols">
      <div className="nutcol">
      <Diet day={date} />
      </div>
      <div className="nutcol">
      <Schedule date={date} supp={supp} editing={editing} setEditing={setEditing} />
      {editing && <div className="mt-16"><SupplementLibrary /></div>}
      <section className="panel suppanel mt-16" aria-labelledby="water-h">
        <h2 id="water-h">Water</h2>
        <div className="kpi wkpi" role="status">
          <span className="kl">{isToday ? 'Today' : 'That day'}</span>
          <span className="kv">{fmtOz(total)} <small>/ {fmtOz(goal)} oz</small></span>
          <span className="ks">{cupsOf(total)} of {cupsOf(goal)} cups · {left > 0 ? `${fmtOz(left)} oz (${cupsOf(left)} cups) to go` : 'goal met'}</span>
          <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div>
          <div className="sect">Add a drink</div>
          <div className="chips wchips" role="group" aria-label="Add water by container size">
            {BOTTLES.map(b => (
              <button type="button" key={b.oz} className="chip" id={`water-${b.oz}`} onClick={() => add(b.oz)}>
                <b>+{fmtOz(b.oz)} oz</b> <span className="note">{b.label}{b.oz % CUP_OZ === 0 ? ` · ${b.oz / CUP_OZ} cup${b.oz === CUP_OZ ? '' : 's'}` : ''}</span>
              </button>
            ))}
          </div>
          <form className="wcustom" noValidate onSubmit={e => { e.preventDefault(); if (s.addWater(date, custom)) setCustom(''); }}>
            <label className="field">Other amount (oz)<input id="water-custom" type="number" inputMode="decimal" min="0" step="any" value={custom} onChange={e => setCustom(e.target.value)} /></label>
            <button type="submit" className="btn sm primary" disabled={custom === ''}>Add</button>
          </form>
        </div>
        <div>
          <div className="sect">{isToday ? 'Logged today' : 'Logged'}</div>
          <RemovedNotice scope={'water:' + date} />
          {!list.length ? <p className="note">Nothing logged yet.</p> : (
            <ul className="exrows wlogged">
              {list.map((oz, i) => (
                <li className={`exrow${armingDrink === i ? ' removing' : ''}`} key={i}>
                  <span><b className="rmname">{fmtOz(oz)} oz</b> <span className="note">{cupsOf(oz)} cups</span></span>
                  <ArmedButton className={`btn sm ${armingDrink === i ? 'danger' : 'ghost'}`} aria-label={`Remove ${fmtOz(oz)} ounces, drink ${i + 1}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArmingDrink(a ? i : null)} onConfirm={() => { setArmingDrink(null); s.removeWater(date, i); }} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <Boost key={`${date}:${supp.boost[date]?.mins ?? ''}`} date={date} boost={supp.boost[date]} extra={gi.extra} />
        <WaterGoal goal={gi} mode={supp.waterMode} />
      </section>
      <section className="panel suppanel mt-16" aria-labelledby="water7-h">
        <h2 id="water7-h">Last 7 days</h2>
        <Week water={supp.water} goalOf={(k) => goalFor(supp, body, k).oz} end={d} selected={date} onPick={(k) => setSel(k === todayKey ? null : k)} />
        <p className="note">Ounces per day. A full bar means you hit your goal.</p>
      </section>
      </div>
      </div>
    </div>
  );
}
