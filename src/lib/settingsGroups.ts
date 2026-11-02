// The Settings groups, in page order: [id, label]. Each group's heading on the page has the id `set-<id>-h` (Settings.tsx `Group`).
export const GROUPS = [['training', 'Training'], ['data', 'Data'], ['app', 'App'], ['erase', 'Erase & delete']] as const;
export type GroupId = (typeof GROUPS)[number][0];

type Heading = { focus(o: { preventScroll: boolean }): void; scrollIntoView(o: { behavior: 'smooth' | 'instant'; block: 'start' }): void };
type JumpDeps = { find: (id: string) => Heading | null; raf: (cb: () => void) => void; smooth: boolean; tries?: number };

// Focus a group's heading and scroll to it. From another tab the heading is not on the page until Settings has drawn, so wait for it
// (a frame at a time, up to `tries`) instead of giving up on the first miss. Returns false when it never appeared.
export function jumpToGroup(id: string, { find, raf, smooth, tries = 30 }: JumpDeps): Promise<boolean> {
  return new Promise(resolve => {
    const go = (left: number) => {
      const h = find(`set-${id}-h`);
      if (h) {
        h.focus({ preventScroll: true }); // before the scroll: focusing mid-scroll cancels a smooth scroll
        h.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'start' });
        resolve(true);
      } else if (left > 0) raf(() => go(left - 1));
      else resolve(false);
    };
    go(tries);
  });
}

/** A heading that is on the page and drawn (not inside a hidden screen), or null; for `jumpToGroup`'s `find`. */
export const findVisible = (id: string) => { const e = document.getElementById(id); return e && e.getClientRects().length ? e : null; };
