// The on-screen keyboard covers the lower part of a sheet. This brings a focused field into view only when it
// needs it, so a field already in view never makes the sheet jump.
export const isTouchScreen = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;

/** Scrolls `field` to the middle of its scroller unless it is already fully inside `sheet` and the visible viewport. */
export function revealField(sheet: HTMLElement, field: HTMLElement): boolean {
  if (!field.isConnected) return false;
  const s = sheet.getBoundingClientRect(), r = field.getBoundingClientRect();
  const vv = window.visualViewport;
  const top = Math.max(s.top, vv ? vv.offsetTop : 0);
  const bottom = Math.min(s.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
  if (r.top >= top && r.bottom <= bottom) return false;
  field.scrollIntoView({ block: 'center', behavior: 'auto' });
  return true;
}
