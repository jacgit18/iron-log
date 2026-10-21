import { test, expect } from './fixtures.js';

// Groceries at a narrow phone and at a large text size (second-pass audit S2-01 to S2-04). Rows and the add bar wrap and a select never exceeds its box, so the page
// does not scroll sideways, an item name is never squeezed to a letter a line, and the add field stays usable. "200%" sets the root text size to 200%.
const LONG_STORE = 'Riverside Farmers Wholesale Market #7!!'.slice(0, 40);
const LONG_NAME = 'Extra virgin cold-pressed organic olive oil in a dark glass bottle 1L';
const item = (id, n, store, cents, extra = {}) => ({ id, n, store, qty: 2, cents, every: true, out: false, ...extra });
const DATA = {
  stores: ['Costco', LONG_STORE],
  items: [
    item('ct', 'Chicken thighs', 'Costco', 1249, { unit: 'lb', note: 'bone-in skin-on family pack' }),
    item('oo', LONG_NAME, LONG_STORE, 1599, { note: 'a very long note about this item that keeps going to test the wrapping of notes in the list row' }),
    item('bn', 'Bananas', 'Costco', 59, { unit: 'lb' }),
  ],
  groups: [{ id: 'g1', n: 'Costco run with the whole family and friends'.slice(0, 40), people: [{ id: 'a', n: 'Sister' }, { id: 'b', n: 'A person with a very long name indeed' }], stores: [LONG_STORE] }],
};

async function open(page, w, zoom) {
  await page.setViewportSize({ width: w, height: 640 });
  await page.evaluate(d => { localStorage.setItem('ironlog:session/admin', 'true'); localStorage.setItem('ironlog:grocery/main', JSON.stringify(d)); }, DATA);
  await page.reload();
  if (zoom) await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await page.click('#tab-daily');
  await page.click('#daily-grocery');
}
const noSideScroll = async page => { const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: innerWidth })); expect(m.s, `page ${m.s} wide in ${m.w}`).toBeLessThanOrEqual(m.w); };

for (const [w, zoom] of [[320, false], [320, true], [390, true]]) {
  const where = `${w}px${zoom ? ' at 200% text' : ''}`;

  test(`${where}: To get does not scroll sideways and an item name is never squeezed to a sliver`, async ({ page }) => {
    await open(page, w, zoom);
    await page.click('#groc-view-get');
    await noSideScroll(page);
    const names = await page.evaluate(() => [...document.querySelectorAll('button.gnamebtn')].map(e => { const r = e.getBoundingClientRect(); return { n: e.textContent.slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; }));
    expect(names.length).toBeGreaterThan(2);
    for (const n of names) { expect(n.w, `${n.n} is ${n.w}px wide`).toBeGreaterThanOrEqual(60); expect(n.h, `${n.n} is ${n.h}px tall`).toBeLessThan(400); }
  });

  test(`${where}: an opened row, with a 40-character store, does not scroll sideways`, async ({ page }) => {
    await open(page, w, zoom);
    await page.click('#groc-view-get');
    await page.getByRole('button', { name: /price of Chicken thighs/i }).click();
    await expect(page.locator('select[id^="groc-store-"]').first()).toBeVisible();
    await noSideScroll(page);
    const sel = await page.locator('select[id^="groc-store-"]').first().evaluate(e => ({ right: e.getBoundingClientRect().right, w: innerWidth }));
    expect(sel.right).toBeLessThanOrEqual(sel.w);
  });

  test(`${where}: in Edit mode the add field is still wide enough to type in`, async ({ page }) => {
    await open(page, w, zoom);
    await page.click('#groc-view-home');
    await page.click('#groc-edit');
    await noSideScroll(page);
    const w1 = await page.locator('#groc-name').evaluate(e => e.getBoundingClientRect().width);
    expect(w1, `the add field is ${Math.round(w1)}px wide`).toBeGreaterThanOrEqual(90);
  });

  test(`${where}: the Sharing panel, with a long group name, does not scroll sideways`, async ({ page }) => {
    await open(page, w, zoom);
    await page.click('#groc-view-home');
    await page.click('#groc-sharing');
    await expect(page.getByRole('region', { name: 'Sharing' })).toBeVisible();
    await noSideScroll(page);
  });
}
