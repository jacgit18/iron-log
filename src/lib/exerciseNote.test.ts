import { describe, it, expect } from 'vitest';
import { NOTE_MAX, cleanNote, noteToSave, shownNote } from './exerciseNote.js';

const cfg = (ex: Record<string, { note?: string }>) => ({ ex });

describe('shownNote', () => {
  it('shows the exercise note over an old per-card note', () => {
    expect(shownNote(cfg({ bench: { note: 'Feet flat' } }), 'bench', 'old')).toBe('Feet flat');
  });
  it('falls back to the old per-card note until the exercise has one', () => {
    expect(shownNote(cfg({}), 'bench', 'old')).toBe('old');
    expect(shownNote(cfg({ bench: {} }), 'bench', 'old')).toBe('old');
  });
  it('is empty with neither', () => {
    expect(shownNote(cfg({}), 'bench')).toBe('');
    expect(shownNote(cfg({}), 'bench', null)).toBe('');
  });
});

describe('noteToSave', () => {
  it('writes nothing when the text is the exercise note', () => {
    expect(noteToSave(cfg({ bench: { note: 'Feet flat' } }), 'bench', '  Feet flat ')).toBeNull();
    expect(noteToSave(cfg({}), 'bench', '   ')).toBeNull();
  });
  it('writes the trimmed text when it differs, so a shown old note moves up on first save', () => {
    expect(noteToSave(cfg({}), 'bench', ' old ')).toBe('old');
    expect(noteToSave(cfg({ bench: { note: 'a' } }), 'bench', 'b')).toBe('b');
  });
  it('clears the note when the field is emptied', () => {
    expect(noteToSave(cfg({ bench: { note: 'a' } }), 'bench', '')).toBe('');
  });
  it('caps the text at 200 characters', () => {
    expect(noteToSave(cfg({}), 'bench', 'x'.repeat(300))).toHaveLength(NOTE_MAX);
    expect(cleanNote(undefined)).toBe('');
  });
});
