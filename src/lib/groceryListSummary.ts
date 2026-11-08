import { money } from './grocery.js';

/** The line above a grocery list (brief grocery-one-details): how many rows are on screen, and for Shopping and Bought what they come to. It follows the store chip and search. */
export function getSummaryText(count: number, cents: number): string {
  return `${count} to get${cents ? ` · ${money(cents)}` : ''}`;
}

export function boughtSummaryText(count: number, cents: number): string {
  return `${count} bought${cents ? ` · ${money(cents)}` : ''}`;
}

export function editSummaryText(count: number, have: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}${count ? ` · ${have} you have` : ''}`;
}
