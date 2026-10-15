import { useAppStore } from '../../store/useAppStore.js';
import { injuryPreventionOn } from '../../lib/logic.js';
import './InjurySwitch.css';

// The Settings → Injury prevention switch, repeated on the Board so it is one tap away. Same store setting, so the two always agree.
export default function InjurySwitch() {
  const on = useAppStore(s => injuryPreventionOn(s.cfg));
  const setInjuryPrevention = useAppStore(s => s.setInjuryPrevention);
  return (
    <label className="injsw">
      <input type="checkbox" role="switch" className="injsw-input" checked={on} onChange={e => setInjuryPrevention(e.target.checked)} />
      <span className="injsw-track" aria-hidden="true"><i /></span>
      <span>Injury prevention <small>{on ? 'On' : 'Off'}</small></span>
    </label>
  );
}
