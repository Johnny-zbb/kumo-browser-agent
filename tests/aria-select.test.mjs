import test from 'node:test';
import assert from 'node:assert/strict';
import { ariaSelectAdapter } from '../dist/packages/dom-engine/src/adapters/aria-select.js';

function fixture({ update = true, inside = true, disabled = false } = {}) {
  const attrs = { role: 'combobox', 'aria-controls': 'options', 'aria-label': '区域', 'aria-expanded': 'false', 'aria-valuetext': '华北-北京四' };
  const listbox = { hidden: false, getAttribute: k => k === 'role' ? 'listbox' : null, hasAttribute: () => false };
  const element = {
    ownerDocument: { getElementById: () => listbox },
    getAttribute: key => attrs[key] ?? null,
    hasAttribute: () => false,
    textContent: '华北-北京四',
    click() { attrs['aria-expanded'] = 'true'; }
  };
  const option = {
    getAttribute: key => key === 'data-value' ? '华东-上海一' : key === 'aria-disabled' && disabled ? 'true' : null,
    hasAttribute: () => false,
    textContent: '华东-上海一',
    click() { if (update) attrs['aria-valuetext'] = '华东-上海一'; }
  };
  listbox.querySelectorAll = () => [option];
  const context = { root: { contains: () => inside } };
  return { element, context, attrs };
}

test('ARIA combobox yields semantic value and supports selectOption', async () => {
  const f = fixture();
  assert.ok(ariaSelectAdapter.matches(f.element));
  assert.deepEqual(ariaSelectAdapter.observe(f.element).actions, ['click', 'selectOption']);
  assert.equal(await ariaSelectAdapter.execute(f.element, { kind: 'selectOption', ref: 1, value: '华东-上海一' }, f.context), true);
  assert.equal(f.attrs['aria-valuetext'], '华东-上海一');
});

test('component adapter never clicks controls outside authorized root', async () => {
  const f = fixture({ inside: false });
  await assert.rejects(() => ariaSelectAdapter.execute(f.element, { kind: 'selectOption', ref: 1, value: '华东-上海一' }, f.context), /select_listbox_unavailable/);
});

test('component adapter cannot report a success without observed value change', async () => {
  const f = fixture({ update: false });
  await assert.rejects(() => ariaSelectAdapter.execute(f.element, { kind: 'selectOption', ref: 1, value: '华东-上海一' }, f.context), /select_value_not_updated/);
});

test('component adapter rejects disabled choices and unsupported labels', async () => {
  const f = fixture({ disabled: true });
  await assert.rejects(() => ariaSelectAdapter.execute(f.element, { kind: 'selectOption', ref: 1, value: '华东-上海一' }, f.context), /select_option_disabled/);
  const g = fixture();
  await assert.rejects(() => ariaSelectAdapter.execute(g.element, { kind: 'selectOption', ref: 1, value: '不存在' }, g.context), /select_option_not_found/);
});
