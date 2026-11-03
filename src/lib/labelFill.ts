import { SCAN_TEXT } from './scanPhoto.js';
import { labelNote, type LabelResult } from '../shared/scan.js';

// Scan label (brief label-photo-scan): what a scan result does to the Ready-made form. Pure, so the rules are node tests: the four numbers are always
// replaced (they come from the label); the name and the Note are filled only while their boxes are empty; a result with no numbers changes no number.
export interface FormText { n: string; note: string }
export interface FillPlan { n?: string; kcal?: string; p?: string; c?: string; f?: string; note?: string; message: string }

const str = (v: number | undefined) => (v !== undefined ? String(v) : '');

export function planFill(result: LabelResult, form: FormText): FillPlan {
  if (result.kind === 'unreadable') return { message: SCAN_TEXT.unreadable };
  if (result.kind === 'per100g') return { ...(result.name && !form.n.trim() ? { n: result.name } : {}), message: SCAN_TEXT.per100g };
  const l = result.label;
  const line = labelNote(l);
  return {
    ...(l.name && !form.n.trim() ? { n: l.name } : {}),
    kcal: String(l.kcal), p: String(l.p), c: str(l.c), f: str(l.f),
    ...(line && !form.note.trim() ? { note: line } : {}),
    message: 'Filled from the photo. Check the numbers against the label, then save.',
  };
}
