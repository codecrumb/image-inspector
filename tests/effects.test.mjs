import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelCells } from '../src/js/effects.js';


test('pixelCells is scale-invariant', () => {
  assert.deepEqual(pixelCells(40, 1600, 1200), pixelCells(40, 3200, 2400));
  assert.deepEqual(pixelCells(40, 1200, 1600), pixelCells(40, 2400, 3200));
  assert.deepEqual(pixelCells(40, 1600, 1200), [42, 32]);
});
test('pixelCells keeps the 2 px floor on tiny images', () => {
  assert.deepEqual(pixelCells(1, 10, 6), [5, 3]);
  assert.deepEqual(pixelCells(1, 1, 1), [1, 1]);
});
