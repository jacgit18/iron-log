import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The plain pages the server hands out as files (public/*.html) each have their own tab title, ending in the product name: QA scenario S-100.
const titleOf = (file: string) => readFileSync(join(__dirname, '..', '..', 'public', file), 'utf8').match(/<title>([^<]*)<\/title>/)?.[1];

describe('the plain pages have their own titles', () => {
  it.each([
    ['privacy.html', 'Privacy Policy · Loadbearer'],
    ['terms.html', 'Terms of Use · Loadbearer'],
    ['delete-account.html', 'Delete your account · Loadbearer'],
  ])('%s is titled %s', (file, title) => expect(titleOf(file)).toBe(title));
});
