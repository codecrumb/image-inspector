// Builds dist/: the hosted site (hashed assets) and image-inspector.html (everything inlined, works offline).
import { build, transform } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const p = (...a) => join(root, ...a);
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

async function bundle(entry, define, extra = {}) {
  const r = await build({ entryPoints: [p(entry)], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, logLevel: 'warning', define, ...extra });
  return r.outputFiles[0].text;
}

async function buildAll() {
  rmSync(p('dist'), { recursive: true, force: true });
  mkdirSync(p('dist'), { recursive: true });
  cpSync(p('public'), p('dist'), { recursive: true });

  // CSS: Tailwind (scans src/) + hand-written styles
  const tw = execFileSync(p('node_modules/.bin/tailwindcss'), ['-i', p('src/tailwind.css'), '--minify'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const custom = (await transform(readFileSync(p('src/styles.css'), 'utf8'), { loader: 'css', minify: true })).code;
  const css = tw + custom;

  // Lazy HEIC decoder: its own script plus the wasm, both hashed; kept out of the main bundle and the standalone page
  const wasm = readFileSync(p('node_modules/libheif-js/libheif-wasm/libheif.wasm'));
  const wasmName = `heic.${hash(wasm)}.wasm`;
  const dec = await bundle('src/js/heic-decoder.js', { __HEIC_WASM__: JSON.stringify(wasmName) }, { platform: 'browser', external: ['fs', 'path', 'crypto'] });
  const heicName = `heic-decoder.${hash(dec)}.js`;
  writeFileSync(p('dist', wasmName), wasm);
  writeFileSync(p('dist', heicName), dec);

  // JS: one classic-script bundle (exifr included); the standalone copy has no decoder to load
  const js = await bundle('src/js/main.js', { __HEIC_JS__: JSON.stringify(heicName) });
  const jsStandalone = await bundle('src/js/main.js', { __HEIC_JS__: 'null' });

  const template = readFileSync(p('src/index.html'), 'utf8');
  const fill = (vars) => Object.entries(vars).reduce((html, [k, v]) => html.replace(`{{${k}}}`, () => v), template);

  // Hosted site
  const cssName = `app.${hash(css)}.css`, jsName = `app.${hash(js)}.js`;
  writeFileSync(p('dist', cssName), css);
  writeFileSync(p('dist', jsName), js);
  const iconLinks = [
    '<link rel="icon" href="favicon.ico" sizes="any" />',
    '<link rel="icon" href="favicon.svg" type="image/svg+xml" />',
    '<link rel="icon" type="image/png" sizes="16x16" href="favicon-16.png" />',
    '<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />',
    '<link rel="icon" type="image/png" sizes="96x96" href="favicon-96x96.png" />',
    '<link rel="apple-touch-icon" href="apple-touch-icon.png" />',
    '<link rel="manifest" href="site.webmanifest" />',
  ].join('\n  ');
  writeFileSync(p('dist/index.html'), fill({
    HEAD_LINKS: `${iconLinks}\n  <link rel="preload" href="${cssName}" as="style" />\n  <link rel="stylesheet" href="${cssName}" />`,
    CSS: '',
    FOOTER: '<footer class="mt-6 text-xs text-gray-400 dark:text-gray-500 text-center"><a href="image-inspector.html" download="image-inspector.html" class="underline hover:text-gray-600 dark:hover:text-gray-300">Download the full page</a> to use it offline. <a href="licenses.txt" class="underline hover:text-gray-600 dark:hover:text-gray-300">Licenses</a></footer>',
    JS: `<script src="${jsName}" defer></script>`,
  }));

  // Standalone page: no network assets, no Lens (it needs an upload service)
  const icon = `data:image/png;base64,${readFileSync(p('public/favicon-32.png')).toString('base64')}`;
  writeFileSync(p('dist/image-inspector.html'), fill({
    HEAD_LINKS: `<link rel="icon" type="image/png" href="${icon}" />`,
    CSS: `<style>${css}</style>\n  <style>#lensBtn{display:none!important}</style>`,
    FOOTER: '<footer class="mt-6 text-xs text-gray-400 dark:text-gray-500 text-center">Offline copy. Everything runs in your browser.</footer>',
    JS: `<script>${jsStandalone.replaceAll('</script', '<\\/script')}</script>`,
  }));
  console.log(`built dist/ (${cssName}, ${jsName}, ${heicName}, ${wasmName}, image-inspector.html)`);
}

await buildAll();

if (process.argv.includes('--serve')) {
  let timer;
  const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => buildAll().catch(console.error), 100); };
  for (const dir of ['src', 'public', 'vendor']) watch(p(dir), { recursive: true }, rebuild);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm' };
  const port = Number(process.env.PORT) || 8000;
  createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = p('dist', path);
    if (!file.startsWith(p('dist')) || !existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  }).listen(port, '0.0.0.0', () => console.log(`serving dist/ on http://localhost:${port}`));
}
