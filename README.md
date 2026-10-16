# Mais Saúde Hospitalar — LP no Cloudflare Workers

Reprodução estática a partir de `maissaudehospitalar.com.zip`. O HTML, os estilos responsivos do Elementor, textos, imagens e links de atendimento foram reaproveitados para preservar o layout fornecido. Não precisa de WordPress, PHP ou banco de dados.

## Rodar localmente

Requer Node.js 24 e npm.

```sh
npm ci
npm run dev
```

No ambiente Codex, use `npm ci --cache /workspace/.npm-cache` e `XDG_CONFIG_HOME=/workspace/.config npm run dev -- --port 8787` para manter os caches em diretórios graváveis.

## Publicar no Cloudflare Workers

```sh
npx wrangler login
npm run check
npm run deploy
```

Entre na conta Cloudflare que receberá o Worker. `wrangler.jsonc` configura o nome `novalpmaissaude` e publica os arquivos de `public/` usando Workers Static Assets e a API de leads em `src/worker.js`. Se necessário, ajuste o nome antes de publicar. Para domínio próprio, configure um Custom Domain no Worker pelo painel da Cloudflare após o deploy.

Para integração com Git no Cloudflare Workers, selecione este diretório como raiz do projeto, não use comando de build e configure `npx wrangler deploy` como comando de deploy. As dependências devem ser instaladas com `npm ci`.

## Validação

Com o servidor local em execução:

```sh
npm test
npm run check
```

O teste usa Playwright com Chromium em `/usr/bin/chromium`; outro binário pode ser indicado por `CHROMIUM_PATH`. Testa desktop (1440 px) e celular (390 px), todas as 29 imagens, as seis perguntas frequentes, os 16 links de WhatsApp, ausência de rolagem horizontal, erros de JavaScript e respostas HTTP locais. Salva capturas em `artifacts/` (ignorado pelo Git). Requisições externas são bloqueadas no teste para demonstrar que os recursos visuais são locais. O Google Maps depende de acesso à internet e não é validado por esse teste; o vídeo permanece como link para o YouTube, igual ao arquivo original.

## Adaptações da exportação

- Imagens usam as versões presentes no ZIP; `srcset` que apontavam para arquivos não incluídos foram resolvidos para essas imagens.
- Poppins, Hind Siliguri e Font Awesome são servidas localmente. O ZIP continha marcadores `No Content` em vez de algumas fontes; os arquivos foram substituídos pelas distribuições dos respectivos pacotes.
- Espaços indevidos em operadores de optional chaining do JavaScript exportado foram corrigidos para restaurar os widgets do Elementor.
- URLs de CSS, JavaScript e imagens são locais. Os links do WhatsApp mantêm número e mensagens originais, com a barra duplicada corrigida.
- Os scripts antigos de anúncios e analytics foram removidos durante a importação. O rastreamento atual do formulário usa Google Ads e Meta Pixel em `public/lead-config.js`, conforme a seção de leads abaixo.
- O bloco de exemplo `Code is Poetry` e o rodapé presentes no HTML original foram preservados, conforme o pedido de reprodução fiel.

O conteúdo principal é `public/index.html`; os estilos específicos da página estão em `public/wp-content/uploads/elementor/css/post-17.css`.

Para repetir a importação a partir do ZIP extraído:

```sh
node scripts/import-original.mjs /caminho/da/pasta-extraida
```

A importação lê o arquivo como referência; não executa o JavaScript do ZIP. Arquivos de terceiros mantêm seus avisos de licença. As fontes têm licenças OFL e o Font Awesome mantém suas licenças em `public/licenses/`.

A publicação na conta Cloudflare não foi realizada nesta entrega.

## Formulário de leads e atribuição

Os 16 CTAs de WhatsApp abrem o mesmo popup com nome, WhatsApp e autorização de contato. O produto é identificado pela mensagem original do botão. Após um POST para `/api/leads`, o Worker encaminha os dados como JSON ao webhook do Apps Script informado, mantendo `?gid=0`. O endpoint não fica sob a dependência de CORS do Google: navegador e API usam a mesma origem, e o Worker faz a chamada externa.

Dados enviados: `lead_id`, `nome`, `whatsapp`, `produto`, mensagem do botão, UTMs, IDs de clique (gclid/gbraid/wbraid/fbclid/msclkid/ttclid), primeira e última atribuição, página de entrada e atual, referência, título da página, texto do botão, destino do WhatsApp, `_fbp`/`_fbc` quando disponíveis, idioma, fuso, categoria do dispositivo, user agent, autorização e horário do servidor. Campos indisponíveis ficam vazios; o código não inventa identificadores. As UTMs principais refletem a última campanha; `first_utm_*` e `first_touch` preservam a primeira. Uma visita sem campanha mantém a atribuição anterior por até 30 dias. Nome e telefone não são salvos no localStorage.

O servidor aceita confirmação explícita do webhook: JSON com `ok: true`, `success: true`, `status: "success"`/`"ok"`/`"sucesso"`, `result: "success"`, ou texto `OK`, `success`, `sucesso`. Resposta HTTP 200 sozinha ou uma página de login não confirmam gravação. Falhas mantêm o formulário aberto, sem conversão nem redirecionamento. Reenvios do mesmo cadastro usam o mesmo `lead_id`; o receptor deve deduplicar por esse campo para tratar uma gravação cuja resposta tenha sido perdida.

Somente após confirmação, a página dispara Google Ads `AW-10997322849/_CztCI6UpqEYEOGo9_so`, Meta Pixel `6801275603262673` com evento `Lead` e evento `lead_form_success` no dataLayer. Depois abre o WhatsApp original com nome e produto na mensagem. Identificadores ficam em `public/lead-config.js`. O GTM antigo não é carregado para evitar duplicação com suas regras anteriores de clique no WhatsApp. A conversão Google usa `transaction_id` e a Meta usa `eventID`, ambos iguais a `lead_id`. Bloqueadores, falta de rede e configurações das plataformas podem impedir a entrega da medição; a navegação não depende da confirmação das plataformas de anúncios.

`integrations/google-apps-script.gs` contém um receptor compatível com gravação e deduplicação em planilha. É um exemplo pronto para instalar manualmente, caso o script do webhook atual não aceite o contrato acima. Ele não foi aplicado ao Google por este projeto. Faça uma cópia da planilha e verifique os cabeçalhos antes de instalar em uma planilha com outro formato. Publique como proprietário, com acesso para qualquer pessoa, e atualize a versão da implantação existente para preservar o endereço `/exec`.

Os testes do servidor usam um webhook simulado. Os testes de navegador simulam falha, reenvio e sucesso, verificando a captura de UTMs, os eventos de conversão e a navegação sem enviar leads reais ou eventos às plataformas. O teste real do webhook ficou bloqueado pela política de rede do ambiente (HTTP 403 no túnel do proxy); a permissão de saída para `script.google.com` e `script.googleusercontent.com` foi salva no rascunho do ambiente. A gravação na planilha real e a entrega de eventos nas contas de anúncios ainda precisam de validação com acesso externo.
