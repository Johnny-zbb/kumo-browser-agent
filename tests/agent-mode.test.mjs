import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentModeView } from '../dist/apps/playground/src/agent-mode.js';

function withMockDom(reducedMotion, run) {
  const classes = new Set();
  const properties = new Map();
  const elements = Object.fromEntries(['browser-stage', 'agent-portal', 'agent-hud', 'agent-hud-label', 'agent-header-status'].map(id => [id, {
    id, hidden: id === 'agent-hud', textContent: '', clientWidth: 980, clientHeight: 480,
    style: { setProperty: (k, v) => properties.set(k, v) },
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    }
  }]));
  const savedDocument = globalThis.document;
  const savedWindow = globalThis.window;
  let finishEnter = null;
  globalThis.document = { getElementById: id => elements[id] };
  globalThis.window = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: callback => { finishEnter = callback; return 1; }
  };
  return Promise.resolve().then(() => run({ classes, properties, elements, finish: () => finishEnter?.() })).finally(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });
}

test('agent mode starts at sandbox center, and activates only its container', async () => {
  await withMockDom(false, async ({ classes, properties, elements, finish }) => {
    const mode = new AgentModeView();
    const promise = mode.enter();
    assert.equal(properties.get('--portal-x'), '490px');
    assert.equal(properties.get('--portal-y'), '240px');
    assert.ok(classes.has('agent-entering'));
    assert.ok(classes.has('agent-active'));
    assert.equal(elements['agent-hud'].hidden, false);
    finish();
    await promise;
    assert.equal(classes.has('agent-entering'), false);
    mode.update(2, '点击搜索');
    assert.equal(elements['agent-hud-label'].textContent, '第 2 轮 · 点击搜索');
    mode.leave('completed');
    assert.equal(classes.has('agent-active'), false);
    assert.equal(elements['agent-hud'].hidden, true);
    assert.equal(elements['agent-header-status'].textContent, 'TASK COMPLETED');
  });
});

test('stop during entry does not resurrect the agent mode', async () => {
  await withMockDom(false, async ({ classes, elements, finish }) => {
    const mode = new AgentModeView();
    const promise = mode.enter();
    mode.leave('stopped');
    finish();
    await promise;
    assert.ok(!classes.has('agent-entering'));
    assert.ok(!classes.has('agent-active'));
    assert.equal(elements['agent-header-status'].textContent, 'TASK STOPPED');
  });
});

test('reduced-motion mode enters without waiting and exits normally', async () => {
  await withMockDom(true, async ({ classes }) => {
    const mode = new AgentModeView();
    await mode.enter();
    assert.equal(classes.has('agent-active'), true);
    mode.leave('stopped');
    assert.equal(classes.has('agent-active'), false);
  });
});

test('circular reveal can originate from the sandbox task button', async () => {
  await withMockDom(true, async ({ properties, elements }) => {
    elements['browser-stage'].getBoundingClientRect = () => ({ left: 60, top: 120 });
    const trigger = { getBoundingClientRect: () => ({ left: 340, top: 580, width: 140, height: 50 }) };
    const mode = new AgentModeView();
    await mode.enter(trigger);
    assert.equal(properties.get('--portal-x'), '350px');
    assert.equal(properties.get('--portal-y'), '480px');
    mode.leave('completed');
  });
});
