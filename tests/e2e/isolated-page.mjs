import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Restricted sandboxes may block even localhost in Chromium. Only used when
// KUMO_E2E_ISOLATED=1; CI always runs against the real HTTP server.
export async function loadIsolatedPage(page, root) {
  const dist = resolve(root, 'dist/apps/playground/src/main.js');
  const cache = new Map();
  async function moduleUrl(file) {
    if (cache.has(file)) return cache.get(file);
    const source = await readFile(file, 'utf8');
    const pattern = /\bfrom\s+(['"])(\.{1,2}\/[^'"]+\.js)\1/g;
    const imports = [...source.matchAll(pattern)];
    let code = source;
    for (const match of imports) {
      const nested = await moduleUrl(resolve(dirname(file), match[2]));
      code = code.replace(match[0], `from '${nested}'`);
    }
    const value = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    cache.set(file, value);
    return value;
  }
  const js = await moduleUrl(dist);
  const html = await readFile(resolve(root, 'apps/playground/index.html'), 'utf8');
  const css = await readFile(resolve(root, 'apps/playground/styles.css'), 'utf8');
  const embedded = html
    .replace(/<link rel="stylesheet"[^>]+>/, `<style>${css}</style>`)
    .replace(/<script type="module"[^>]+><\/script>/, `<script type="module">import '${js}'</script>`);
  await page.goto('about:blank');
  await page.setContent(embedded, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#snapshot')?.textContent?.includes('Snapshot #'));
}
