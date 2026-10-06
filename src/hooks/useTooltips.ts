import { useEffect } from 'react';

// Tooltip for any [data-tip] element: hover with a mouse, tap on touch, or keyboard focus.
// It can be hovered itself, and Escape dismisses it without moving focus (WCAG 1.4.13).
export default function useTooltips() {
  useEffect(() => {
    const tip = document.createElement('div');
    tip.id = 'tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.appendChild(tip);
    let hideT: ReturnType<typeof setTimeout> | undefined, owner: HTMLElement | null = null;
    const clearOn = () => document.querySelectorAll('.tipon').forEach(e => e.classList.remove('tipon'));
    const show = (t: HTMLElement) => {
      clearTimeout(hideT);
      if (owner && owner !== t && owner.getAttribute('aria-describedby') === 'tip') owner.removeAttribute('aria-describedby');
      owner = t;
      tip.textContent = t.dataset.tip ?? null; tip.hidden = false;
      const r = t.getBoundingClientRect(); const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2; x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
      let y = r.top - th - 8; if (y < 8) y = r.bottom + 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      clearOn(); t.classList.add('tipon');
      // Screen readers get the tip as a description unless the element's name already says it.
      if (!t.hasAttribute('aria-label')) t.setAttribute('aria-describedby', 'tip');
    };
    const hide = () => {
      clearTimeout(hideT); if (owner && owner.getAttribute('aria-describedby') === 'tip') owner.removeAttribute('aria-describedby');
      owner = null; tip.hidden = true; clearOn();
    };
    // A short grace period lets the pointer cross the gap onto the tooltip.
    const hideSoon = () => { clearTimeout(hideT); hideT = setTimeout(hide, 300); };
    const target = (e: Event) => { const el = e.target as Element | null; return el && el.closest ? (el.closest('[data-tip]') as HTMLElement | null) : null; };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (e.target === tip) { clearTimeout(hideT); return; }
      const t = target(e); if (t) show(t); else if (!tip.hidden) hideSoon();
    };
    const down = (e: PointerEvent) => { if (e.pointerType === 'mouse' || e.target === tip) return; const t = target(e); if (t) show(t); else hide(); };
    const focusIn = (e: FocusEvent) => { const t = target(e); if (t) show(t); };
    const focusOut = (e: FocusEvent) => { if (e.target === owner) hide(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !tip.hidden) { hide(); e.stopPropagation(); } };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', down);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', hide);
      tip.remove();
    };
  }, []);
}
