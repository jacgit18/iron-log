import { test, expect } from './fixtures.js';

// The Program tab's Compare section (brief program-compare). The compare rules are unit tested (src/lib/programCompare.test.ts); this checks the wiring:
// collapsed until opened, the filters, a saved program on one side, that nothing is editable, and that nothing is written.
test.use({ viewport: { width: 1440, height: 900 } });

const open = async page => {
  await page.click('#tab-program');
  const toggle = page.getByRole('button', { name: 'Compare programs' });
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return page.locator('.cmpbody');
};
const count = async (body, label) => Number((await body.locator('.cmpchips').first().getByRole('button', { name: new RegExp(`^${label} \\d+$`) }).innerText()).match(/(\d+)$/)[1]);

test('the section is collapsed until it is opened, and closes again', async ({ page }) => {
  await page.click('#tab-program');
  const toggle = page.getByRole('button', { name: 'Compare programs' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.cmpbody')).toHaveCount(0);
  await open(page);
  await expect(page.locator('.cmpboard')).toHaveCount(2);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.cmpbody')).toHaveCount(0);
});

test('every day lists both programs, the counts add up, and a status filter hides the other rows', async ({ page }) => {
  const body = await open(page);
  const all = await count(body, 'All');
  const [same, chg, ph, onlyA, onlyB] = await Promise.all(['Same', 'Changed', 'Phase differs', 'Only in Program A', 'Only in Program B'].map(l => count(body, l)));
  expect(same + chg + ph + onlyA + onlyB).toBe(all);
  // a paired exercise is on both boards, an only-in exercise on one
  await expect(body.locator('.cmprow')).toHaveCount(all + same + chg + ph);
  for (const [label, tag] of [['Same', 'Same'], ['Changed', 'Changed'], ['Phase differs', 'Phase differs']]) {
    await body.getByRole('button', { name: new RegExp(`^${label} \\d+$`) }).click();
    const tags = await body.locator('.cmprow .tag').allTextContents();
    expect(tags.every(t => t === tag), `${label}: only ${tag} rows`).toBe(true);
  }
  await body.getByRole('button', { name: /^Any difference/ }).click();
  expect((await body.locator('.cmprow .tag').allTextContents()).includes('Same')).toBe(false);
  await body.getByRole('button', { name: /^All \d+$/ }).click();
  expect(await count(body, 'All')).toBe(all); // a filter never changes the counts
});

test('a saved copy on the other side compares as the same, and the same program twice says so', async ({ page }) => {
  await page.click('#tab-program');
  await page.locator('#lib-name').fill('Compare copy');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  const body = await open(page);
  await body.getByLabel('Second program').selectOption({ label: 'Compare copy' });
  await expect(body.getByRole('status')).toHaveCount(0);
  expect(await count(body, 'Any difference')).toBe(0);
  await body.getByLabel('Second program').selectOption('A');
  await expect(body.getByRole('status')).toHaveText('Both sides are the same program.');
});

test('nothing in the panel is editable and nothing is written', async ({ page }) => {
  const body = await open(page);
  const stored = () => page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith('ironlog:hide')).sort()));
  const before = await stored();
  await expect(body.locator('.cmpboard .draghandle, .cmpboard .edbtns, .cmpboard button')).toHaveCount(0);
  await page.locator('.cmpdays button').nth(2).click();
  await body.getByRole('button', { name: 'Any phase' }).click();
  await body.getByLabel('First program').selectOption('B');
  expect(await stored()).toBe(before);
});

test('on a phone the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
