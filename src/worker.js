const WEBHOOK = 'https://script.google.com/macros/s/AKfycbySlYPruCktqnJmpnfr0_3FCs3FaLXTt3qHgbMMUkeM_BvPm6ghlsrQY3uIjcTHaM0/exec?gid=0';
const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid'];
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function touch(value) {
  const result = {};
  for (const key of [...attributionKeys, 'landing_page', 'referrer', 'captured_at']) result[key] = text(value?.[key], 2048);
  return result;
}
export function normalizeLead(input, request) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Dados inválidos.');
  if (text(input.website)) throw new Error('Envio inválido.');
  const nome = text(input.nome, 120), whatsapp = text(input.whatsapp, 30).replace(/\D/g, '');
  if (nome.length < 2 || !/[\p{L}]/u.test(nome)) throw new Error('Informe seu nome.');
  if (!/^(?:55)?[1-9]\d{9,10}$/.test(whatsapp)) throw new Error('Informe um WhatsApp válido com DDD.');
  const email = text(input.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (!/^[a-f0-9-]{36}$/i.test(input.lead_id || '')) throw new Error('Identificador inválido.');
  const first = touch(input.first_touch), last = touch(input.last_touch);
  return {
    lead_id: input.lead_id,
    nome,
    whatsapp,
    email,
    produto: text(input.produto, 200) || 'Atendimento geral',
    mensagem: text(input.mensagem, 1000),
    origem: 'LP Mais Saúde Hospitalar',
    ...Object.fromEntries(attributionKeys.map(key => [key, last[key] || ''])),
    first_touch: first,
    last_touch: last,
    ...Object.fromEntries(attributionKeys.map(key => [`first_${key}`, first[key] || ''])),
    landing_page: first.landing_page,
    referrer: first.referrer,
    page_url: text(input.page_url, 2048),
    page_title: text(input.page_title, 300),
    button_text: text(input.button_text, 200),
    whatsapp_destination: '5585997969671',
    fbp: text(input.fbp, 256),
    fbc: text(input.fbc, 512),
    user_agent: text(request.headers.get('user-agent'), 1000),
    idioma: text(input.idioma, 40),
    timezone: text(input.timezone, 100),
    dispositivo: text(input.dispositivo, 40),
    consentimento_contato: input.consentimento_contato === true,
    submitted_at: new Date().toISOString(),
  };
}
// Only an explicit application acknowledgement confirms that a lead was saved.
export function isAcknowledged(body) {
  if (/^(ok|success|sucesso)$/i.test(body.trim())) return true;
  try {
    const value = JSON.parse(body);
    if (!value || value.error || value.success === false || value.ok === false || ['error', 'failed', 'failure'].includes(String(value.status).toLowerCase())) return false;
    return value.success === true || value.ok === true || ['success', 'ok', 'sucesso'].includes(String(value.status).toLowerCase()) || value.result === 'success';
  } catch { return false; }
}
export async function handleLead(request, fetchImpl = fetch) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Método não permitido.' }, 405);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: 'Origem inválida.' }, 403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'Formato inválido.' }, 415);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 20000) return json({ ok: false, error: 'Dados muito grandes.' }, 413);
    input = JSON.parse(raw);
  } catch { return json({ ok: false, error: 'Dados inválidos.' }, 400); }
  let lead;
  try { lead = normalizeLead(input, request); }
  catch (error) { return json({ ok: false, error: error.message }, 400); }
  if (!lead.consentimento_contato) return json({ ok: false, error: 'Autorize o contato para continuar.' }, 400);
  try {
    const response = await fetchImpl(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.text();
    if (!response.ok || !isAcknowledged(body)) {
      // Never log the payload, PII, or response body.
      console.error('Lead webhook rejected or unconfirmed', { status: response.status });
      return json({ ok: false, error: 'Não foi possível confirmar seu cadastro. Tente novamente em instantes.' }, 502);
    }
    return json({ ok: true, lead_id: lead.lead_id });
  } catch {
    console.error('Lead webhook unavailable');
    return json({ ok: false, error: 'O envio está indisponível no momento. Tente novamente.' }, 502);
  }
}
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/api/leads') return handleLead(request);
    return env.ASSETS.fetch(request);
  },
};
