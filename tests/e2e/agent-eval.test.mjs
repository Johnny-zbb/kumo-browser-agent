import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBrowserAgent } from '../../eval/runner.mjs';
import { getEvalCase } from '../../eval/fixtures.mjs';

const isolated = process.env.KUMO_E2E_ISOLATED === '1';
const chromiumExecutable = process.env.KUMO_CHROMIUM_EXECUTABLE;

test('model-mode evaluator independently rejects fabricated done and counts model calls', async () => {
  const report = await evaluateBrowserAgent({
    mode: 'llm', cases: [getEvalCase('search-agent')], isolated, chromiumExecutable,
    decisionModel: { async complete() { return JSON.stringify({ kind: 'done', reason: 'I claim it is done' }); } }
  });
  assert.equal(report.passed, 0);
  assert.equal(report.failed, 1);
  assert.equal(report.records[0].failureKind, 'verification_failed');
  assert.equal(report.records[0].modelCalls, 1);
  assert.equal(report.model, 'synthetic-model');
});

test('model-mode evaluator exercises validated JSON decisions end-to-end', async () => {
  const report = await evaluateBrowserAgent({
    mode: 'llm', cases: [getEvalCase('search-agent')], isolated, chromiumExecutable,
    decisionModel: { async complete({ user }) {
      const context = JSON.parse(user);
      if (context.page.text.includes('完成：search-agent')) return JSON.stringify({ kind: 'done', reason: '看到完成标记' });
      const input = context.page.targets.find(node => node.name === '实例关键词');
      if (input.value !== 'agent') return JSON.stringify({ kind: 'act', reason: '输入查询', action: { kind: 'input', ref: input.ref, value: 'agent' } });
      const search = context.page.targets.find(node => node.name === '查询');
      return JSON.stringify({ kind: 'act', reason: '发起查询', action: { kind: 'click', ref: search.ref } });
    } }
  });
  assert.equal(report.passed, 1, JSON.stringify(report.records));
  assert.equal(report.records[0].modelCalls, 3);
  assert.equal(report.records[0].turns, 3);
  assert.equal(report.records[0].attemptedTurns, 3);
  assert.equal(report.records[0].fixtureCompleted, true);
  assert.ok(!Object.hasOwn(report.records[0], 'trace'));
});


test('malformed model output is counted as model_error, not successful completion', async () => {
  const report = await evaluateBrowserAgent({
    mode: 'llm', cases: [getEvalCase('tab-logs')], isolated, chromiumExecutable, includeTrace: true,
    decisionModel: { async complete() { return '{not valid json'; } }
  });
  assert.equal(report.failed, 1);
  assert.equal(report.records[0].failureKind, 'model_error');
  assert.equal(report.records[0].modelCalls, 1);
  assert.equal(report.records[0].turns, 0);
  assert.equal(report.records[0].attemptedTurns, 1);
  assert.equal(report.records[0].trace[0].turn, 1);
  assert.equal(report.records[0].trace[0].errorCode, 'model_invalid_json');
  assert.equal(report.records[0].trace[0].decision, null);
});

test('diagnostics expose repeated details clicks after completion without awarding a pass', async () => {
  const report = await evaluateBrowserAgent({
    mode: 'llm', cases: [getEvalCase('details-agent')], isolated, chromiumExecutable, includeTrace: true,
    decisionModel: { async complete({ user }) {
      const { page } = JSON.parse(user);
      const ref = Number(page.tree.match(/row "agent-prod[^\n]*\n[\s\S]*?ref=e(\d+)/)[1]);
      return JSON.stringify({ kind: 'act', reason: 'Keep clicking the same row', action: { kind: 'click', ref } });
    } }
  });
  const record = report.records[0];
  assert.equal(record.passed, false);
  assert.equal(record.fixtureCompleted, true);
  assert.equal(record.failureKind, 'no_progress');
  assert.equal(record.attemptedTurns, 4);
  assert.equal(record.modelCalls, 4);
  assert.deepEqual(record.trace.map(turn => turn.completionTextObserved), [false, true, true, true]);
  assert.match(record.trace[0].target.ancestors.find(node => node.role === 'row').name, /agent-prod/);
  assert.equal(record.trace[0].actionVerification, 'changed');
  assert.equal(record.trace.at(-1).dispatch, 'skipped');
  assert.ok(record.modelLatencyMs >= 0);
  assert.ok(record.trace.every(turn => turn.modelCalls === 1 && turn.modelLatencyMs >= 0));
});

test('diagnostics preserve the failing turn for rejected model requests', async () => {
  const report = await evaluateBrowserAgent({
    mode: 'llm', cases: [getEvalCase('search-agent')], isolated, chromiumExecutable, includeTrace: true,
    decisionModel: { async complete() { throw new Error('llm_http_403'); } }
  });
  const record = report.records[0];
  assert.equal(record.failureKind, 'model_error');
  assert.equal(record.attemptedTurns, 1);
  assert.equal(record.trace[0].modelCalls, 1);
  assert.equal(record.trace[0].errorCode, 'llm_http_403');
  assert.equal(record.trace[0].decision, null);
  assert.equal(record.fixtureCompleted, false);
});
