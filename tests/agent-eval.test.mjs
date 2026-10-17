import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVAL_CASES, fixtureHtml, getEvalCase, createBaselinePlanner } from '../eval/fixtures.mjs';
import { summarizeEvaluation, classifyFailure } from '../eval/report.mjs';

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
  assert.throws(() => summarizeEvaluation({ mode: 'baseline', records: [] }), /eval_no_records/);
});
