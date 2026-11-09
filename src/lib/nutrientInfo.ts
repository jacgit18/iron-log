import type { NutrientKey } from '../shared/nutrientKeys.js';
import { limitOf } from './nutrientLimits.js';
import { targetOf } from './nutrientTargets.js';

/* ---------- One lookup for code that only needs a nutrient's name or unit, whichever table holds it ---------- */

/** The nutrient's display name, from the limits table or the targets table; the key itself if neither has it. */
export const nutrientLabel = (key: NutrientKey): string => limitOf(key)?.label ?? targetOf(key)?.label ?? key;

/** The unit its table states ('mg', 'mcg' or 'g'), or undefined for an unknown key. */
export const nutrientUnit = (key: NutrientKey): 'mg' | 'mcg' | 'g' | undefined => limitOf(key)?.unit ?? targetOf(key)?.unit;
