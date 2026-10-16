import test from 'node:test';
import assert from 'node:assert/strict';
import { ComponentAdapterRegistry } from '../dist/packages/dom-engine/src/component-adapters.js';

test('component adapters select the most specific high-priority match', () => {
  const adapter = (id, priority, match) => ({ id, priority, selector: `[data-widget="${id}"]`, matches: match, observe: () => ({ role: 'button', name: id }) });
  const registry = new ComponentAdapterRegistry([
    adapter('general', 0, () => true),
    adapter('specific', 10, el => el.kind === 'special')
  ]);
  assert.equal(registry.resolve({ kind: 'special' }).id, 'specific');
  assert.equal(registry.resolve({ kind: 'ordinary' }).id, 'general');
});

test('duplicate adapter identifiers are rejected rather than silently overwritten', () => {
  const a = {id: 'x', selector: '[data-x]', matches: () => true, observe: () => ({role:'button',name:'x'})};
  assert.throws(() => new ComponentAdapterRegistry([a,a]), /invalid_component_adapter/);
});
