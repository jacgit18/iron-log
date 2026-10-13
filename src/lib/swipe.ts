// Pure rules for swiping a board card sideways to tick it off (feature `swipeDone`, released to everyone). The hook in
// components/board/useSwipeDone.ts feeds touch positions in; everything that decides lives here so it can be tested.

/** A touch that starts on one of these is a tap or a text/select interaction, never a swipe. */
export const SWIPE_IGNORE = 'select,input,textarea,button,a,label,summary,[contenteditable],.explist';

/** Movement under this many px decides nothing yet (a tap wobbles a little). */
export const SLOP = 10;
/** A swipe commits at 25% of the card's width, but never needs more than this many px. */
export const COMMIT_PX = 90;
/** The card follows the finger by this fraction of the distance, up to MAX_FOLLOW px. */
export const FOLLOW = 0.45;
export const MAX_FOLLOW = 64;

export type Axis = 'none' | 'x' | 'y';

/** Which way the gesture is going. Once it is 'y' the page is scrolling and the card must let go; 'x' is locked in by clear horizontal travel. */
export function axisOf(dx: number, dy: number): Axis {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < SLOP && ay < SLOP) return 'none';
  return ax > ay * 1.5 ? 'x' : ay >= ax ? 'y' : 'none';
}

/** Distance needed to commit for a card this wide. */
export const commitDistance = (width: number): number => Math.min(COMMIT_PX, Math.max(40, width * 0.25));

/** True when the finger travelled far enough, mostly sideways, to toggle the card. Either direction counts. */
export function swipeCommits(dx: number, dy: number, width: number): boolean {
  return axisOf(dx, dy) === 'x' && Math.abs(dx) >= commitDistance(width);
}

/** How far to draw the card from where it sits (a damped follow, clamped). 0 until the gesture is horizontal. */
export function followOffset(dx: number, dy: number): number {
  if (axisOf(dx, dy) !== 'x') return 0;
  return Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, dx * FOLLOW));
}

/** What a commit would do, for the hint behind the card. */
export const hintFor = (done: boolean): 'Done' | 'Undo' => (done ? 'Undo' : 'Done');

/** True when the touch began somewhere a swipe must not start (a control). `el` is the event target. */
export function startsOnControl(el: Pick<Element, 'closest'> | null): boolean {
  return !el || !!el.closest(SWIPE_IGNORE);
}
