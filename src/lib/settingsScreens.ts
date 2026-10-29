import { PHASES, PH_KEYS } from './data.js';
import type { PhaseKey } from '../types.ts';

// The Training group on Settings: each of these is a summary row that opens its own screen (Settings.tsx `TrainingRows`).
export const SCREENS = ['mode', 'phases', 'maxes'] as const;
export type Screen = (typeof SCREENS)[number];

/** "Mode 1 · Push/Pull only": the row's second line. `aName` is program A's name. */
export function modeSummary(mode: number, aName: string): string {
  if (mode === 2) return 'Mode 2 · Alternate monthly';
  if (mode === 3) return 'Mode 3 · Swap every 6 months';
  return `Mode 1 · ${aName} only`;
}

type PhaseCfg = { pct?: Partial<Record<PhaseKey, number>>; rxOverride?: Partial<Record<PhaseKey, string>>; rest?: number };

/** "Strength 85% · 4 × 6, Isometric 75% · 4 × 15–30 s +3 more · rest 90 s": the first two phases, then how many more. */
export function phasesSummary(cfg: PhaseCfg, show = 2): string {
  const one = (k: PhaseKey) => {
    const pct = cfg.pct?.[k] ?? PHASES[k].pct; const rx = cfg.rxOverride?.[k] || PHASES[k].rx;
    return `${PHASES[k].label}${pct ? ` ${pct}%` : ''} · ${rx}`;
  };
  const more = PH_KEYS.length - show;
  return `${PH_KEYS.slice(0, show).map(one).join(', ')}${more > 0 ? ` +${more} more` : ''} · rest ${cfg.rest ?? 90} s`;
}

/** "3 of 12 set" / "None set yet" / "No weighted exercises yet": the 1RM row's second line. */
export function maxesSummary(total: number, withRm: number): string {
  if (!total) return 'No weighted exercises in your programs yet';
  return withRm ? `${withRm} of ${total} set · for reference only` : 'None set yet · for reference only';
}

// A screen is open on Settings; anything that sends the person to a group (the account menu, the jump row) closes it first, so the group's
// heading is on the page to scroll to. Settings listens; nothing else needs to know a screen exists.
const CLOSE = 'settings:close-screen';
export const closeSettingsScreen = () => window.dispatchEvent(new Event(CLOSE));
export const onCloseSettingsScreen = (fn: () => void) => { window.addEventListener(CLOSE, fn); return () => window.removeEventListener(CLOSE, fn); };
