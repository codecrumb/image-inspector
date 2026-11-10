import test from 'node:test';
import assert from 'node:assert/strict';
import { opDims, transformStrokes, clampCrop, fitSize } from '../src/js/geometry.js';

const CW = { type: 'rot', dir: 1 }, CCW = { type: 'rot', dir: -1 };
const FX = { type: 'flip', axis: 'x' }, FY = { type: 'flip', axis: 'y' };
const st = (pts, w = 0.1) => [{ w, fx: 'blur', pts }];
const near = (a, b) => a.forEach((p, i) => p.forEach((v, j) => assert.ok(Math.abs(v - b[i][j]) < 1e-9)));

test('rot cw maps a stroke point', () => {
  const [s] = transformStrokes(st([[0.25, 0.5]]), CW, 400, 200);
  assert.deepEqual(s.pts, [[0.5, 0.25]]);
  assert.equal(s.w, 0.1);
  assert.equal(s.fx, 'blur');
  assert.deepEqual(opDims(CW, 400, 200), [200, 400]);
});
test('four rotations return the original', () => {
  let s = st([[0.2, 0.7], [0.9, 0.1]]), w = 400, h = 200;
  for (let i = 0; i < 4; i++) { s = transformStrokes(s, CW, w, h); [w, h] = opDims(CW, w, h); }
  near(s[0].pts, [[0.2, 0.7], [0.9, 0.1]]);
});
test('flip x twice returns the original', () => {
  const s = transformStrokes(transformStrokes(st([[0.2, 0.7]]), FX, 10, 10), FX, 10, 10);
  near(s[0].pts, [[0.2, 0.7]]);
  near(transformStrokes(st([[0.2, 0.7]]), FY, 10, 10)[0].pts, [[0.2, 0.3]]);
  assert.deepEqual(opDims(FX, 30, 20), [30, 20]);
});
test('rot ccw is the inverse of rot cw', () => {
  const s = transformStrokes(transformStrokes(st([[0.2, 0.7]]), CW, 400, 200), CCW, 200, 400);
  near(s[0].pts, [[0.2, 0.7]]);
});
test('crop remaps and rescales', () => {
  const op = { type: 'crop', x: 0.5, y: 0, w: 0.5, h: 1 };
  const [s] = transformStrokes(st([[0.75, 0.5]]), op, 1000, 500);
  near(s.pts, [[0.5, 0.5]]);
  assert.ok(Math.abs(s.w - 0.2) < 1e-9);
  assert.deepEqual(opDims(op, 1000, 500), [500, 500]);
});
test('crop drops a stroke fully outside', () => {
  const op = { type: 'crop', x: 0.5, y: 0, w: 0.5, h: 1 };
  assert.equal(transformStrokes(st([[0.1, 0.5]]), op, 1000, 500).length, 0);
});
test('crop keeps a stroke that overlaps the edge', () => {
  const op = { type: 'crop', x: 0.5, y: 0, w: 0.5, h: 1 };
  assert.equal(transformStrokes(st([[0.48, 0.5]]), op, 1000, 500).length, 1);
});
test('transformStrokes does not mutate its input', () => {
  const input = st([[0.25, 0.5]]);
  const copy = JSON.parse(JSON.stringify(input));
  transformStrokes(input, CW, 400, 200);
  transformStrokes(input, { type: 'crop', x: 0, y: 0, w: 0.5, h: 0.5 }, 400, 200);
  assert.deepEqual(input, copy);
});
test('clampCrop clamps and rejects tiny rects', () => {
  assert.deepEqual(clampCrop({ x: -0.1, y: 0.2, w: 0.5, h: 2 }, 1000, 1000), { x: 0, y: 0.2, w: 0.4, h: 0.8 });
  assert.equal(clampCrop({ x: 0.1, y: 0.1, w: 0.004, h: 0.5 }, 1000, 1000), null);
});
test('fitSize keeps ratio and clamps the long side', () => {
  assert.deepEqual(fitSize(4000, 3000, 1000, 4096), [1000, 750]);
  assert.deepEqual(fitSize(4000, 3000, 9000, 4096), [4096, 3072]);
  assert.deepEqual(fitSize(100, 100, 0, 4096), [1, 1]);
});
