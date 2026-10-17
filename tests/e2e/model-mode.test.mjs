import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function createMockModel() {
  let requests = 0;
  let leakedKey = false;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    assert.equal(req.headers.authorization, 'Bearer local-test-token');
    requests++;
    let buffer = '';
    for await (const part of req) buffer += part;
    const data = JSON.parse(buffer);
    const state = JSON.parse(data.messages[1].content);
    if (JSON.stringify(state).includes('local-test-token')) leakedKey = true;
    const nodes = state.page.targets;
    const find = name => nodes.find(x => x.name.includes(name) && !x.disabled);
    const act = (action, reason = '模型选择操作') => ({ kind: 'act', reason, action });
    let decision;
    if (state.task.includes('上海')) {
      const combo = find('区域');
      decision = combo.value === '华东-上海一'
        ? { kind: 'done', reason: '区域已切换' }
        : act({ kind: 'selectOption', ref: combo.ref, value: '华东-上海一' });
    } else if (state.task.includes('创建')) {
      if (state.page.text.includes('已创建实例：kumo-demo')) {
        decision = { kind: 'done', reason: '创建成功' };
      } else if (find('实例名称') && find('实例名称').value !== 'kumo-demo') {
        decision = act({ kind: 'input', ref: find('实例名称').ref, value: 'kumo-demo' });
      } else if (find('确认创建')) {
        decision = act({ kind: 'click', ref: find('确认创建').ref });
      } else {
        decision = act({ kind: 'click', ref: find('新建实例').ref });
      }
    } else {
      decision = { kind: 'fail', reason: 'unsupported' };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(decision) } }] }));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port;
  return { port, count: () => requests, leaked: () => leakedKey, close: () => new Promise(resolve => server.close(resolve)) };
}
async function waitForHttp(base, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Playground server exited before HTTP was available');
    try { if ((await fetch(base)).ok) return; } catch {}
    await sleep(90);
  }
  throw new Error('Timed out waiting for Playground server');
}
test('LLM mode is served only by local Node bridge; user approves state-changing clicks', async t => {
  if (process.env.KUMO_E2E_ISOLATED === '1') { t.skip('HTTP bridge requires localhost Chromium navigation; CI runs real HTTP'); return; }
  const mock = await createMockModel();
  let nodeServer;
  let browser;
  try {
    const port = 23000 + Math.floor(Math.random() * 10000);
    nodeServer = spawn(process.execPath, ['scripts/dev-server.mjs'], {
      cwd: root,
      env: { ...process.env, PORT: String(port), KUMO_LLM_ENDPOINT: `http://127.0.0.1:${mock.port}/v1/chat/completions`, KUMO_LLM_MODEL: 'test-model', KUMO_LLM_API_KEY: 'local-test-token' },
      stdio: 'ignore'
    });
    const base = `http://127.0.0.1:${port}`;
    await waitForHttp(base, nodeServer);
    const configuration = await (await fetch(base + '/api/agent/config')).json();
    assert.deepEqual(configuration, { llmConfigured: true });
    assert.ok(!JSON.stringify(configuration).includes('local-test-token'));
    browser = await chromium.launch({headless:true,...(process.env.KUMO_CHROMIUM_EXECUTABLE?{executablePath:process.env.KUMO_CHROMIUM_EXECUTABLE}:{})});
    const page = await browser.newPage({reducedMotion:'reduce'});
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.locator('#inspector-toggle').click();
    await page.waitForFunction(() => !document.querySelector('#planner-mode option[value="llm"]')?.disabled);
    await page.locator('#planner-mode').selectOption('llm');
    await page.locator('#inspector-close').click();
    await page.locator('#task').fill('将区域切换为华东-上海一');
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('COMPLETED'));
    assert.equal(await page.locator('#region-select').getAttribute('aria-valuetext'),'华东-上海一');
    await page.locator('#task').fill('创建一个实例');
    await page.locator('#run').click();
    await page.locator('#agent-approval:not([hidden])').waitFor();
    assert.equal(await page.locator('#create-dialog').isVisible(),false);
    await page.locator('#approve-action').click();
    await page.locator('#agent-approval:not([hidden])').waitFor();
    await page.locator('#approve-action').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent?.startsWith('COMPLETED'));
    assert.match(await page.locator('#create-feedback').innerText(),/已创建实例：kumo-demo/);
    assert.ok(mock.count() >= 6);
    assert.equal(mock.leaked(),false);
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close();
    if (nodeServer && nodeServer.exitCode === null) nodeServer.kill('SIGTERM');
    await mock.close();
  }
});
