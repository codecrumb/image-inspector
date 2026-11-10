import test from 'node:test';
import assert from 'node:assert/strict';
import { pixelBlockSize } from '../src/js/effects.js';

test('pixelBlockSize floors at 2', () => assert.equal(pixelBlockSize(1, 100, 100), 2));
test('pixelBlockSize scales with the long side', () => assert.equal(pixelBlockSize(100, 1000, 500), 60));
test('pixelBlockSize at half strength', () => assert.equal(pixelBlockSize(50, 4000, 3000), 120));
