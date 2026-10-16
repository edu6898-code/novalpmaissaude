// Usage: node scripts/import-original.mjs /path/to/extracted-zip
// The archive is reference material only; none of its scripts run during import.
import { load } from 'cheerio';
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
const root = process.argv[2];
if (!root) throw new Error('Pass the extracted archive directory.');
const site = path.join(root, 'maissaudehospitalar.com');
const out = path.resolve('public');
await mkdir(out, { recursive: true });
for (const dir of ['wp-content', 'wp-includes']) {
  await cp(path.join(site, dir), path.join(out, dir), {
    recursive: true,
    filter: (src) => !src.includes('/pixelyoursite/') && !src.includes('/jeg-dynamic-styles.css'),
  });
}
await cp(path.join(root, 'cdnjs.cloudflare.com'), path.join(out, 'vendor/cdnjs'), { recursive: true });
const $ = load(await readFile(path.join(site, 'index.html'), 'utf8'));
$('script').each((_, el) => {
  const node = $(el), id = node.attr('id') || '', src = node.attr('src') || '';
  const keep = /^(elementor-|pro-elements-|jkit-sticky-|hello-theme-|jquery-core-|jquery-migrate-|jquery-ui-core-|font-awesome-4-shim-|prismjs_)/.test(id);
  if (!keep) node.remove();
});
$('noscript').remove();
$('link').each((_, el) => {
  const node = $(el), href = node.attr('href') || '';
  if (/fonts\.google|fonts\.gstatic|jeg-dynamic-styles/.test(href) || ['alternate', 'EditURI', 'wlwmanifest', 'shortlink', 'https://api.w.org/', 'profile'].includes(node.attr('rel'))) node.remove();
});
$('meta[name="generator"]').remove();
// Resolve srcset against the image bytes actually included in the export.
$('img').each((_, el) => {
  const node = $(el);
  const candidates = [node.attr('src'), ...(node.attr('srcset') || '').split(',').map(v => v.trim().split(/\s+/)[0])].filter(Boolean);
  node.attr('data-candidates', JSON.stringify(candidates));
  node.removeAttr('srcset sizes');
});
const { existsSync } = await import('node:fs');
$('img').each((_, el) => {
  const node = $(el), candidates = JSON.parse(node.attr('data-candidates'));
  const found = candidates.find(url => {
    try { return existsSync(path.join(site, new URL(url).pathname)); } catch { return false; }
  });
  if (!found) throw new Error(`Missing image: ${candidates.join(', ')}`);
  node.attr('src', new URL(found).pathname).removeAttr('data-candidates');
});
$('[href]').each((_, el) => {
  const node = $(el), href = node.attr('href');
  if (href.startsWith('https://wa.me//')) node.attr('href', href.replace('wa.me//', 'wa.me/'));
  if (href === 'https://maissaudehospitalar.com/') node.attr('href', '/');
});
let html = $.html()
  .replaceAll('https://maissaudehospitalar.com/', '/')
  .replaceAll('https:\\/\\/maissaudehospitalar.com\\/', '\\/')
  .replaceAll('https://cdnjs.cloudflare.com/', '/vendor/cdnjs/');
html = html.replace('</head>', '<link rel="stylesheet" href="/fonts/fonts.css">\n<link rel="stylesheet" href="/lead-form.css">\n<script defer src="/lead-config.js"></script>\n<script defer src="/lead-form.js"></script>\n</head>');
await writeFile(path.join(out, 'index.html'), html);
await mkdir(path.join(out, 'fonts'), { recursive: true });
let fontCSS = '';
for (const [pkg, family, weights] of [
  ['poppins', 'Poppins', [100,200,300,400,500,600,700,800,900]],
  ['hind-siliguri', 'Hind Siliguri', [300,400,500,600,700]],
]) {
  for (const weight of weights) {
    for (const subset of ['latin', 'latin-ext']) {
      const file = `${pkg}-${subset}-${weight}-normal.woff2`;
      const src = `node_modules/@fontsource/${pkg}/files/${file}`;
      if (!existsSync(src)) continue;
      await cp(src, path.join(out, 'fonts', file));
    }
    const css = await readFile(`node_modules/@fontsource/${pkg}/${weight}.css`, 'utf8');
    // Latin contains Portuguese; keep full Latin ranges provided by fontsource.
    fontCSS += css.split(/(?=\/\*)/).filter(block => (/\/\* [a-z-]+-latin(?:-ext)?-/.test(block)) && block.includes('@font-face'))
      .join('\n').replaceAll('./files/', '/fonts/').replace(/, url\([^)]*\.woff\) format\('woff'\)/g, '');
  }
}
await writeFile(path.join(out, 'fonts/fonts.css'), fontCSS);
const fa = path.join(out, 'wp-content/plugins/elementor/assets/lib/font-awesome/webfonts');
await mkdir(fa, { recursive: true });
for (const file of await readdir('node_modules/@fortawesome/fontawesome-free/webfonts'))
  await cp(`node_modules/@fortawesome/fontawesome-free/webfonts/${file}`, path.join(fa, file));
console.log('Imported original markup, styles, images and local fonts.');
// The export's formatter inserted spaces into optional chaining operators.
// Repair that syntax without changing the original plugin behavior.
async function repairScripts(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await repairScripts(file);
    else if (entry.name.endsWith('.js')) {
      const js = await readFile(file, 'utf8');
      await writeFile(file, js.replace(/\?\s+\.(?=[A-Za-z_$\[(])/g, '?.').replaceAll('https://cdnjs.cloudflare.com/', '/vendor/cdnjs/'));
    }
  }
}
await repairScripts(out);
