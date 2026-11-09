import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isVersionText, PRIVACY_VERSION, TERMS_VERSION } from './termsVersion.js';

// The constants must match the `Version x.y` each public page shows, so a page bump without a constant bump (or the reverse) fails here.
const versionOf = (file: string) => /Version (\d+\.\d+)/.exec(readFileSync(new URL(`../../public/${file}`, import.meta.url), 'utf8'))?.[1];

describe('termsVersion', () => {
  it('matches public/terms.html', () => expect(TERMS_VERSION).toBe(versionOf('terms.html')));
  it('matches public/privacy.html', () => expect(PRIVACY_VERSION).toBe(versionOf('privacy.html')));
  it('are in the shape the database accepts', () => {
    expect(isVersionText(TERMS_VERSION) && isVersionText(PRIVACY_VERSION)).toBe(true);
    expect(isVersionText('1')).toBe(false);
    expect(isVersionText('1.3; drop')).toBe(false);
    expect(isVersionText(1.3)).toBe(false);
  });
});
