import type { Cfg, EquipmentId } from '../types.ts';
import { useState, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { eqOptions, EQ_NAME_MAX } from '../lib/equipment.js';
import './EquipmentField.css';

const ADD = '__add';

// The Equipment menu of an exercise: built-ins, what you added, and "Add equipment…" to add and pick a new one on the spot.
export default function EquipmentField({ cfg, value, onChange, children }: { cfg: Cfg; value: EquipmentId | ''; onChange: (eq: EquipmentId | '') => void; children?: ReactNode }) {
  const [adding, setAdding] = useState(false); const [name, setName] = useState('');
  const add = () => { const id = useAppStore.getState().addEquipment(name); if (id) { onChange(id); setAdding(false); setName(''); } };
  return (
    <>
      <label className="field">Equipment
        <select value={value} onChange={e => { if (e.target.value === ADD) setAdding(true); else onChange(e.target.value as EquipmentId | ''); }}>
          <option value="">Not set</option>
          {eqOptions(cfg).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value={ADD}>Add equipment…</option>
        </select>
        {children}
      </label>
      {adding && (
        <div className="eqadd">
          <label className="field">New equipment
            <input type="text" value={name} maxLength={EQ_NAME_MAX} placeholder="e.g. Landmine" autoFocus
              onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          </label>
          <button type="button" className="btn sm primary" disabled={!name.trim()} onClick={add}>Add</button>
          <button type="button" className="btn sm" onClick={() => { setAdding(false); setName(''); }}>Cancel</button>
        </div>
      )}
    </>
  );
}
