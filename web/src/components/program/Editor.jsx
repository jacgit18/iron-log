import { Fragment, useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, BUILTIN, exInfo } from '../../lib/data.js';
import { progName } from '../../lib/logic.js';
import { sameProg, libDate } from '../../lib/export.js';
import { MON } from '../../lib/dates.js';
import ArmedButton from '../ArmedButton.jsx';
import CommitInput from '../CommitInput.jsx';

const progStats = p => { const n = p.days.reduce((a, d) => a + d.slots.length, 0); return `${n} exercise${n === 1 ? '' : 's'}`; };

function slotSummary(cfg, sl) {
  const names = sl.items.map(i => exInfo(cfg, i.ex).n);
  return sl.type === 'superset' ? names.join(' → ') : sl.type === 'either' ? names.join(' or ') : names[0];
}

function LibRow({ name, meta, inUse, onLoad, loadLabel, extra }) {
  return (
    <div className={`edrow${inUse ? ' inuse' : ''}`}>
      <div className="edmain"><b>{name}</b><span className="note">{meta}</span></div>
      <div className="edbtns">
        {inUse ? <span className="pill">In use</span> : <ArmedButton className="btn sm" label="Load" armedLabel={loadLabel} onConfirm={onLoad} />}
        {extra}
      </div>
    </div>
  );
}

function Library({ k, custom }) {
  const cfg = useAppStore(s => s.cfg); const library = useAppStore(s => s.library); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const [name, setName] = useState('');
  const cur = programs[k]; const pn = progName(cfg, k);
  const items = [...library].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const saved = !custom || library.some(it => sameProg(it.prog, cur));
  const loadLabel = `Tap to load into ${pn}`;
  return (
    <section className="panel edpanel lib" style={{ marginTop: 16 }}>
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2>Program library</h2>
        <button type="button" className="btn" onClick={() => { if (!st.blocked()) st.openModal({ type: 'newprog' }); }}>Create a program</button>
      </div>
      <p className="note">Load a version into {pn}. Whatever {pn} has now is saved here first if it isn't already, so loading never loses anything.</p>
      <div className="edlist">
        <LibRow name={`Original ${pn}`} meta={`Built in · ${progStats(BUILTIN[k])} · always kept`} inUse={!custom} loadLabel={loadLabel} onLoad={() => st.loadVersion('orig', k)} />
        {items.map(it => (
          <LibRow
            key={it.id} name={it.name} inUse={custom && sameProg(it.prog, cur)} loadLabel={loadLabel} onLoad={() => st.loadVersion(it.id, k)}
            meta={`${it.created ? 'Created from' : 'From'} ${progName(cfg, it.from)} · ${libDate(it.at)} · ${progStats(it.prog)}${it.auto ? ' · auto-saved' : ''}`}
            extra={<>
              <button type="button" className="btn sm" onClick={() => { st.setEdProg('L:' + it.id); st.setEdDay(1); window.scrollTo({ top: 0 }); }}>Edit</button>
              <ArmedButton className="btn sm ghost" label="Delete" armedLabel="Delete?" onConfirm={() => st.deleteLibItem(it.id)} />
            </>}
          />
        ))}
        {!items.length && <p className="note">No saved or created programs yet.</p>}
      </div>
      <form className="libsave" noValidate onSubmit={e => { e.preventDefault(); st.saveCurrentAs(name); setName(''); }}>
        <label className="field" style={{ flex: 1 }}>Save {pn} as
          <input id="lib-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${pn} · ${MON[new Date().getMonth()]} ${new Date().getFullYear()}`} />
        </label>
        <button type="submit" className="btn primary">Save a copy</button>
      </form>
      {!saved && <p className="note">{pn} has changes that aren't in a saved copy yet.</p>}
    </section>
  );
}

function LibItemPanel({ it }) {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  return (
    <section className="panel edpanel lib" style={{ marginTop: 16 }}>
      <h2>Put it into the rotation</h2>
      <p className="note">Loading replaces what's in that slot. The program there now is saved to the library first if it isn't already, so nothing is lost. {it.name} stays in the library too.</p>
      <div className="actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        {['A', 'B'].map(k => (
          <ArmedButton key={k} className="btn primary" label={`Load into ${progName(cfg, k)}`} armedLabel={`Tap to load into ${progName(cfg, k)}`} onConfirm={() => st.loadVersion(it.id, k)} />
        ))}
        <ArmedButton className="btn ghost" label="Delete program" armedLabel="Delete?" onConfirm={() => st.deleteLibItem(it.id)} />
      </div>
    </section>
  );
}

export default function Editor() {
  const cfg = useAppStore(s => s.cfg);
  const edDay = useAppStore(s => s.edDay); const edProg = useAppStore(s => s.edProg);
  const k = useAppStore(s => s.edKey()); const item = useAppStore(s => s.edItem());
  const programs = useAppStore(s => s.programs);
  const prog = item ? { ...item.prog, key: 'N' } : programs[k];
  const st = useAppStore.getState();
  // Pin the editor to the program it opened on, like the original, so it doesn't follow later board changes.
  useEffect(() => { if (edProg !== k) st.setEdProg(k); }, [edProg, k, st]);

  const lib = !!item; const day = prog.days[edDay - 1];
  const custom = !lib && prog !== BUILTIN[k];
  const edName = lib ? item.name : progName(cfg, k);
  let lastSec = null;

  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Program to edit">
          {['A', 'B'].map(p => <button type="button" key={p} className={p === k ? 'on' : ''} aria-pressed={p === k} onClick={() => st.setEdProg(p)}>{progName(cfg, p)}</button>)}
          {lib && <button type="button" className="on" aria-pressed="true">{item.name}</button>}
        </div>
        <div className="seg" role="group" aria-label="Day to edit">
          {[1, 2, 3, 4, 5, 6].map(d => <button type="button" key={d} className={d === edDay ? 'on' : ''} aria-pressed={d === edDay} onClick={() => st.setEdDay(d)}>Day {d}</button>)}
        </div>
      </div>
      {lib ? (
        <>
          <div className="notice tip libnote"><span><b>{item.name}</b> is in your library, not in the rotation. Build it here, then load it into {progName(cfg, 'A')} or {progName(cfg, 'B')} when you're ready to train it.</span></div>
          <label className="field progname">Program name
            <CommitInput key={`L${item.id}:${item.name}`} id="prog-name" maxLength={60} value={item.name} onCommit={st.renameLibItem} />
          </label>
        </>
      ) : (
        <label className="field progname">Name of Program {k}
          <CommitInput key={`${k}:${(cfg.progNames || {})[k] || ''}`} id="prog-name" maxLength={40} value={(cfg.progNames || {})[k] || ''} placeholder={`Program ${k}`} onCommit={v => st.renameProgram(k, v)} />
        </label>
      )}
      <section className="panel edpanel">
        <div className="inline" style={{ flexWrap: 'wrap' }}><h2 style={{ marginRight: 'auto' }}>{edName} · {day.title}</h2></div>
        <label className="field">Day label
          <CommitInput key={`${k}:${edDay}:${day.sub || ''}`} id="ed-sub" value={day.sub || ''} placeholder="e.g. Lower body + reactive power" onCommit={st.setDaySub} />
        </label>
        <div className="edlist">
          {!day.slots.length && <p className="note">No exercises on this day yet.</p>}
          {day.slots.map((sl, i) => {
            const newSec = sl.sec !== lastSec; lastSec = sl.sec;
            const tag = [sl.tier, sl.type === 'superset' ? 'Superset' : sl.type === 'either' ? 'Either / or' : ''].filter(Boolean).join(' · ');
            return (
              <Fragment key={sl.id || i}>
                {newSec && <div className="sect">{sl.sec || ''}</div>}
                <div className="edrow">
                  <div className="edmain">
                    {tag && <span className="tag">{tag}</span>}
                    <b>{slotSummary(cfg, sl)}</b>
                    <span className="note">{sl.items.map(it => [it.ph ? PHASES[it.ph].label : 'No phase', it.w != null ? it.w + ' lb' : (it.bw ? 'BW' : ''), it.rx || ''].filter(Boolean).join(' · ')).join('  |  ')}</span>
                  </div>
                  <div className="edbtns">
                    <button type="button" className="btn sm" aria-label="Move up" disabled={i === 0} onClick={() => st.moveEdSlot(i, -1)}>↑</button>
                    <button type="button" className="btn sm" aria-label="Move down" disabled={i === day.slots.length - 1} onClick={() => st.moveEdSlot(i, 1)}>↓</button>
                    <button type="button" className="btn sm" onClick={() => { if (!st.blocked()) st.openModal({ type: 'slot', idx: i }); }}>Edit</button>
                    <ArmedButton className="btn sm ghost" label="Remove" armedLabel="Remove?" onConfirm={() => st.removeEdSlot(i)} />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn primary" onClick={() => { if (!st.blocked()) st.openModal({ type: 'slot', idx: null }); }}>Add exercise</button>
        </div>
      </section>
      <p className="note" style={{ marginTop: 12 }}>
        {lib ? 'Changes are saved to this library program only. Nothing on the board changes until you load it into A or B.' : `Changes apply to every week that uses ${progName(cfg, k)}. Your logged sets stay as they are.`}
      </p>
      {lib ? <LibItemPanel it={item} /> : <Library k={k} custom={custom} />}
    </>
  );
}
