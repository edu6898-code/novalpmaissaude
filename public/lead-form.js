(() => {
  'use strict';
  const keys = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic','gclid','gbraid','wbraid','fbclid','msclkid','ttclid'];
  const storageKey = 'mais_saude_attribution_v1';
  const now = new Date().toISOString();
  const params = new URLSearchParams(location.search);
  const current = Object.fromEntries(keys.map(key => [key, (params.get(key) || '').slice(0, 500)]));
  Object.assign(current, { landing_page: location.href.slice(0, 2048), referrer: document.referrer.slice(0, 2048), captured_at: now });
  let attribution;
  try { attribution = JSON.parse(localStorage.getItem(storageKey)); } catch { /* storage may be unavailable */ }
  if (!attribution?.first_touch || !attribution?.last_touch || Date.now() - Date.parse(attribution.first_touch.captured_at) > 30 * 86400000 || !Number.isFinite(Date.parse(attribution.first_touch.captured_at))) {
    attribution = { first_touch: current, last_touch: current };
  } else if (keys.some(key => current[key])) {
    attribution.last_touch = current;
  }
  try { localStorage.setItem(storageKey, JSON.stringify(attribution)); } catch { /* in-memory fallback */ }

  const config = window.LEAD_CONFIG || {};
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  if (config.googleAds?.id) {
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.googleAds.id)}`;
    document.head.append(tag);
    window.gtag('js', new Date());
    window.gtag('config', config.googleAds.id);
  }
  if (config.metaPixelId) {
    if (!window.fbq) {
      const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
      fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
      window.fbq = window._fbq = fbq;
      const tag = document.createElement('script'); tag.async = true;
      tag.src = 'https://connect.facebook.net/en_US/fbevents.js'; document.head.append(tag);
    }
    window.fbq('init', config.metaPixelId);
    window.fbq('track', 'PageView');
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'lead-dialog';
  dialog.setAttribute('aria-labelledby', 'lead-title');
  dialog.innerHTML = `
    <button type="button" class="lead-close" aria-label="Fechar formulário">×</button>
    <h2 id="lead-title">Fale com um especialista</h2>
    <p>Preencha seus dados para continuar o atendimento pelo WhatsApp.</p>
    <form id="lead-form">
      <label for="lead-name">Seu nome</label>
      <input id="lead-name" name="nome" autocomplete="name" minlength="2" maxlength="120" required placeholder="Como podemos chamar você?">
      <label for="lead-phone">WhatsApp com DDD</label>
      <input id="lead-phone" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" maxlength="22" required placeholder="(85) 99999-9999">
      <div class="lead-trap" aria-hidden="true"><label for="lead-website">Website</label><input id="lead-website" name="website" tabindex="-1" autocomplete="off"></div>
      <label class="lead-consent"><input name="consentimento_contato" type="checkbox" required> <span>Autorizo a Mais Saúde Hospitalar a usar meu nome e telefone para entrar em contato sobre este atendimento.</span></label>
      <button class="lead-submit" type="submit">Continuar para o WhatsApp</button>
      <p class="lead-status" role="status" aria-live="polite"></p>
      <p class="lead-privacy">Seus dados serão enviados para nossa equipe junto com a origem da visita. <a href="/privacidade.html" target="_blank" rel="noopener">Saiba mais</a>.</p>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form'), status = dialog.querySelector('.lead-status'), submit = dialog.querySelector('.lead-submit');
  const phone = form.elements.whatsapp;
  phone.addEventListener('input', () => phone.setCustomValidity(''));
  let selected = null, busy = false, attempt = null, previousFocus;
  function close() { if (!busy) dialog.close(); }
  dialog.querySelector('.lead-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); }
  });
  dialog.addEventListener('close', () => { document.documentElement.classList.remove('lead-modal-open'); previousFocus?.focus(); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    let url; try { url = new URL(link.href); } catch { return; }
    if (url.hostname !== 'wa.me') return;
    event.preventDefault();
    const message = url.searchParams.get('text') || 'Olá! Gostaria de mais informações.';
    const product = message.split(/sobre\s+/i)[1]?.trim() || 'Atendimento geral';
    selected = { url, message, product, button: link.innerText.trim() || product };
    previousFocus = link; status.textContent = ''; attempt = null;
    dialog.showModal(); document.documentElement.classList.add('lead-modal-open');
    form.elements.nome.focus();
  });
  const cookie = name => { try { return decodeURIComponent(document.cookie.split('; ').find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || ''); } catch { return ''; } };
  const converted = new Set();
  async function conversion(lead) {
    let known = false;
    try { known = sessionStorage.getItem(`lead_sent_${lead.lead_id}`) === '1'; } catch { /* fallback */ }
    if (known || converted.has(lead.lead_id)) return;
    converted.add(lead.lead_id);
    try { sessionStorage.setItem(`lead_sent_${lead.lead_id}`, '1'); } catch { /* fallback */ }
    // Never send name, phone, email or full page URLs to analytics events.
    window.dataLayer.push({ event: 'lead_form_success', lead_id: lead.lead_id, product: lead.produto, form_name: 'whatsapp_lead' });
    if (config.metaPixelId) window.fbq('track', 'Lead', { content_name: lead.produto }, { eventID: lead.lead_id });
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 1500);
      if (config.googleAds?.id && config.googleAds?.label) {
        window.gtag('event', 'conversion', {
          send_to: `${config.googleAds.id}/${config.googleAds.label}`,
          transaction_id: lead.lead_id,
          event_callback: () => { clearTimeout(timer); resolve(); },
          event_timeout: 1500,
        });
      } else { clearTimeout(timer); resolve(); }
    });
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !selected) return;
    const digits = phone.value.replace(/\D/g, '');
    if (!/^(?:55)?[1-9]\d{9,10}$/.test(digits)) { phone.setCustomValidity('Informe um WhatsApp válido com DDD.'); phone.reportValidity(); return; }
    if (!form.reportValidity()) return;
    const fields = { nome: form.elements.nome.value.trim(), whatsapp: digits, website: form.elements.website.value, consentimento_contato: form.elements.consentimento_contato.checked };
    const fingerprint = JSON.stringify([fields, selected.product]);
    if (!attempt || attempt.fingerprint !== fingerprint) attempt = { fingerprint, id: crypto.randomUUID() };
    const lead = {
      ...fields, lead_id: attempt.id, produto: selected.product, mensagem: selected.message,
      ...attribution, page_url: location.href, page_title: document.title, button_text: selected.button,
      fbp: cookie('_fbp'), fbc: cookie('_fbc'), idioma: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dispositivo: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
    };
    busy = true; submit.disabled = true; status.textContent = 'Enviando seus dados…';
    dialog.querySelector('.lead-close').disabled = true;
    try {
      const response = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (!response.ok || result.ok !== true || result.lead_id !== lead.lead_id) throw new Error(result.error || 'Não foi possível confirmar o envio. Tente novamente.');
      status.textContent = 'Cadastro enviado! Abrindo o WhatsApp…';
      try { await conversion(lead); } catch { /* Analytics must never prevent confirmed leads reaching WhatsApp. */ }
      const destination = new URL(selected.url);
      destination.searchParams.set('text', `${selected.message}\n\nMeu nome é ${lead.nome}.`);
      location.assign(destination.href);
    } catch (error) {
      status.textContent = error.name === 'TimeoutError' || error.name === 'AbortError' ? 'O envio demorou mais que o esperado. Tente novamente.' : error.message || 'Não foi possível enviar. Verifique sua conexão e tente novamente.';
      busy = false; submit.disabled = false; dialog.querySelector('.lead-close').disabled = false;
    }
  });
})();
