import { describe, it, expect } from 'vitest';
import { isPlansPath } from './plansPage.js';

describe('isPlansPath', () => {
  it.each(['/plans', '/plans/'])('is the plans page at %s', p => expect(isPlansPath(p)).toBe(true));
  it.each(['/', '', '/plan', '/plans/extra', '/settings/plans', '/PLANS'])('is not the plans page at %j', p => expect(isPlansPath(p)).toBe(false));
});
