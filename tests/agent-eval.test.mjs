import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVAL_CASES, fixtureHtml, getEvalCase, createBaselinePlanner } from '../eval/fixtures.mjs';
import { summarizeEvaluation, classifyFailure } from '../eval/report.mjs';
import { diagnosticErrorCode, summarizeAgentTrace } from '../eval/diagnostics.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('eval suite includes exactly 16 unique deterministic synthetic tasks', () => {
  assert.equal(EVAL_CASES.length, 16);
  assert.equal(new Set(EVAL_CASES.map(row => row.id)).size, 16);
  assert.deepEqual([...new Set(EVAL_CASES.map(row => row.category))].sort(), ['details', 'dialog', 'search', 'tab']);
  for (const item of EVAL_CASES) {
    assert.equal(getEvalCase(item.id), item);
    const html = fixtureHtml(item);
    assert.match(html, /id="workspace"/);
    assert.match(html, /data-eval-result data-state="pending"/);
    assert.match(html, /<script>/);
    assert.ok(item.task.includes(item.target), item.id);
  }
  assert.throws(() => fixtureHtml({ id: 'not-a-case' }), /eval_unknown_case/);
});

test('baseline planner selects a duplicate button inside the correct semantic row', async () => {
  const item = getEvalCase('details-kumo');
  const tree = [{ role: 'table', children: [
    { role: 'row', name: 'agent-prod 查看详情', children: [{ role: 'button', name: '查看详情', ref: 3 }] },
    { role: 'row', name: 'kumo-dev 查看详情', children: [{ role: 'button', name: '查看详情', ref: 7 }] }
  ] }];
  const decision = await createBaselinePlanner(item).decide(item.task, { text: '暂无结果', tree, elements: [] });
  assert.deepEqual(decision.action, { kind: 'click', ref: 7 });
});

test('eval aggregation counts real failures rather than treating model done as success', () => {
  const report = summarizeEvaluation({ mode: 'llm', model: 'mock-test-model', startedAt: '2026-01-01T00:00:00Z', records: [
    { passed: true, turns: 3, latencyMs: 100, modelCalls: 3, failureKind: null },
    { passed: false, turns: 2, latencyMs: 300, modelCalls: 2, failureKind: 'verification_failed' }
  ] });
  assert.equal(report.successRate, 0.5);
  assert.equal(report.averageTurns, 2.5);
  assert.equal(report.averageLatencyMs, 200);
  assert.equal(report.averageModelCalls, 2.5);
  assert.deepEqual(report.failureKinds, { verification_failed: 1 });
  assert.equal(report.model, 'mock-test-model');
  assert.equal(classifyFailure({ status: 'failed', reason: '无法确认任务完成：缺少结果' }), 'verification_failed');
  assert.equal(classifyFailure({ status: 'failed', reason: '观察或决策失败：model_invalid_json' }), 'model_error');
  assert.equal(classifyFailure({ status: 'approval_required', reason: '确认' }), 'approval_required');
  assert.equal(classifyFailure({ status: 'failed', reason: '页面没有进展：连续重复相同动作和观察结果' }), 'no_progress');
  assert.throws(() => summarizeEvaluation({ mode: 'baseline', records: [] }), /eval_no_records/);
});

test('turn diagnostics distinguish duplicate buttons by row without copying raw data', () => {
  const target = { ref: 7, role: 'button', name: '查看详情', disabled: false };
  const snapshot = { id: 1, text: 'raw-page-secret', elements: [target], tree: [{ role: 'table', children: [
    { role: 'row', name: 'agent-prod 查看详情', children: [{ role: 'button', name: '查看详情', ref: 3 }] },
    { role: 'row', name: 'kumo-dev 查看详情', children: [target] }
  ] }] };
  const trace = summarizeAgentTrace({ snapshot, turn: 1, actionResult: 'ok',
    decision: { kind: 'act', reason: 'model-reason-secret', action: { kind: 'input', ref: 7, value: 'input-secret' } } });
  assert.equal(trace.target.ref, 7);
  assert.equal(trace.target.ancestors.at(-1).name, 'kumo-dev 查看详情');
  assert.deepEqual(trace.decision.action, { kind: 'input', ref: 7 });
  for (const secret of ['raw-page-secret', 'model-reason-secret', 'input-secret']) assert.ok(!JSON.stringify(trace).includes(secret));
});

test('diagnostic error codes allow known failures and omit free-form provider text', () => {
  assert.equal(diagnosticErrorCode(new Error('llm_http_403')), 'llm_http_403');
  assert.equal(diagnosticErrorCode(new Error('model_unknown_ref')), 'model_unknown_ref');
  assert.equal(diagnosticErrorCode(new DOMException('private detail', 'TimeoutError')), 'TimeoutError');
  assert.equal(diagnosticErrorCode(new Error('llm_http_403 private-token')), 'unclassified_error');
});

test('eval CLI rejects malformed trace options before starting a browser', async () => {
  await assert.rejects(promisify(execFile)(process.execPath, ['scripts/eval-browser-agent.mjs', '--trace=yes']),
    error => error.code === 1 && /eval_invalid_trace/.test(error.stderr));
});
