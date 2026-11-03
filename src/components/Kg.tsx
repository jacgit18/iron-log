import { useAppStore } from '../store/useAppStore.js';
import { kgText } from '../lib/weightUnit.js';
import './Kg.css';

function useKgText(lb: unknown) {
  const hide = useAppStore(s => s.cfg.hideKg === true);
  return hide ? '' : kgText(lb);
}

/** The kg equivalent of a pound weight, in small grey text beside a weight box. Shows nothing when the weight is empty or "Show kg beside lb" is off in Settings. */
export default function Kg({ lb }: { lb: unknown }) {
  const t = useKgText(lb);
  return t ? <span className="kg">{t}</span> : null;
}

/** The same figure in brackets, for after a pound weight in running text: "135 lb (61.2 kg)". */
export function KgAfter({ lb }: { lb: unknown }) {
  const t = useKgText(lb);
  return t ? <span className="kg">({t})</span> : null;
}
