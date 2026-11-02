// Sharing a link to the app from another Android app (the manifest's share_target, brief share-target). The share arrives as
// `./?share_title=&share_text=&share_url=`; it is read once at startup, the address is cleaned, and the link is held in memory until the sheet opens.
// What was shared is untrusted text: only an http or https address is ever kept, and it is saved as a link, never drawn as HTML or followed.

const MAX_LINK = 500, MAX_TITLE = 80;

export interface Share { title: string; url: string }

const WEB = /^https?:\/\/\S+$/i;
const IN_TEXT = /https?:\/\/[^\s<>"']+/i;
const clean = (s: string) => s.trim().replace(/[.,;:!?)\]]+$/, ''); // a sentence's closing punctuation is not part of the address

/** The web address in what was shared: the url field first, else the first one inside the text (YouTube puts "Title https://youtu.be/..." in text). */
export function linkFromShare(p: { text?: string; url?: string }): string | null {
  for (const raw of [p.url ?? '', (IN_TEXT.exec(p.text ?? '') || [''])[0]]) {
    const u = clean(raw);
    if (u && u.length <= MAX_LINK && WEB.test(u)) return u;
  }
  return null;
}

/** The share a page address carries, or null when it carries none. `url` is empty when no usable web address was in it. */
export function shareFromSearch(search: string): Share | null {
  const q = new URLSearchParams(search);
  if (!['share_title', 'share_text', 'share_url'].some(k => q.has(k))) return null;
  const text = q.get('share_text') ?? '', url = linkFromShare({ text, url: q.get('share_url') ?? '' }) ?? '';
  const title = (q.get('share_title') || text.replace(IN_TEXT, '')).replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
  return { title, url };
}

let held: Share | null = null;
export const holdShare = (s: Share | null) => { held = s; };
/** The share waiting to be shown, once: asking again returns nothing. */
export function takeShare(): Share | null { const s = held; held = null; return s; }

let recipeStart: Share | null = null;
/** "New recipe with this link": the name and link the recipe form starts with, read once by the Recipes page. */
export const setRecipeStart = (s: Share | null) => { recipeStart = s; };
export function takeRecipeStart(): Share | null { const s = recipeStart; recipeStart = null; return s; }
