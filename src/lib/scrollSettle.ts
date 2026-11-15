/* ---------- Scroll to a place that is still moving ----------
   Sections above the target grow as history and charts draw, so `go` runs on the next frame and once more after 700 ms, unless the reader has moved in between (wheel, touch, key, or a mouse or pen press, which
   covers a dragged scrollbar). Progress's one page (an address that names a section) and the Body weight chart (Manage's Edit in Progress) share it. The returned function cancels it. */

const MOVES = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

export function scrollWhenSettled(go: () => void): () => void {
  let moved = false; const stop = () => { moved = true; };
  const off = () => { for (const e of MOVES) window.removeEventListener(e, stop); };
  for (const e of MOVES) window.addEventListener(e, stop, { once: true, passive: true });
  const frame = requestAnimationFrame(go);
  const timer = window.setTimeout(() => { off(); if (!moved) go(); }, 700);
  return () => { cancelAnimationFrame(frame); clearTimeout(timer); off(); };
}
