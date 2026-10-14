// Pure rules for swiping a board card sideways: right ticks it done, left skips it for the week. The hook in
// components/board/useSwipeCard.ts feeds touch positions in; everything that decides lives here so it can be tested.

/** A touch that starts on one of these is a tap or a text/select interaction, never a swipe. */
export const SWIPE_IGNORE = 'select,input,textarea,button,a,label,summary,[contenteditable],.explist';

/** Movement under this many px decides nothing yet (a tap wobbles a little). */
export const SLOP = 10;
/** A swipe commits at 25% of the card's width, but never needs more than this many px. */
export const COMMIT_PX = 90;
/** The card follows the finger by this fraction of the distance, up to MAX_FOLLOW px. It slides far enough to uncover the gutter the
    Done / Skip label sits in (styles.css `.card.swiping`), so the label never lands on the card's own text. */
export const FOLLOW = 0.8;
export const MAX_FOLLOW = 72;

export type Axis = 'none' | 'x' | 'y';

/** Which way the gesture is going. Once it is 'y' the page is scrolling and the card must let go; 'x' is locked in by clear horizontal travel. */
export function axisOf(dx: number, dy: number): Axis {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < SLOP && ay < SLOP) return 'none';
  return ax > ay * 1.5 ? 'x' : ay >= ax ? 'y' : 'none';
}

/** Distance needed to commit for a card this wide. */
export const commitDistance = (width: number): number => Math.min(COMMIT_PX, Math.max(40, width * 0.25));

/** True when the finger travelled far enough, mostly sideways, to act on the card. Either direction counts; `swipeAction` says what it does. */
export function swipeCommits(dx: number, dy: number, width: number): boolean {
  return axisOf(dx, dy) === 'x' && Math.abs(dx) >= commitDistance(width);
}

/** How far to draw the card from where it sits (a damped follow, clamped). 0 until the gesture is horizontal. */
export function followOffset(dx: number, dy: number): number {
  if (axisOf(dx, dy) !== 'x') return 0;
  return Math.max(-MAX_FOLLOW, Math.min(MAX_FOLLOW, dx * FOLLOW));
}

export type CardState = 'open' | 'done' | 'skipped';
export type SwipeAction = 'done' | 'skip' | 'open';

/** What a swipe this way does to a card in this state. Right ticks it done, left skips it for the week. On a done or skipped card
    either way puts it back to open: skipping clears a card's ticks, so a stray left swipe must never skip a finished card.
    `canDone` is false for a card ticked per exercise (superset, either/or): it can be skipped, not ticked whole. null: nothing. */
export function swipeAction(dx: number, state: CardState, canDone: boolean): SwipeAction | null {
  if (!dx) return null;
  if (state !== 'open') return 'open';
  if (dx > 0) return canDone ? 'done' : null;
  return 'skip';
}

/** The word shown behind the card for what a commit would do. */
export const HINT: Record<SwipeAction, 'Done' | 'Skip' | 'Undo'> = { done: 'Done', skip: 'Skip', open: 'Undo' };

/** True when the touch began somewhere a swipe must not start (a control). `el` is the event target. */
export function startsOnControl(el: Pick<Element, 'closest'> | null): boolean {
  return !el || !!el.closest(SWIPE_IGNORE);
}
