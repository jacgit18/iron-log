import { test, expect } from './fixtures.js';

test.use({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });

// To get, any month: the arrow on an open row closes it again, whatever the row's split. The fixed date is in September 2026.
const CATALOGUE = {
  stores: ["BJ's", 'Aldi'],
  items: [
    { id: 'chicken', n: 'Chicken', store: "BJ's", qty: 1, cents: 900, every: true, out: false },
    { id: 'rice', n: 'Rice', store: 'Aldi', qty: 1, cents: 300, every: true, out: false },
    { id: 'eggs', n: 'Eggs', store: "BJ's", qty: 1, cents: 400, every: true, out: false, share: { with: ['sis'] } },
    { id: 'soap', n: 'Soap', store: "BJ's", qty: 1, cents: 400, every: true, out: false, share: { with: [], notMine: true } },
    { id: 'tea', n: 'Tea', store: "BJ's", qty: 1, cents: 400, every: true, out: false, share: { with: ['mom'], notMine: true } },
    { id: 'milk', n: 'Milk', store: 'Aldi', qty: 1, cents: 400, every: true, out: false, share: { with: [] } },
  ],
  groups: [{ id: 'g1', n: 'Costco run', people: [{ id: 'sis', n: 'Sister' }, { id: 'mom', n: 'Mom' }], stores: ["BJ's"] }],
};

// Each flow runs for this month, next month and two months ahead inside one test: every leg seeds and reloads, so it starts clean.
const seedCatalogue = async page => {
  await page.evaluate(C => { localStorage.setItem('ironlog:session/admin', 'true'); localStorage.setItem('ironlog:grocery/main', JSON.stringify(C)); }, CATALOGUE);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
};

test('every row\'s arrow closes it again: this month, next month and two months ahead', async ({ page }) => {
  for (const [label, nexts] of [['this month', 0], ['next month', 1], ['two months ahead', 2]]) {
    await seedCatalogue(page);
    for (let i = 0; i < Math.abs(nexts); i++) await page.click(nexts > 0 ? '#groc-next' : '#groc-prev');
    for (const name of ['Chicken', 'Rice', 'Eggs', 'Soap', 'Tea', 'Milk']) {
      const arrow = page.getByRole('button', { name: new RegExp(`and price of ${name}$`) });
      await arrow.tap();
      await expect(arrow, `${label}: ${name} opens`).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator(`#${await arrow.getAttribute('aria-controls')}`), `${label}: ${name}'s panel shows`).toBeVisible();
      await arrow.tap();
      await expect(arrow, `${label}: ${name} closes`).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator(`#${await arrow.getAttribute('aria-controls')}`), `${label}: ${name}'s panel is out of sight`).toBeHidden();
    }
  }
});

test('Expand all then Collapse all closes every row of each store (0, 1 and 2 months ahead)', async ({ page }) => {
  for (const nexts of [0, 1, 2]) {
    await seedCatalogue(page);
    for (let i = 0; i < nexts; i++) await page.tap('#groc-next');
    const buttons = page.getByRole('button', { name: /^(Expand|Collapse) all in / });
    const n = await buttons.count();
    expect(n, `${nexts} months ahead has stores`).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await page.getByRole('button', { name: /^Expand all in / }).first().click();
    await expect(page.locator('.gqty[aria-expanded="false"]')).toHaveCount(0);
    for (let i = 0; i < n; i++) await page.getByRole('button', { name: /^Collapse all in / }).first().click();
    await expect(page.locator('.gqty[aria-expanded="true"]'), `${nexts} months ahead: every row closed again`).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Collapse all in / })).toHaveCount(0);
  }
});

test('the Shared with arrow opens and closes again on every kind of row (0, 1 and 2 months ahead)', async ({ page }) => {
  for (const nexts of [0, 1, 2]) {
    await seedCatalogue(page);
    for (let i = 0; i < nexts; i++) await page.tap('#groc-next');
    for (const name of ['Chicken', 'Rice', 'Eggs', 'Soap', 'Tea', 'Milk']) {
      await page.getByRole('button', { name: new RegExp(`and price of ${name}$`) }).click();
      const picker = page.locator('li', { has: page.getByRole('button', { name: new RegExp(`and price of ${name}$`) }) }).locator('details.gshare');
      if (!(await picker.count())) continue; // a row with no groups has no picker
      await picker.locator('summary').click();
      await expect(picker, `${nexts} ahead, ${name}: Shared with opens`).toHaveJSProperty('open', true);
      await picker.locator('summary').click();
      await expect(picker, `${nexts} ahead, ${name}: Shared with closes`).toHaveJSProperty('open', false);
    }
  }
});

test('after the split is set to Just me or Not mine, the Shared with arrow still closes', async ({ page }) => {
  await page.evaluate(C => { localStorage.setItem('ironlog:session/admin', 'true'); localStorage.setItem('ironlog:grocery/main', JSON.stringify(C)); }, CATALOGUE);
  await page.reload();
  await page.click('#tab-daily'); await page.click('#daily-grocery');
  await page.click('#groc-next');
  await page.getByRole('button', { name: /and price of Chicken$/ }).click();
  const li = page.locator('li', { has: page.getByRole('button', { name: /and price of Chicken$/ }) });
  const picker = li.locator('details.gshare');
  await picker.locator('summary').click();
  await picker.getByLabel('Mom').uncheck();
  await picker.getByLabel('Sister').uncheck(); // Just me
  await expect(picker.locator('summary')).toContainText('Just me');
  await expect(picker, 'still open after the change').toHaveJSProperty('open', true);
  await picker.locator('summary').click();
  await expect(picker, 'Just me closes').toHaveJSProperty('open', false);
  await picker.locator('summary').click();
  await picker.getByLabel('Sister').check();
  await picker.getByLabel('It’s not for me').check(); // Not mine
  await expect(picker.locator('summary')).toContainText('Not mine');
  await picker.locator('summary').click();
  await expect(picker, 'Not mine closes').toHaveJSProperty('open', false);
});
