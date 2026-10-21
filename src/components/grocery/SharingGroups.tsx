import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { MAX_GROUPS, MAX_PEOPLE } from '../../lib/grocery.js';
import ArmedButton from '../ArmedButton.jsx';
import type { Grocery, GroceryGroup } from '../../types.ts';
import './SharingGroups.css';

// Groups of people you split groceries with ("Home", "Costco run"). You are always in every group, so only the others are listed.
// A person marked "share already paid" is not asked for money in the settle-up (it is already in the account that pays the bill).
// A store can default to one group: everything bought there is then split with that group unless an item or a pack says otherwise.
function GroupRow({ group, stores }: { group: GroceryGroup; stores: string[] }) {
  const s = useAppStore.getState();
  const [name, setName] = useState(group.n); const [person, setPerson] = useState(''); const [err, setErr] = useState<string | null>(null);
  const [arming, setArming] = useState<string | null>(null);
  return (
    <li className="gsgroup">
      <div className="gsgrouphead">
        <input type="text" className="gname" aria-label={`Name of the group ${group.n}`} maxLength={40} value={name} onChange={e => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name.trim() !== group.n) setErr(s.renameGroceryGroup(group.id, name)); else setName(group.n); }} />
        <ArmedButton className={`btn sm ${arming === group.id ? 'danger' : 'ghost'}`} aria-label={`Remove the group ${group.n}`} label="Remove" armedLabel="Tap again to remove"
          onArmedChange={a => setArming(a ? group.id : null)} onConfirm={() => { setArming(null); s.removeGroceryGroup(group.id); }} />
      </div>
      <ul className="glist">
        {group.people.filter(p => !p.gone).map(p => (
          <li key={p.id} className="gsperson">
            <span className="rmname">{p.n}</span>
            <label className="gscovered"><input type="checkbox" className="chk" checked={!!p.covered} aria-label={`${p.n}’s share is already paid`}
              onChange={e => setErr(s.updateGroceryPerson(group.id, p.id, { covered: e.target.checked }))} /> Share already paid</label>
            <ArmedButton className={`btn sm ${arming === p.id ? 'danger' : 'ghost'}`} aria-label={`Remove ${p.n} from ${group.n}`} label="Remove" armedLabel="Tap again to remove"
              onArmedChange={a => setArming(a ? p.id : null)} onConfirm={() => { setArming(null); s.removeGroceryPerson(group.id, p.id); }} />
          </li>
        ))}
      </ul>
      <form className="warmadd" noValidate onSubmit={e => { e.preventDefault(); const m = s.addGroceryPerson(group.id, person); setErr(m); if (!m) setPerson(''); }}>
        <input type="text" aria-label={`New person in ${group.n}`} placeholder="Add a person" maxLength={40} value={person} onChange={e => setPerson(e.target.value)} />
        <button type="submit" className="btn sm" disabled={!person.trim() || group.people.filter(p => !p.gone).length >= MAX_PEOPLE}>Add person</button>
      </form>
      {stores.length > 0 && (
        <fieldset className="gsstores">
          <legend>Stores that split with {group.n} by default</legend>
          {stores.map(st => (
            <label key={st} className="gsstore">
              <input type="checkbox" className="chk" checked={group.stores.includes(st)} onChange={e => s.setGroceryStoreGroup(st, e.target.checked ? group.id : null)} /> {st}
            </label>
          ))}
        </fieldset>
      )}
      {err && <p className="note gerr" role="alert">{err}</p>}
    </li>
  );
}

export default function SharingGroups({ g }: { g: Grocery }) {
  const s = useAppStore.getState();
  const [name, setName] = useState(''); const [people, setPeople] = useState(''); const [err, setErr] = useState<string | null>(null);
  const groups = (g.groups ?? []).filter(x => !x.gone);
  // The panel opens from a button (or the prompt) that may disappear, so focus goes to its heading instead of being dropped on the page.
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => { head.current?.focus(); }, []);
  return (
    <section className="gform" aria-labelledby="groc-sharing-h">
      <h3 id="groc-sharing-h" ref={head} tabIndex={-1}>Sharing</h3>
      <p className="note">Make a group for the people you split groceries with. You are always in it.</p>
      {groups.length > 0 && <ul className="glist">{groups.map(x => <GroupRow key={x.id} group={x} stores={g.stores} />)}</ul>}
      <form className="warmadd gsnew" noValidate onSubmit={e => {
        e.preventDefault();
        const m = s.addGroceryGroup(name, people.split(/[,\n]/));
        setErr(m); if (!m) { setName(''); setPeople(''); }
      }}>
        <input type="text" aria-label="New group" placeholder="Group, like Costco run" maxLength={40} value={name} onChange={e => setName(e.target.value)} />
        <input type="text" aria-label="People in the new group, separated by commas" placeholder="People, like Sister, Mom" value={people} onChange={e => setPeople(e.target.value)} />
        <button type="submit" className="btn sm" disabled={!name.trim() || groups.length >= MAX_GROUPS}>Add group</button>
      </form>
      {err && <p className="note gerr" role="alert">{err}</p>}
    </section>
  );
}
