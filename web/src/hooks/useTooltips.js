import { useEffect } from 'react';

// Tooltip for any [data-tip] element: hover with a mouse, tap on touch, or keyboard focus.
export default function useTooltips() {
  useEffect(() => {
    const tip = document.createElement('div');
    tip.id = 'tip'; tip.setAttribute('role', 'status'); tip.hidden = true;
    document.body.appendChild(tip);
    const clearOn = () => document.querySelectorAll('.tipon').forEach(e => e.classList.remove('tipon'));
    const show = t => {
      tip.textContent = t.dataset.tip; tip.hidden = false;
      const r = t.getBoundingClientRect(); const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.left + r.width / 2 - tw / 2; x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
      let y = r.top - th - 8; if (y < 8) y = r.bottom + 8;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
      clearOn(); t.classList.add('tipon');
    };
    const hide = () => { tip.hidden = true; clearOn(); };
    const target = e => e.target.closest && e.target.closest('[data-tip]');
    const over = e => { if (e.pointerType !== 'mouse') return; const t = target(e); if (t) show(t); else hide(); };
    const down = e => { if (e.pointerType === 'mouse') return; const t = target(e); if (t) show(t); else hide(); };
    const focusIn = e => { const t = target(e); if (t) show(t); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerdown', down);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, { passive: true });
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide);
      tip.remove();
    };
  }, []);
}
