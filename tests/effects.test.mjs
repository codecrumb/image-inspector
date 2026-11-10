import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelBlockSize, pixelCells } from '../src/js/effects.js';

test('pixelBlockSize floors at 2', () => assert.equal(pixelBlockSize(1, 100, 100), 2));
test('pixelBlockSize scales with the long side', () => assert.equal(pixelBlockSize(100, 1000, 500), 60));
test('pixelBlockSize at half strength', () => assert.equal(pixelBlockSize(50, 4000, 3000), 120));

test('pixelCells is scale-invariant', () => {
  assert.deepEqual(pixelCells(40, 1600, 1200), pixelCells(40, 3200, 2400));
  assert.deepEqual(pixelCells(40, 1200, 1600), pixelCells(40, 2400, 3200));
  assert.deepEqual(pixelCells(40, 1600, 1200), [42, 32]);
});
test('pixelCells keeps the 2 px floor on tiny images', () => {
  assert.deepEqual(pixelCells(1, 10, 6), [5, 3]);
  assert.deepEqual(pixelCells(1, 1, 1), [1, 1]);
});
