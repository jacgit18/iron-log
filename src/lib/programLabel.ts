import { progName } from './logic.js';
import type { Cfg } from '../types.ts';

/**
 * The accessible name of a program button that shows only its letter. It always contains that letter (WCAG 2.5.3: a voice-control user who says
 * "click A" must hit it), and keeps a renamed program's own name too: "A: Upper". A name that already holds the letter ("Program A") stays as it is.
 */
export function programLabel(cfg: Cfg, k: string): string {
  const name = progName(cfg, k);
  return name.includes(k) ? name : `${k}: ${name}`;
}
