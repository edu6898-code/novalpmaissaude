import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
await mkdir('artifacts', { recursive: true });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [], failed = [], external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (!url.startsWith(base) && !url.startsWith('data:')) { external.push(url); return route.abort(); }
      return route.continue();
    });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); }
      await document.fonts.ready;
    });
    await page.waitForTimeout(800);
    const brokenImages = await page.locator('img').evaluateAll(images => images.filter(i => !i.complete || !i.naturalWidth).map(i => i.src));
    assert.deepEqual(brokenImages, [], `${name}: broken images`);
    assert.equal(await page.locator('.elementor-toggle-item').count(), 6);
    const tabs = page.locator('.elementor-tab-title');
    for (let i = 0; i < await tabs.count(); i++) {
      const tab = tabs.nth(i), content = page.locator(`#${await tab.getAttribute('aria-controls')}`);
      await tab.click(); await assert.doesNotReject(() => content.waitFor({ state: 'visible' }));
      assert.equal(await tab.getAttribute('aria-expanded'), 'true');
      await tab.click(); await content.waitFor({ state: 'hidden' });
    }
    const links = await page.locator('a[href*="wa.me"]').evaluateAll(nodes => nodes.map(n => n.href));
    assert.equal(links.length, 16);
    for (const link of links) assert.equal(new URL(link).pathname, '/5585997969671');
    assert.ok(await page.locator('body').innerText().then(t => t.includes('Produto Hospitalar bom, barato')));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name}: horizontal overflow`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
    console.log(JSON.stringify({ name, images: await page.locator('img').count(), faq: 6, whatsapp: links.length, errors, failed, external }, null, 2));
    assert.deepEqual(errors, [], `${name}: browser errors`);
    assert.deepEqual(failed, [], `${name}: local HTTP errors`);
    await page.close();
  }
} finally { await browser.close(); }
