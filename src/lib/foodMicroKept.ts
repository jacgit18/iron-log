import type { Micro } from '../shared/foodMicro.js';

/** The vitamins and minerals a looked-up food keeps when it is added through the One-off food form: only while calories are still the looked-up number. A person who changed the
 *  calories changed the portion or the food, and amounts that no longer match would mislead the totals, so they are dropped rather than rescaled (brief food-vitamins-minerals). */
export const microKept = (food: { kcal: number; micro?: Micro } | undefined, kcal: number): Micro | undefined => (food && food.kcal === kcal ? food.micro : undefined);
