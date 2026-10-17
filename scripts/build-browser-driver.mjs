#!/usr/bin/env node
// Compile a browser-injected driver from the SAME compiled DOM Engine modules.
// Avoid a second, divergent DOM implementation or runtime network imports.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const parts = [
  'dist/packages/dom-engine/src/snapshot/build-tree.js',
  'dist/packages/dom-engine/src/component-adapters.js',
  'dist/packages/dom-engine/src/adapters/aria-select.js',
  'dist/packages/dom-engine/src/browser-dom-page.js'
];
let code = '';
for (const path of parts) {
  const input = await readFile(resolve(root, path), 'utf8');
  // Compiled internal modules only; reject unexpected imports/exports rather than
  // silently emitting an incomplete bundle if the DOM Engine changes.
  let source = input.replace(/^import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  if (/^\s*import\b/m.test(source)) throw new Error(`unexpected_driver_import:${path}`);
  source = source.replace(/^export\s+(?=(class|function|const)\b)/gm, '');
  if (/^\s*export\b/m.test(source)) throw new Error(`unexpected_driver_export:${path}`);
  code += `\n// From ${path}\n${source}\n`;
}
const wrapper = `// Generated from compiled DOM Engine; do not edit by hand.\n(() => {\n${code}\nconst state = { root: null, driver: null, snapshot: null, selector: null };\nconst current = selector => {\n  const root = document.querySelector(selector);\n  if (!(root instanceof HTMLElement)) throw new Error('authorized_root_missing');\n  if (!state.driver || state.root !== root || state.selector !== selector) {\n    state.driver = new BrowserDomPage(root, [ariaSelectAdapter]);\n    state.root = root; state.selector = selector; state.snapshot = null;\n  }\n  return state.driver;\n};\nObject.defineProperty(globalThis, '__kumoBrowserDriver', { configurable: true, value: {\n  async observe(selector) { state.snapshot = await current(selector).observe(); return state.snapshot; },\n  async execute(selector, action) { const driver = current(selector); if (!state.snapshot) throw new Error('stale_snapshot'); await driver.execute(action, state.snapshot); },\n  async settle(selector) { await current(selector).settle(); }\n} });\n})();\n`;
const dest = resolve(root, 'dist/browser-dom-driver.js');
await mkdir(dirname(dest), { recursive: true });
await writeFile(dest, wrapper, 'utf8');
