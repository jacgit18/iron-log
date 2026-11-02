import { create } from 'zustand';

// The Board's sort-by-muscle and equipment choice. A store of its own (not state inside Board) because on a phone the pickers
// live in a sheet, which the modal host draws, and the sheet and the Board must read the same choice.
type BoardFilter = { muscle: string; eq: string; set(patch: Partial<{ muscle: string; eq: string }>): void; clear(): void };
export const useBoardFilter = create<BoardFilter>(set => ({
  muscle: '',
  eq: '',
  set: patch => set(patch),
  clear: () => set({ muscle: '', eq: '' }),
}));
