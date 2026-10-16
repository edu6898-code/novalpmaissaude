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

Entre na conta Cloudflare que receberá o Worker. `wrangler.jsonc` configura o nome `novalpmaissaude` e publica os arquivos de `public/` usando Workers Static Assets. Se necessário, ajuste o nome antes de publicar. Para domínio próprio, configure um Custom Domain no Worker pelo painel da Cloudflare após o deploy.

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
- Integrações antigas de Google Ads, Tag Manager, Meta Pixel e Cloudflare Analytics foram removidas da página. Para medir campanhas, configure os identificadores da conta responsável pela nova publicação.
- O bloco de exemplo `Code is Poetry` e o rodapé presentes no HTML original foram preservados, conforme o pedido de reprodução fiel.

O conteúdo principal é `public/index.html`; os estilos específicos da página estão em `public/wp-content/uploads/elementor/css/post-17.css`.

Para repetir a importação a partir do ZIP extraído:

```sh
node scripts/import-original.mjs /caminho/da/pasta-extraida
```

A importação lê o arquivo como referência; não executa o JavaScript do ZIP. Arquivos de terceiros mantêm seus avisos de licença. As fontes têm licenças OFL e o Font Awesome mantém suas licenças em `public/licenses/`.

A publicação na conta Cloudflare não foi realizada nesta entrega.
