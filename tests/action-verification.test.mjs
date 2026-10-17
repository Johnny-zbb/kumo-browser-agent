import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../dist/packages/agent-core/src/run-agent.js';
import { verifyActionEffect } from '../dist/packages/agent-core/src/action-verifier.js';
import { DemoTaskVerifier } from '../dist/apps/playground/src/demo-task-verifier.js';

const snap = (value = '', text = '', top = 0) => ({
  id: 1, url: 'https://local.test', title: 'demo', tree: [], text,
  viewport: { scrollTop: top, clientHeight: 100, scrollHeight: 500, atBottom: top >= 400 },
  elements: [{ ref: 2, role: 'textbox', name: '搜索实例', value, disabled: false }]
});

test('reobservation proves input values, not just event dispatch', () => {
  assert.equal(verifyActionEffect({ kind: 'input', ref: 2, value: 'agent' }, snap(''), snap('agent')).status, 'matched');
  assert.equal(verifyActionEffect({ kind: 'input', ref: 2, value: 'agent' }, snap(''), snap('')).status, 'mismatch');
  assert.equal(verifyActionEffect({ kind: 'input', ref: 2, value: 'agent' }, snap(''), { ...snap(), elements: [] }).status, 'unconfirmed');
});

test('clicking a button does not prove completion even when DOM changed', () => {
  const changed = verifyActionEffect({ kind: 'click', ref: 2 }, snap(), snap('', '更新成功'));
  assert.equal(changed.status, 'changed');
  assert.match(changed.reason, /不等于任务完成/);
  assert.equal(verifyActionEffect({ kind: 'click', ref: 2 }, snap(), snap()).status, 'unconfirmed');
});

test('scroll effect is derived from actual position, not the requested direction', () => {
  assert.equal(verifyActionEffect({ kind: 'scroll', direction: 'down' }, snap(), snap('', '', 380)).status, 'changed');
  assert.equal(verifyActionEffect({ kind: 'scroll', direction: 'down' }, snap(), snap()).status, 'unconfirmed');
});

test('independent verifier rejects a hallucinated done from a planner', async () => {
  const page = { observe: async () => snap(), execute: async () => {}, settle: async () => {} };
  const planner = { decide: async () => ({ kind: 'done', reason: 'I did it' }) };
  const result = await runAgent('搜索 agent 实例', page, planner, { taskVerifier: new DemoTaskVerifier() });
  assert.equal(result.status, 'failed');
  assert.equal(result.history[0].taskVerification.status, 'rejected');
  assert.match(result.reason, /无法确认任务完成/);
});

test('independent verifier accepts observed goal and rejects unsupported tasks', async () => {
  const verifier = new DemoTaskVerifier();
  assert.equal(verifier.verify('搜索实例', snap('agent', '筛选结果：agent')).status, 'passed');
  assert.equal(verifier.verify('未知第三方网站操作', snap()).status, 'inconclusive');
  const page = { observe: async () => snap('agent', '筛选结果：agent'), execute: async () => {}, settle: async () => {} };
  const planner = { decide: async () => ({ kind: 'done', reason: 'success' }) };
  const result = await runAgent('搜索实例', page, planner, { taskVerifier: verifier });
  assert.equal(result.status, 'completed');
  assert.equal(result.history[0].taskVerification.status, 'passed');
});

test('cancelling after a dispatched event does not report verified completion', async () => {
  const controller = new AbortController();
  const page = { observe: async () => snap(), execute: async () => { controller.abort(); }, settle: async () => {} };
  const planner = { decide: async () => ({ kind: 'act', reason: 'test', action: { kind: 'click', ref: 2 } }) };
  const result = await runAgent('任务', page, planner, { signal: controller.signal });
  assert.equal(result.status, 'stopped');
  assert.equal(result.history[0].actionResult, 'ok');
  assert.equal(result.history[0].actionVerification, undefined);
});
