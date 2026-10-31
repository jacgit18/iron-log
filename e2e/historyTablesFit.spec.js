import { test, expect } from './fixtures.js';

// Second-pass audit S2-06, S2-07, S2-08: the Log sheet's Recent table, the Progress body-weight table, the weight-change rows and the KPI tiles ran past the screen at
// 320px wide with the text at 200% (381px in a 320px sheet, 363px in a 320px page, the delete button at x 357). Below a box width of 15rem they become wrapping
// cards, stacked rows and one tile a row; at a normal text size nothing changes. "200%" sets the root text size to 200% (rem, and so the 15rem, grow with it).
const LAT = [['2026-08-04', 80, 8], ['2026-08-11', 87.5, 9], ['2026-08-18', 95, 8], ['2026-08-25', 102.5, 9], ['2026-09-01', 110, 8], ['2026-09-08', 117.5, 10]].map(([d, w, r]) => ({ d, ph: 'hyp', w, s: 4, r }));
const BODY = [['2026-08-16', '2026-08-17', 182.4], ['2026-08-23', '2026-08-24', 181.9], ['2026-08-30', '2026-08-31', 181.2], ['2026-09-06', '2026-09-07', 180.8], ['2026-09-13', '2026-09-14', 180.1], ['2026-09-20', '2026-09-21', 179.5]].map(([wk, d, w]) => ({ wk, d, w }));

async function open(page, w, zoom) {
  await page.setViewportSize({ width: w, height: 700 });
  await page.evaluate(({ LAT, BODY }) => { localStorage.setItem('ironlog:logs/latpd', JSON.stringify({ entries: LAT })); localStorage.setItem('ironlog:body/main', JSON.stringify({ entries: BODY })); }, { LAT, BODY });
  await page.reload();
  if (zoom) await page.addStyleTag({ content: 'html{font-size:200%!important}' });
}
const sheetFit = page => page.locator('.sheet').evaluate(s => ({ scroll: s.scrollWidth, client: s.clientWidth }));
const drill = async (page, name) => { await page.getByRole('button', { name }).click(); };
const pageFit = page => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, w: innerWidth }));

for (const [w, zoom] of [[320, true], [390, true]]) {
  const where = `${w}px at 200% text`;
  test(`${where}: the Log sheet's Recent list fits the sheet`, async ({ page }) => {
    await open(page, w, zoom);
    await page.click('#log-A-d1s1-0');
    await expect(page.locator('.sheet table.hist tbody tr')).toHaveCount(LAT.length);
    const m = await sheetFit(page);
    expect(m.scroll).toBeLessThanOrEqual(m.client);
  });

  test(`${where}: Progress does not scroll sideways, the body-weight delete buttons are on screen and the weight-change names are whole`, async ({ page }) => {
    await open(page, w, zoom);
    await page.click('#tab-progress');
    await expect(page.locator('.kpis .kpi').first()).toBeVisible();
    const home = await pageFit(page);
    expect(home.scroll, `page ${home.scroll} wide in ${home.w}`).toBeLessThanOrEqual(home.w);
    await expect(page.locator('table.bwtab tbody tr').first()).toBeVisible();
    const m = await pageFit(page);
    expect(m.scroll, `page ${m.scroll} wide in ${m.w}`).toBeLessThanOrEqual(m.w);
    const dels = await page.locator('table.bwtab tbody button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return { right: r.right, h: r.height }; }));
    expect(dels.length).toBeGreaterThan(0);
    for (const d of dels) { expect(d.right).toBeLessThanOrEqual(w); expect(d.h).toBeGreaterThanOrEqual(44); }
    await drill(page, /Training trends/);
    await expect(page.locator('span.chn').first()).toBeVisible();
    const t = await pageFit(page);
    expect(t.scroll, `trends page ${t.scroll} wide in ${t.w}`).toBeLessThanOrEqual(t.w);
    const names = await page.locator('span.chn').evaluateAll(es => es.map(e => ({ n: e.textContent.slice(0, 16), cut: e.scrollWidth > e.clientWidth + 1 })));
    for (const n of names) expect(n.cut, `${n.n} is cut`).toBe(false);
  });
}

test('at a normal text size the Log table and the body-weight table stay plain tables on a phone', async ({ page }) => {
  await open(page, 390, false);
  await page.click('#log-A-d1s1-0');
  expect(await page.locator('.sheet table.hist-recent').evaluate(t => getComputedStyle(t).display)).toBe('table');
  expect((await sheetFit(page)).scroll).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await page.click('#tab-progress');
  await expect(page.locator('table.bwtab')).toBeVisible();
  expect(await page.locator('table.bwtab').evaluate(t => getComputedStyle(t).display)).toBe('table');
});

test('the KPI tiles are two a row on a phone at a normal text size and one a row at 200%', async ({ page }) => {
  await open(page, 390, false);
  await page.click('#tab-progress');
  await expect(page.locator('.kpis .kpi').first()).toBeVisible();
  const tops = async () => page.locator('.kpis .kpi').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top)));
  const t1 = await tops();
  expect(t1[0]).toBe(t1[1]); // the first two share a row
  await page.addStyleTag({ content: 'html{font-size:200%!important}' });
  await expect.poll(async () => new Set(await tops()).size).toBeGreaterThan(1); // the 200% rule has applied
  const t2 = await tops();
  expect(t2.length).toBeGreaterThan(1);
  expect(new Set(t2).size).toBe(t2.length); // every tile on its own row
});

// Review of PR 411: a wider phone (landscape, 480 to 700px) kept the old two tiles a row; the heat-map week labels were not cut at a normal text size;
// at 200% text a weight-change row's bar no longer sits under its value.
test('at 600px wide the KPI tiles are still two a row, not four', async ({ page }) => {
  await open(page, 600, false);
  await page.click('#tab-progress');
  await expect(page.locator('.kpis .kpi').first()).toBeVisible();
  const tops = await page.locator('.kpis .kpi').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top)));
  expect(tops[0]).toBe(tops[1]);
  expect(tops[2]).toBeGreaterThan(tops[0]);
});

test('360px at a normal text size: the heat-map week labels are not cut', async ({ page }) => {
  await open(page, 360, false);
  await page.click('#tab-progress');
  await drill(page, /Training trends/);
  const labels = page.locator('.heat .hx:not(.alt)');
  await expect(labels.first()).toBeVisible();
  const cut = await labels.evaluateAll(es => es.filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'hidden').length);
  expect(cut).toBe(0);
});

test('320px at 200% text: a weight-change bar does not sit under its value', async ({ page }) => {
  await open(page, 320, true);
  await page.click('#tab-progress');
  await drill(page, /Training trends/);
  await expect(page.locator('.chrow').first()).toBeVisible();
  const rows = await page.locator('.chrow').evaluateAll(es => es.map(e => { const b = e.querySelector('.chbar').getBoundingClientRect(), v = e.querySelector('.chv').getBoundingClientRect(); return { overlap: b.bottom > v.top + 1 && b.top < v.bottom - 1 && b.right > v.left && b.left < v.right }; }));
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r.overlap).toBe(false);
});
