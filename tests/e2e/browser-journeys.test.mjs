import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadIsolatedPage } from './isolated-page.mjs';

// Real browser journeys on the compiled, locally-served application.
// This is intentionally independent from agent-core and the demonstration planner.
const root = resolve(import.meta.dirname, '../..');
const port = 15000 + Math.floor(Math.random() * 15000);
const baseURL = `http://127.0.0.1:${port}`;
const evidenceDir = resolve(root, 'test-results/e2e');
let browser;
let server;
let serverOutput = '';

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Playground server stopped: ${serverOutput}`);
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch { /* Startup in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 90));
  }
  throw new Error(`Playground server was not ready: ${serverOutput}`);
}

before(async () => {
  server = spawn(process.execPath, ['scripts/dev-server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.KUMO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.KUMO_CHROMIUM_EXECUTABLE } : {})
  });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) server.kill('SIGTERM');
});

async function scenario(t, name, perform) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    if (process.env.KUMO_E2E_ISOLATED === '1') {
      await loadIsolatedPage(page, root);
    } else {
      await page.goto(baseURL);
    }
    await perform(page);
    assert.deepEqual(pageErrors, [], 'browser page errors');
  } catch (error) {
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: resolve(evidenceDir, `${name}.png`), fullPage: true }).catch(() => {});
    await import('node:fs/promises').then(fs => fs.writeFile(resolve(evidenceDir, `${name}.txt`), [String(error), ...pageErrors].join('\n')));
    throw error;
  } finally {
    await context.close();
  }
}

async function runTask(page, taskText) {
  await page.locator('#task').fill(taskText);
  await page.locator('#run').click();
  await page.waitForFunction(() => /^(COMPLETED|FAILED|STOPPED|MAX_TURNS|ERROR)/.test(document.querySelector('#status')?.textContent ?? ''), undefined, { timeout: 15000 });
  return page.locator('#status').textContent();
}

test('change custom region through the Agent, verify re-observation and trace', async t => {
  await scenario(t, 'region-select', async page => {
    assert.match(await runTask(page, '将区域切换为华东-上海一'), /COMPLETED/);
    assert.equal(await page.locator('#region-select').getAttribute('aria-valuetext'), '华东-上海一');
    assert.match(await page.locator('#region-feedback').innerText(), /华东-上海一/);
    await page.locator('#inspector-toggle').click();
    assert.match(await page.locator('#timeline').innerText(), /selectOption/);
    await page.locator('#tab-snapshot').click();
    assert.match(await page.locator('#snapshot').innerText(), /华东-上海一/);
  });
});

test('search task filters resource rows in the real DOM', async t => {
  await scenario(t, 'search', async page => {
    assert.match(await runTask(page, '搜索 agent 实例'), /COMPLETED/);
    assert.match(await page.locator('#search-result').innerText(), /筛选结果：agent/);
    assert.equal(await page.locator('.resource-row:visible').count(), 2);
  });
});

test('creation task opens a dialog, types and confirms', async t => {
  await scenario(t, 'create', async page => {
    assert.match(await runTask(page, '创建一个实例'), /COMPLETED/);
    assert.match(await page.locator('#create-feedback').innerText(), /已创建实例：kumo-demo/);
    assert.equal(await page.locator('.resource-row').first().innerText(), 'ECS · kumo-demo · running · ID-4');
  });
});

test('scroll task reaches the end of the controlled scroll container', async t => {
  await scenario(t, 'scroll', async page => {
    assert.match(await runTask(page, '滚动页面到底部'), /COMPLETED/);
    assert.equal(await page.locator('#sandbox').evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 3), true);
  });
});

test('stop during the circular entry exits Agent Mode without executing', async t => {
  await scenario(t, 'early-stop', async page => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#run').click();
    await page.locator('#run').click();
    await page.waitForFunction(() => document.querySelector('#run')?.textContent?.includes('启动 Agent'));
    assert.equal(await page.locator('#browser-stage').evaluate(el => el.classList.contains('agent-active')), false);
    assert.match(await page.locator('#status').innerText(), /STOPPED/);
  });
});
