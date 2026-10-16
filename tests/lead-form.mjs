import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
await mkdir('artifacts', { recursive: true });
try {
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const submitted = [], analytics = [], redirects = [], errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('captureAnalytics', (...args) => analytics.push(args));
    await page.addInitScript(() => {
      window.dataLayer = [];
      const push = window.dataLayer.push.bind(window.dataLayer);
      window.dataLayer.push = function (...args) { window.captureAnalytics('dataLayer', ...args.map(arg => Object.prototype.toString.call(arg) === '[object Arguments]' ? Array.from(arg) : arg)); return push(...args); };
      window.fbq = (...args) => window.captureAnalytics('fbq', ...args);
    });
    let fail = true;
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith('https://wa.me/')) { redirects.push(url); return route.fulfill({ body: '<title>WhatsApp test destination</title>' }); }
      if (url === `${base}/api/leads`) {
        const payload = route.request().postDataJSON(); submitted.push(payload);
        await new Promise(r => setTimeout(r, 150));
        return route.fulfill({ status: fail ? 502 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { ok: false, error: 'Falha simulada no webhook. Tente novamente.' } : { ok: true, lead_id: payload.lead_id }) });
      }
      if (!url.startsWith(base) && !url.startsWith('data:')) return route.abort();
      return route.continue();
    });
    await page.goto(`${base}/?utm_source=google&utm_medium=cpc&utm_campaign=primeira&gclid=click-google`, { waitUntil: 'networkidle' });
    const cta = page.locator('a[href*="wa.me"]').nth(1);
    await cta.click();
    assert.equal(await page.locator('dialog').evaluate(d => d.open), true);
    assert.equal(analytics.filter(e => JSON.stringify(e).includes('lead_form_success')).length, 0);
    assert.equal(redirects.length, 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('dialog').evaluate(d => d.open), false);
    // New campaign updates last touch while first touch remains stable across navigation.
    await page.goto(`${base}/?utm_source=meta&utm_medium=paid_social&utm_campaign=segunda&fbclid=click-meta`, { waitUntil: 'networkidle' });
    await page.locator('a[href*="wa.me"]').nth(1).click();
    await page.locator('#lead-name').fill('Pessoa Teste');
    await page.locator('#lead-phone').fill('123');
    await page.locator('[name=consentimento_contato]').check();
    await page.locator('.lead-submit').click();
    assert.equal(submitted.length, 0);
    await page.locator('#lead-phone').fill('(85) 99999-1234');
    await page.screenshot({ path: `artifacts/lead-popup-${name}.png` });
    await page.locator('.lead-submit').click();
    await page.waitForFunction(() => document.querySelector('.lead-status').textContent.includes('Falha simulada'));
    assert.equal(submitted.length, 1);
    assert.equal(redirects.length, 0);
    assert.equal(analytics.filter(e => JSON.stringify(e).includes('lead_form_success')).length, 0);
    assert.equal(analytics.filter(e => e[0] === 'fbq' && e[2] === 'Lead').length, 0);
    fail = false;
    await page.locator('.lead-submit').click();
    await page.waitForURL('https://wa.me/**');
    assert.equal(submitted.length, 2);
    assert.equal(submitted[0].lead_id, submitted[1].lead_id, 'retry retains deduplication identifier');
    assert.equal(submitted[1].first_touch.utm_campaign, 'primeira');
    assert.equal(submitted[1].last_touch.utm_campaign, 'segunda');
    assert.equal(submitted[1].first_touch.gclid, 'click-google');
    assert.equal(submitted[1].last_touch.fbclid, 'click-meta');
    assert.equal(submitted[1].produto, 'Cadeiras de Rodas Básicas');
    assert.equal(submitted[1].whatsapp, '85999991234');
    assert.equal(analytics.filter(e => JSON.stringify(e).includes('lead_form_success')).length, 1);
    assert.equal(analytics.filter(e => e[0] === 'fbq' && e[2] === 'Lead').length, 1);
    assert.equal(analytics.filter(e => e[0] === 'dataLayer' && e[1]?.[0] === 'event' && e[1]?.[1] === 'conversion').length, 1);
    const conversionData = analytics.filter(e => e[0] === 'fbq' && e[2] === 'Lead' || e[0] === 'dataLayer' && e[1]?.[0] === 'event');
    assert.equal(JSON.stringify(conversionData).includes('Pessoa Teste'), false);
    assert.equal(JSON.stringify(conversionData).includes('85999991234'), false);
    assert.equal(redirects.length, 1);
    const destination = new URL(redirects[0]);
    assert.equal(destination.pathname, '/5585997969671');
    assert.ok(destination.searchParams.get('text').includes('Cadeiras de Rodas Básicas'));
    assert.ok(destination.searchParams.get('text').includes('Pessoa Teste'));
    assert.deepEqual(errors, []);
    console.log(`${name}: popup, validation, first/last UTMs, failed delivery, retry, conversions and WhatsApp redirect passed`);
    await context.close();
  }
} finally { await browser.close(); }
