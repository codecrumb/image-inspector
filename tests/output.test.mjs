import test from 'node:test';
import assert from 'node:assert/strict';
import { findQualityForTarget } from '../src/js/output.js';

const fake = () => { const calls = []; return { calls, encode: async (q) => (calls.push(q), 1000 * q * 100) }; };

test('target between bounds converges within 7 calls', async () => {
  const { calls, encode } = fake();
  const r = await findQualityForTarget(encode, 60000);
  assert.ok(calls.length <= 7);
  assert.ok(r.reached && r.bytes <= 60000);
  assert.ok(r.quality > 0.55 && r.quality <= 0.6);
  assert.equal(r.bytes, 1000 * r.quality * 100);
});
test('target below the 0.30 size is unreachable', async () => {
  const { encode } = fake();
  assert.deepEqual(await findQualityForTarget(encode, 1000), { quality: 0.3, bytes: 30000, reached: false });
});
test('target above the 0.95 size returns 0.95', async () => {
  const { calls, encode } = fake();
  const r = await findQualityForTarget(encode, 500000);
  assert.deepEqual(r, { quality: 0.95, bytes: 95000, reached: true });
  assert.equal(calls.length, 1);
});
