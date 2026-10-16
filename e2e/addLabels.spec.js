import { test, expect } from './fixtures.js';

// A board day has no add buttons under its header (owner's request, 2026-10-16): the first card follows the header directly.
test('a board day has no + Add to program or + This week only buttons', async ({ page }) => {
  const col = page.locator('#col-1');
  await expect(col.getByRole('button', { name: /^Add to program, Day/ })).toHaveCount(0);
  await expect(col.getByRole('button', { name: /^This week only: add an exercise to Day/ })).toHaveCount(0);
});
