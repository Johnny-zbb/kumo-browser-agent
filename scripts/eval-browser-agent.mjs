#!/usr/bin/env node
// Run only synthetic, localhost fixtures. Real provider calls are explicit, opt-in and keyless in reports.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { EVAL_CASES } from '../eval/fixtures.mjs';
import { evaluateBrowserAgent } from '../eval/runner.mjs';

function parseArgs(args) {
  const allowed = new Set(['mode', 'cases', 'limit', 'max-turns', 'report', 'isolated']);
  const options = {};
  for (const raw of args) {
    if (!raw.startsWith('--') || !raw.includes('=')) throw new Error(`eval_invalid_argument:${raw}`);
    const [key, ...values] = raw.slice(2).split('=');
    if (!allowed.has(key) || key in options) throw new Error(`eval_invalid_argument:${key}`);
    options[key] = values.join('=');
  }
  const mode = options.mode ?? 'baseline';
  if (!['baseline', 'llm'].includes(mode)) throw new Error('eval_invalid_mode');
  if (options.isolated !== undefined && !['true', 'false'].includes(options.isolated)) throw new Error('eval_invalid_isolated');
  const maxTurns = options['max-turns'] === undefined ? 8 : Number(options['max-turns']);
  const limit = options.limit === undefined ? (mode === 'llm' ? 4 : EVAL_CASES.length) : Number(options.limit);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 30 || !Number.isInteger(limit) || limit < 1 || limit > EVAL_CASES.length) throw new Error('eval_invalid_budget');
  // First four real-LLM cases cover different skills rather than four nearly identical searches.
  const caseOrder = mode === 'llm'
    ? [...['search', 'details', 'tab', 'dialog'].map(category => EVAL_CASES.find(item => item.category === category).id),
      ...EVAL_CASES.filter(item => !['search-agent', 'details-agent', 'tab-logs', 'dialog-network'].includes(item.id)).map(item => item.id)]
    : EVAL_CASES.map(item => item.id);
  const selected = options.cases ? options.cases.split(',') : caseOrder;
  if (new Set(selected).size !== selected.length || selected.some(id => !EVAL_CASES.some(item => item.id === id))) throw new Error('eval_invalid_case_ids');
  if (!selected.length) throw new Error('eval_no_cases');
  const cases = selected.map(id => EVAL_CASES.find(item => item.id === id)).slice(0, limit);
  const report = resolve(options.report ?? `test-results/eval/${mode}-latest.json`);
  return { mode, maxTurns, cases, report, isolated: options.isolated === 'true' || process.env.KUMO_EVAL_ISOLATED === '1' };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const modelConfig = options.mode === 'llm' ? {
    endpoint: process.env.KUMO_LLM_ENDPOINT,
    model: process.env.KUMO_LLM_MODEL,
    apiKey: process.env.KUMO_LLM_API_KEY
  } : null;
  const report = await evaluateBrowserAgent({ ...options, modelConfig });
  await mkdir(dirname(options.report), { recursive: true });
  await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ mode: report.mode, model: report.model, total: report.total, passed: report.passed,
    successRate: report.successRate, averageTurns: report.averageTurns,
    averageLatencyMs: report.averageLatencyMs, averageModelCalls: report.averageModelCalls,
    failureKinds: report.failureKinds, reportPath: options.report }, null, 2));
  if (report.failed) process.exitCode = 1;
} catch (error) {
  console.error(`Evaluation error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
