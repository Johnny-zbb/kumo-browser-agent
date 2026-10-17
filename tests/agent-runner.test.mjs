import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../dist/packages/agent-core/src/run-agent.js';
import { DemoPlanner } from '../dist/apps/playground/src/demo-planner.js';

function createFakePage() {
  let id = 0;
  let search = '';
  let result = '';
  let opened = false;
  let name = '';
  let created = false;
  let pos = 0;
  return {
    observe: async () => ({
      id: ++id,
      title: 'Sandbox', url: 'https://test.local',
      viewport: { scrollTop: pos, clientHeight: 100, scrollHeight: 1000, atBottom: pos >= 900 },
      text: [result, created ? '已创建实例：kumo-demo' : ''].join(' '),
      elements: [
        { ref: 1, role: 'textbox', name: '搜索实例', value: search, disabled: false },
        { ref: 2, role: 'button', name: '执行搜索', disabled: false },
        { ref: 3, role: 'button', name: '新建实例', disabled: false },
        ...(opened ? [
          { ref: 4, role: 'textbox', name: '实例名称', value: name, disabled: false },
          { ref: 5, role: 'button', name: '确认创建', disabled: false }
        ] : [])
      ]
    }),
    execute: async (action, snapshot) => {
      if (snapshot.id !== id) throw Error('stale_snapshot');
      if (action.kind === 'scroll') { pos = Math.min(pos + 380, 900); return; }
      if (action.kind === 'input') { if (action.ref === 1) search = action.value; if (action.ref === 4) name = action.value; return; }
      if (action.ref === 2) result = `筛选结果：${search}`;
      if (action.ref === 3) opened = true;
      if (action.ref === 5 && name) created = true;
    },
    settle: async () => {}
  };
}

test('search: observe → input → observe → click → observe → done', async () => {
  const result = await runAgent('搜索 agent', createFakePage(), new DemoPlanner());
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.history.map(x => x.decision.kind === 'act' ? x.decision.action.kind : x.decision.kind), ['input','click','done']);
  assert.equal(result.history.at(-1).snapshot.text.includes('筛选结果：agent'), true);
});

test('create: click → input → click → verify', async () => {
  const result = await runAgent('创建一个实例', createFakePage(), new DemoPlanner());
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.history.map(x => x.decision.kind === 'act' ? x.decision.action.kind : x.decision.kind), ['click','input','click','done']);
});

test('scroll: up to three scroll actions until atBottom', async () => {
  const result = await runAgent('滚动到页面底部', createFakePage(), new DemoPlanner());
  assert.equal(result.status, 'completed');
  assert.equal(result.history.length, 4);
});

test('abort: a canceled task does not act', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runAgent('创建实例', createFakePage(), new DemoPlanner(), {signal: controller.signal});
  assert.equal(result.status, 'stopped');
  assert.equal(result.history.length, 0);
});

test('end on budget rather than infinite loop', async () => {
  const result = await runAgent('滚动到底部', createFakePage(), new DemoPlanner(), {maxTurns: 2});
  assert.equal(result.status, 'max_turns');
});

test('stale ref triggers a new observation, never retries blind', async () => {
  const page = createFakePage();
  const realExecute = page.execute;
  let once = true;
  page.execute = async (action,snapshot) => {
    if(once){once = false;throw Error('stale_ref');}
    return realExecute(action,snapshot);
  };
  const result = await runAgent('搜索 agent', page, new DemoPlanner());
  assert.equal(result.status, 'completed');
  assert.equal(result.history[0].actionResult, 'error');
  assert.equal(result.history[1].snapshot.id, 2);
});

test('fails safely when the same action has no effect', async () => {
  const page = createFakePage();
  page.execute = async () => {}; // the page isn't changing
  const result = await runAgent('搜索 agent', page, new DemoPlanner());
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /动作结果与预期不符/);
  assert.equal(result.history[0].actionVerification?.status, 'mismatch');
});
