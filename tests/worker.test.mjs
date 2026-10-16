import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleLead, isAcknowledged } from '../src/worker.js';
const id = '17b67b9d-bde5-4ff1-af28-b9f8f9de4167';
const data = { lead_id: id, nome: 'Pessoa Teste', whatsapp: '(85) 99999-1234', produto: 'Cadeiras de Rodas Básicas', consentimento_contato: true, first_touch: { utm_source: 'google', utm_campaign: 'primeira' }, last_touch: { utm_source: 'meta', utm_campaign: 'segunda', fbclid: 'abc' } };
const request = (input = data, headers = {}) => new Request('https://lp.example/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://lp.example', ...headers }, body: JSON.stringify(input) });
test('forwards the provided webhook, form and first/last attribution and acknowledges receipt', async () => {
  let forwarded;
  const result = await handleLead(request(), async (url, options) => {
    assert.equal(new URL(url).hostname, 'script.google.com');
    assert.equal(new URL(url).searchParams.get('gid'), '0');
    assert.equal(options.method, 'POST');
    forwarded = JSON.parse(options.body);
    return Response.json({ success: true });
  });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, lead_id: id });
  assert.equal(forwarded.whatsapp, '85999991234');
  assert.equal(forwarded.nome, data.nome);
  assert.equal(forwarded.utm_source, 'meta');
  assert.equal(forwarded.first_utm_source, 'google');
  assert.equal(forwarded.first_touch.utm_campaign, 'primeira');
  assert.equal(forwarded.last_touch.utm_campaign, 'segunda');
  assert.ok(forwarded.submitted_at);
});
test('rejects invalid fields, missing permission, bot fields and cross-origin submissions without sending', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ ok: true }); };
  for (const input of [{ ...data, nome: '' }, { ...data, whatsapp: '123' }, { ...data, consentimento_contato: false }, { ...data, website: 'spam' }, { ...data, lead_id: 'bad' }]) {
    assert.equal((await handleLead(request(input), fetcher)).status, 400);
  }
  assert.equal((await handleLead(request(data, { Origin: 'https://other.example' }), fetcher)).status, 403);
  assert.equal(calls, 0);
});
test('upstream errors, HTML login pages and negative acknowledgements never report a saved lead', async () => {
  for (const response of [new Response('denied', { status: 403 }), new Response('<html>Sign in</html>'), Response.json({ success: false }), Response.json({ status: 'error', message: 'sheet not found' })]) {
    const result = await handleLead(request(), async () => response);
    assert.equal(result.status, 502);
    assert.equal((await result.json()).ok, false);
  }
  assert.equal((await handleLead(request(), async () => { throw new Error('offline'); })).status, 502);
});
test('only explicit acknowledgement succeeds', () => {
  for (const body of ['OK', '{"status":"success"}', '{"result":"success"}', '{"ok":true}']) assert.equal(isAcknowledged(body), true);
  for (const body of ['{}', '', '{"ok":true,"error":"failed"}', '<html>ok</html>']) assert.equal(isAcknowledged(body), false);
});
