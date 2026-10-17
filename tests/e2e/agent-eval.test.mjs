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
});


test('malformed model output is counted as model_error, not successful completion', async () => {
  const report = await evaluateBrowserAgent({
    mode: 'llm', cases: [getEvalCase('tab-logs')], isolated, chromiumExecutable,
    decisionModel: { async complete() { return '{not valid json'; } }
  });
  assert.equal(report.failed, 1);
  assert.equal(report.records[0].failureKind, 'model_error');
  assert.equal(report.records[0].modelCalls, 1);
});
