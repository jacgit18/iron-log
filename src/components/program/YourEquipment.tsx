import { useAppStore } from '../../store/useAppStore.js';
import ArmedButton from '../ArmedButton.jsx';

// The equipment you added from an Equipment menu, with Remove (refused while an exercise uses it).
export default function YourEquipment() {
  const equipment = useAppStore(s => s.cfg.equipment);
  const entries = Object.entries(equipment || {}).sort((a, b) => a[1].localeCompare(b[1]));
  if (!entries.length) return null;
  const { removeEquipment } = useAppStore.getState();
  return (
    <div className="youreq">
      <h3>Your equipment</h3>
      <ul className="glist">
        {entries.map(([id, name]) => (
          <li key={id} className="gstoreline">
            <span className="rmname">{name}</span>
            <ArmedButton className="btn sm ghost" aria-label={`Remove the equipment ${name}`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => removeEquipment(id)} />
          </li>
        ))}
      </ul>
      <p className="note">Add more from any Equipment menu with <b>Add equipment…</b>. One that an exercise still uses can't be removed.</p>
    </div>
  );
}
