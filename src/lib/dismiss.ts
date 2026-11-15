// What a pointer press or key press does to an open popover (menu, disclosure): the decision behind `useDismiss` (components/useDismiss.ts), kept pure so it can be tested.
// A press outside the popover's box closes it; Escape closes it and focus goes back to the control that opened it; anything else is ignored.
export type DismissInput = { type: 'pointerdown'; inside: boolean } | { type: 'keydown'; key: string };
export type Dismiss = 'outside' | 'escape' | null;

export function dismissFor(e: DismissInput): Dismiss {
  if (e.type === 'pointerdown') return e.inside ? null : 'outside';
  return e.key === 'Escape' ? 'escape' : null;
}
