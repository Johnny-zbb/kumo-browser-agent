import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentModeView } from '../dist/apps/playground/src/agent-mode.js';

function withMockDom(reducedMotion, run) {
  const classes = new Set();
  const properties = new Map();
  const elements = Object.fromEntries(['agent-portal', 'agent-hud', 'agent-hud-label', 'agent-header-status'].map(id => [id, {
    id, hidden: id === 'agent-hud', textContent: '',
    style: { setProperty: (k, v) => properties.set(k, v) }
  }]));
  const savedDocument = globalThis.document;
  const savedWindow = globalThis.window;
  globalThis.document = {
    documentElement: { classList: {
      add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)),
      contains: name => classes.has(name)
    } },
    getElementById: id => elements[id]
  };
  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: callback => { callback(); return 1; }
  };
  return Promise.resolve().then(() => run({ classes, properties, elements })).finally(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });
}

test('agent mode enters from the pressed button and reveals task activity', async () => {
  await withMockDom(false, async ({ classes, properties, elements }) => {
    const mode = new AgentModeView();
    const promise = mode.enter({ getBoundingClientRect: () => ({ left: 120, top: 210, width: 80, height: 40 }) });
    assert.equal(properties.get('--portal-x'), '160px');
    assert.equal(properties.get('--portal-y'), '230px');
    assert.equal(classes.has('agent-active'), true);
    assert.equal(classes.has('agent-entering'), true);
    assert.equal(elements['agent-hud'].hidden, false);
    await promise;
    assert.equal(classes.has('agent-entering'), false);
    assert.equal(classes.has('agent-active'), true);
    mode.update(2, '点击搜索');
    assert.equal(elements['agent-hud-label'].textContent, '第 2 轮 · 点击搜索');
    mode.leave('completed');
    assert.equal(classes.has('agent-active'), false);
    assert.equal(elements['agent-hud'].hidden, true);
    assert.equal(elements['agent-header-status'].textContent, 'TASK COMPLETED');
  });
});

test('reduced-motion mode and cancellation cleanly exit without animation', async () => {
  await withMockDom(true, async ({ classes, elements }) => {
    const mode = new AgentModeView();
    await mode.enter({ getBoundingClientRect: () => ({ left: -10, top: 1000, width: 20, height: 20 }) });
    assert.equal(classes.has('agent-active'), true);
    mode.leave('stopped');
    assert.equal(classes.has('agent-entering'), false);
    assert.equal(classes.has('agent-active'), false);
    assert.equal(elements['agent-header-status'].textContent, 'TASK STOPPED');
  });
});
