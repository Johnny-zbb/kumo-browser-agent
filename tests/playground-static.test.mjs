import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLocalPlaygroundHost, servePlaygroundAsset } from '../scripts/playground-static.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kumo-static-'));
  const write = async (path, contents) => {
    const location = join(root, path);
    await mkdir(join(location, '..'), { recursive: true });
    await writeFile(location, contents);
  };
  await write('apps/playground/index.html', '<title>Kumo</title>');
  await write('apps/playground/styles.css', 'body { color: black }');
  await write('dist/apps/playground/src/main.js', 'export const app = 1;');
  await write('dist/packages/dom-engine/src/adapters/aria-select.js', 'export const adapter = 1;');
  await write('dist/packages/llm-client/src/openai-compatible.js', 'export const token = 1;');
  await write('dist/apps/playground/src/not-a-module.json', '{"token":"sample"}');
  await write('.env', 'KUMO_LLM_API_KEY=do-not-serve');
  await write('node_modules/example/index.js', 'secret-package-code');
  await write('scripts/local-agent-bridge.mjs', 'server-only');
  await symlink(join(root, '.env'), join(root, 'dist/apps/playground/src/leak.js'));
  const server = createServer((req, res) => void servePlaygroundAsset(req, res, { root, port: server.address().port }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    root,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
  };
}

test('serves only the public playground and compiled browser modules', async () => {
  const site = await fixture();
  try {
    for (const path of ['/', '/apps/playground/index.html', '/apps/playground/styles.css', '/dist/apps/playground/src/main.js', '/dist/packages/dom-engine/src/adapters/aria-select.js']) {
      const response = await fetch(site.origin + path);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    }
    assert.equal((await fetch(site.origin + '/dist/apps/playground/src/main.js', { method: 'HEAD' })).status, 200);
  } finally { await site.close(); }
});

test('does not expose .env, server code, deps, unapproved modules, or symlinks', async () => {
  const site = await fixture();
  try {
    const hidden = ['/.env', '/%2eenv', '/scripts/local-agent-bridge.mjs', '/node_modules/example/index.js', '/dist/packages/llm-client/src/openai-compatible.js', '/dist/apps/playground/src/not-a-module.json', '/dist/apps/playground/src/leak.js', '/tests/playground-static.test.mjs'];
    for (const path of hidden) {
      const response = await fetch(site.origin + path);
      assert.ok([403, 404].includes(response.status), `${path}: ${response.status}`);
      assert.ok(!(await response.text()).includes('do-not-serve'), path);
    }
    const blockedHost = await new Promise((resolve, reject) => {
      const request = httpRequest(site.origin, { headers: { Host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(blockedHost, 403);
    const blockedOrigin = await fetch(site.origin, { headers: { Origin: 'https://attacker.example' } });
    assert.equal(blockedOrigin.status, 403);
    assert.equal((await fetch(site.origin, { method: 'POST' })).status, 405);
  } finally { await site.close(); }
});

test('host verifier rejects DNS-rebinding Host values and unexpected ports', () => {
  assert.equal(isLocalPlaygroundHost('localhost:4173', 4173), true);
  assert.equal(isLocalPlaygroundHost('127.0.0.1:4173', 4173), true);
  assert.equal(isLocalPlaygroundHost('evil.example:4173', 4173), false);
  assert.equal(isLocalPlaygroundHost('localhost:8080', 4173), false);
  assert.equal(isLocalPlaygroundHost('localhost:4173@evil.example:4173', 4173), false);
});
