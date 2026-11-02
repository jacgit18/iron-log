import { describe, expect, it } from 'vitest';
import { maskEmail } from './maskEmail.js';

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('jane.doe@gmail.com')).toBe('j***@gmail.com');
    expect(maskEmail('A@b.co')).toBe('A***@b.co');
  });
  it('never returns more than the first letter of the name', () => {
    expect(maskEmail('secretname@proton.me')).not.toContain('ecret');
    expect(maskEmail('élan@x.fr')).toBe('é***@x.fr');
  });
  it('is a plain label for anything that is not an address', () => {
    for (const v of ['', null, undefined, 'noatsign', '@x.com', 'x@']) expect(maskEmail(v)).toBe('account');
  });
});
