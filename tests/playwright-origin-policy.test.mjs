import test from 'node:test';
import assert from 'node:assert/strict';
import { OriginPolicy } from '../dist/packages/playwright-runtime/src/origin-policy.js';

test('browser runtime needs explicit exact origins and refuses credentials/wildcards', () => {
  assert.throws(() => new OriginPolicy([]), /allowed_origins_required/);
  for (const origin of ['*', '*.example.com', 'https://example.com/path', 'https://example.com?key=x', 'https://foo:bar@example.com', 'file:///tmp/a']) {
    assert.throws(() => new OriginPolicy([origin]));
  }
  const policy = new OriginPolicy(['http://127.0.0.1:4173', 'https://sample.example']);
  assert.ok(policy.allows('http://127.0.0.1:4173/portal?tab=1'));
  assert.ok(policy.allows('https://sample.example/other'));
  assert.ok(!policy.allows('http://127.0.0.1:4174'));
  assert.ok(!policy.allows('https://sample.example.evil.test'));
  assert.ok(!policy.allows('https://user:password@sample.example'));
  assert.ok(!policy.allows('javascript:alert(1)'));
  assert.ok(!policy.allows('data:text/html,hi'));
  assert.ok(!policy.allows('https://not-allowed.example'));
  assert.throws(() => policy.assertAllowed('https://not-allowed.example'), /origin_not_allowed/);
});
