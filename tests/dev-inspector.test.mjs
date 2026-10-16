import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DevInspector } from '../dist/apps/playground/src/dev-inspector.js';

class NodeMock {
  constructor(id) {
    this.id = id;
    this.hidden = id === 'dev-inspector' || id === 'inspector-backdrop' || id === 'panel-snapshot';
    this.attrs = new Map();
    this.dataset = {};
    this.tabIndex = 0;
    this.handlers = {};
  }
  addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
  fire(name, value = {}) { for (const fn of this.handlers[name] || []) fn(value); }
  setAttribute(k,v) { this.attrs.set(k,v); }
  getAttribute(k) { return this.attrs.get(k); }
  contains(item) { return item === this || item === globalThis.document.getElementById('inspector-close'); }
  focus() { globalThis.document.activeElement = this; }
}

function mockDocument(run) {
  const ids = ['dev-inspector', 'inspector-toggle', 'inspector-backdrop', 'inspector-close', 'tab-trace', 'tab-snapshot', 'panel-trace', 'panel-snapshot'];
  const elements = Object.fromEntries(ids.map(id=>[id,new NodeMock(id)]));
  elements['tab-trace'].dataset.inspectorTab = 'trace';
  elements['tab-snapshot'].dataset.inspectorTab = 'snapshot';
  const original = globalThis.document;
  const listeners = {};
  globalThis.document = {
    getElementById: id => elements[id],
    querySelectorAll: () => [elements['tab-trace'],elements['tab-snapshot']],
    addEventListener: (name,fn) => (listeners[name] ||= []).push(fn),
    activeElement: null
  };
  try { return run({ elements, key: name => (listeners.keydown || []).forEach(fn=>fn({key:name})) }); }
  finally { globalThis.document = original; }
}

test('inspector opens on demand, switches tabs, and closes with Escape', () => {
  mockDocument(({ elements, key }) => {
    const inspector = new DevInspector();
    assert.equal(elements['dev-inspector'].hidden, true);
    elements['inspector-toggle'].fire('click');
    assert.equal(elements['dev-inspector'].hidden, false);
    assert.equal(elements['inspector-backdrop'].hidden, false);
    assert.equal(elements['inspector-toggle'].getAttribute('aria-expanded'), 'true');
    elements['tab-snapshot'].fire('click');
    assert.equal(elements['panel-trace'].hidden,true);
    assert.equal(elements['panel-snapshot'].hidden,false);
    assert.equal(elements['tab-snapshot'].getAttribute('aria-selected'), 'true');
    key('Escape');
    assert.equal(elements['dev-inspector'].hidden, true);
    assert.equal(elements['inspector-toggle'].getAttribute('aria-expanded'), 'false');
    inspector.setOpen(true);
    elements['inspector-backdrop'].fire('click');
    assert.equal(elements['dev-inspector'].hidden, true);
  });
});

test('only the controlled browser content is within #sandbox; command and inspector are siblings', () => {
  const html = readFileSync(new URL('../apps/playground/index.html', import.meta.url), 'utf8');
  const sandboxStart = html.indexOf('id="sandbox"');
  const sandboxEnd = html.indexOf('id="agent-frame"');
  const command = html.indexOf('id="task-form"');
  const inspector = html.indexOf('id="dev-inspector"');
  assert.ok(sandboxStart >= 0 && sandboxStart < sandboxEnd && sandboxEnd < command && command < inspector);
  assert.equal((html.match(/id="run"/g)||[]).length, 1);
  assert.equal(html.includes('class="hero"'),false);
  assert.equal(html.includes('class="debug-panel"'),false);
});
