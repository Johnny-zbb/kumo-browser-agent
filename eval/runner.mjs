import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { PlaywrightPagePort } from '../dist/packages/playwright-runtime/src/playwright-page.js';
import { LlmPlanner } from '../dist/packages/agent-core/src/llm-planner.js';
import { OpenAICompatibleModel } from '../dist/packages/llm-client/src/openai-compatible.js';
import { SandboxActionPolicy } from '../dist/packages/agent-core/src/action-policy.js';
import { runAgent } from '../dist/packages/agent-core/src/run-agent.js';
import { EVAL_CASES, fixtureHtml, getEvalCase, createBaselinePlanner } from './fixtures.mjs';
import { classifyFailure, summarizeEvaluation } from './report.mjs';

async function startFixtureServer() {
  const server = createServer((req, res) => {
    let path;
    try { path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname; }
    catch { res.writeHead(400); res.end(); return; }
    const item = path.startsWith('/case/') ? getEvalCase(path.slice('/case/'.length)) : undefined;
    if (req.method !== 'GET' || !item) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(fixtureHtml(item));
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((ok, fail) => server.close(error => error ? fail(error) : ok())) };
}

/** Only synthetic, explicitly authorized pages. An evaluation never approves risky actions. */
export async function evaluateBrowserAgent({ mode = 'baseline', cases = EVAL_CASES, isolated = false, maxTurns = 8, modelConfig = null, decisionModel = null, chromiumExecutable = process.env.KUMO_CHROMIUM_EXECUTABLE } = {}) {
  if (!['baseline', 'llm'].includes(mode)) throw new Error('eval_invalid_mode');
  if (!Array.isArray(cases) || !cases.length || cases.some(item => !getEvalCase(item?.id))) throw new Error('eval_invalid_cases');
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 30) throw new Error('eval_invalid_max_turns');
  // Require full credentials for real-model mode; no fallback to a fake model.
  if (mode === 'llm' && !decisionModel && (!modelConfig?.endpoint || !modelConfig?.model || !modelConfig?.apiKey)) throw new Error('eval_llm_not_configured');
  const startedAt = new Date().toISOString();
  const model = mode === 'llm' ? (decisionModel ?? new OpenAICompatibleModel(modelConfig)) : null;
  const driverSource = await readFile(resolve(import.meta.dirname, '../dist/browser-dom-driver.js'), 'utf8');
  const fixtureServer = await startFixtureServer();
  let browser;
  const records = [];
  try {
    browser = await chromium.launch({ headless: true, ...(chromiumExecutable ? { executablePath: chromiumExecutable } : {}) });
    for (const item of cases) {
      const started = performance.now();
      let runtime;
      let context;
      let modelCalls = 0;
      let result;
      let verified = false;
      let error;
      const pageErrors = [];
      try {
        context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [] });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        page.on('pageerror', err => pageErrors.push(err.message));
        runtime = new PlaywrightPagePort(page, {
          allowedOrigins: [fixtureServer.origin], rootSelector: '#workspace', driverSource,
          ...(isolated ? { testAllowInitialBlank: true } : {})
        });
        await runtime.start();
        if (isolated) await page.setContent(fixtureHtml(item));
        else await runtime.navigate(`${fixtureServer.origin}/case/${encodeURIComponent(item.id)}`);
        const planner = mode === 'baseline'
          ? createBaselinePlanner(item)
          : new LlmPlanner({ complete(input) { modelCalls++; return model.complete(input); } });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);
        try {
          result = await runAgent(item.task, runtime, planner, {
            maxTurns,
            signal: controller.signal,
            actionPolicy: new SandboxActionPolicy(),
            taskVerifier: { async verify(_task, snapshot) {
              const state = await page.locator('[data-eval-result]').getAttribute('data-state');
              return state === item.id && snapshot.text.includes(`完成：${item.id}`)
                ? { status: 'passed', reason: '独立页面状态与语义观察一致' }
                : { status: 'rejected', reason: '独立验证未发现目标完成状态' };
            } }
            // Deliberately no requestApproval: the benchmark cannot authorize state-changing actions.
          });
        } finally { clearTimeout(timeout); }
        verified = (await page.locator('[data-eval-result]').getAttribute('data-state')) === item.id;
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      } finally {
        await runtime?.dispose().catch(() => {});
        await context?.close().catch(() => {});
      }
      const passed = !error && pageErrors.length === 0 && result?.status === 'completed' && verified;
      const status = result?.status ?? 'failed';
      const reason = (error ?? (pageErrors.length ? 'browser_page_error' : result?.reason ?? 'missing_run_result')).slice(0, 240);
      records.push({
        caseId: item.id,
        category: item.category,
        passed,
        runStatus: status,
        failureKind: passed ? null : (pageErrors.length ? 'browser_page_error' : classifyFailure({ status, reason, error })),
        reason,
        turns: result?.history.length ?? 0,
        modelCalls,
        latencyMs: Math.round(performance.now() - started),
        actions: result?.history.filter(trace => trace.decision.kind === 'act').map(trace => ({
          kind: trace.decision.action.kind, dispatch: trace.actionResult, effect: trace.actionVerification?.status ?? null
        })) ?? []
      });
    }
  } finally {
    await browser?.close().catch(() => {});
    await fixtureServer.close();
  }
  return summarizeEvaluation({ mode, model: decisionModel ? 'synthetic-model' : modelConfig?.model, records, startedAt });
}
