#!/usr/bin/env node
// Opt-in Node CLI. Dedicated Chromium context, explicit origins, no unattended approvals.
// KUMO_ALLOWED_ORIGINS=http://127.0.0.1:4173 KUMO_EXPECT_TEXT='搜索结果' \
// KUMO_LLM_ENDPOINT=... KUMO_LLM_MODEL=... KUMO_LLM_API_KEY=... \
//   node scripts/run-browser-agent.mjs http://127.0.0.1:4173 '搜索 agent 实例' '#sandbox'
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { chromium } from 'playwright';
import { PlaywrightPagePort } from '../dist/packages/playwright-runtime/src/playwright-page.js';
import { OpenAICompatibleModel } from '../dist/packages/llm-client/src/openai-compatible.js';
import { LlmPlanner } from '../dist/packages/agent-core/src/llm-planner.js';
import { SandboxActionPolicy } from '../dist/packages/agent-core/src/action-policy.js';
import { runAgent } from '../dist/packages/agent-core/src/run-agent.js';

const [url, task, rootSelector = 'body'] = process.argv.slice(2);
const allowedOrigins = (process.env.KUMO_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
const expectedText = process.env.KUMO_EXPECT_TEXT?.trim();
if (!url || !task || !allowedOrigins.length || !expectedText) {
  console.error('Usage: KUMO_ALLOWED_ORIGINS="https://site.example" KUMO_EXPECT_TEXT="expected visible result" KUMO_LLM_ENDPOINT=... KUMO_LLM_MODEL=... KUMO_LLM_API_KEY=... node scripts/run-browser-agent.mjs <url> <task> [rootSelector]');
  process.exitCode = 2;
} else {
  let browser;
  let runtime;
  const cancellation = new AbortController();
  const abort = () => cancellation.abort();
  process.once('SIGINT', abort);
  try {
    const model = new OpenAICompatibleModel({
      endpoint: process.env.KUMO_LLM_ENDPOINT ?? '',
      model: process.env.KUMO_LLM_MODEL ?? '',
      apiKey: process.env.KUMO_LLM_API_KEY ?? ''
    });
    const driverSource = await readFile(resolve(import.meta.dirname, '../dist/browser-dom-driver.js'), 'utf8');
    browser = await chromium.launch({ headless: true, ...(process.env.KUMO_CHROMIUM_EXECUTABLE ? { executablePath: process.env.KUMO_CHROMIUM_EXECUTABLE } : {}) });
    const context = await browser.newContext({ serviceWorkers: 'block', permissions: [], acceptDownloads: false });
    const page = await context.newPage();
    runtime = new PlaywrightPagePort(page, { allowedOrigins, rootSelector, driverSource });
    await runtime.start();
    await runtime.navigate(url);
    const result = await runAgent(task, runtime, new LlmPlanner(model), {
      signal: cancellation.signal,
      maxTurns: 12,
      actionPolicy: new SandboxActionPolicy(),
      taskVerifier: {
        verify(_task, snapshot) {
          return snapshot.text.includes(expectedText)
            ? { status: 'passed', reason: `页面包含预期文本：${expectedText}` }
            : { status: 'rejected', reason: '未找到预期结果文本' };
        }
      },
      async requestApproval(assessment, action, snapshot, signal) {
        if (!process.stdin.isTTY || signal?.aborted) return false;
        const reader = createInterface({ input: process.stdin, output: process.stdout });
        try {
          console.log(JSON.stringify({ reason: assessment.reason, action, url: snapshot.url }, null, 2));
          const response = await reader.question('Approve this exact action? type YES: ', { signal });
          return response === 'YES' && !signal?.aborted;
        } finally { reader.close(); }
      },
      onTrace: trace => console.log(JSON.stringify({ turn: trace.turn, decision: trace.decision, result: trace.actionResult, proof: trace.actionVerification ?? trace.taskVerification, error: trace.error }))
    });
    console.log(JSON.stringify({ status: result.status, reason: result.reason, turns: result.history.length }, null, 2));
    if (result.status !== 'completed') process.exitCode = 1;
  } catch (error) {
    console.error(`Browser run failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', abort);
    await runtime?.dispose().catch(() => {});
    await browser?.close().catch(() => {});
  }
}
