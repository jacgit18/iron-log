import type { Cfg } from '../types.ts';

/** The longest note an exercise keeps (the same cap the per-card and per-idea notes had). */
export const NOTE_MAX = 200;

/** Text for the stored note: trimmed and capped. */
export const cleanNote = (text: string | null | undefined): string => (text ?? '').trim().slice(0, NOTE_MAX);

/** The note saved on the exercise itself (`cfg.ex[id].note`), '' when it has none. */
export const ownNote = (cfg: Pick<Cfg, 'ex'>, exId: string): string => cfg.ex?.[exId]?.note || '';

/**
 * The note every card, idea and sheet shows for an exercise: its own note, else the old per-card or per-idea note
 * (`legacy`) until the exercise gets one. LEGACY FALLBACK: remove with the `legacy` argument once old notes are gone.
 */
export const shownNote = (cfg: Pick<Cfg, 'ex'>, exId: string, legacy?: string | null): string => ownNote(cfg, exId) || legacy || '';

/**
 * What saving a Note field means for the exercise: the cleaned text to store ('' removes the note), or null when the
 * text is what the exercise already holds (no write). Saving the shown old per-card note therefore moves it up onto the
 * exercise, and a card or idea saved afterwards no longer keeps its own copy (the stores stop writing it).
 */
export const noteToSave = (cfg: Pick<Cfg, 'ex'>, exId: string, text: string | null | undefined): string | null => {
  const t = cleanNote(text);
  return t === ownNote(cfg, exId) ? null : t;
};
