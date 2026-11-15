import { ymd } from '../../shared/dates.js';
import type { Micro } from '../../shared/foodMicro.js';
import { ESTIMATED, microLine, microList, microShares } from '../../lib/microLine.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import './MicroLine.css';

// What a food gives most of (brief recipe-auto-nutrition, preview options A): one muted line under the macro line of a planned card and an eaten row, and the top five when the card or the row sheet is open. Numbers come from
// `lib/microLine.ts`; `factor` scales a per-serving `micro` to a planned portion (an eaten entry's micro is already as eaten). A food with no vitamins or minerals draws nothing. "Estimated" is text, not colour alone.
function useShares(micro: Micro | undefined, factor: number) {
  const profile = useAppStore(s => s.cfg.profile);
  const today = ymd(useToday(s => s.today));
  return microShares(micro, factor, profile, today);
}

export function MicroLine({ micro, factor = 1, est = false }: { micro: Micro | undefined; factor?: number; est?: boolean }) {
  const line = microLine(useShares(micro, factor));
  if (!line) return null;
  return <span className="nb-micro">{line}{est && <span className="nb-micro-est"> · {ESTIMATED}</span>}</span>;
}

export function MicroList({ micro, factor = 1, est = false }: { micro: Micro | undefined; factor?: number; est?: boolean }) {
  const list = microList(useShares(micro, factor));
  if (!list.length) return null;
  return (
    <div className="nb-microlist">
      <ul aria-label="Vitamins and minerals, as a share of a day's recommended amount">{list.map(l => <li key={l.key}>{l.text}</li>)}</ul>
      {est && <p className="note">{ESTIMATED}: worked out from the recipe’s ingredients, not from a label.</p>}
    </div>
  );
}
