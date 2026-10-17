import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeSemanticTree } from '../dist/packages/dom-engine/src/snapshot/build-tree.js';

test('semantic tree keeps container context and two identical button names distinct', () => {
  const tree = [{ role: 'list', name: '云服务器实例', children: [
    { role: 'listitem', name: 'instance A', children: [{ role: 'button', name: '详情', ref: 3, actions: ['click'] }] },
    { role: 'listitem', name: 'instance B', children: [{ role: 'button', name: '详情', ref: 4, actions: ['click'] }] }
  ] }];
  const output = serializeSemanticTree(tree);
  assert.match(output, /list "云服务器实例"/);
  assert.match(output, /listitem "instance A"\n    - button "详情" \[ref=e3\]/);
  assert.match(output, /listitem "instance B"\n    - button "详情" \[ref=e4\]/);
  assert.equal((output.match(/button "详情"/g) || []).length, 2);
});

test('serializer reports target states without synthesizing references for containers', () => {
  const output = serializeSemanticTree([{ role: 'region', name: '筛选', children: [
    { role: 'textbox', name: '搜索', ref: 1, value: 'agent', actions: ['input','click'] },
    { role: 'button', name: '提交', ref: 2, disabled: true, actions: ['click'] }
  ] }]);
  assert.match(output, /textbox "搜索" \[ref=e1\] value="agent"/);
  assert.match(output, /button "提交" \[ref=e2\] \[disabled\]/);
  assert.ok(!output.includes('region "筛选" [ref='));
});
