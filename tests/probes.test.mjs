import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToHex, rgbToHsl, averageRgb, dragToRect, probesToCsv } from '../src/js/probes.js';

test('rgbToHex pads', () => assert.equal(rgbToHex(0, 15, 255), '#000fff'));
test('rgbToHsl primaries and greys', () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), [0, 100, 50]);
  assert.deepEqual(rgbToHsl(0, 255, 0), [120, 100, 50]);
  assert.deepEqual(rgbToHsl(0, 0, 255), [240, 100, 50]);
  assert.deepEqual(rgbToHsl(128, 128, 128), [0, 0, 50]);
  assert.deepEqual(rgbToHsl(255, 255, 255), [0, 0, 100]);
  assert.deepEqual(rgbToHsl(0, 0, 0), [0, 0, 0]);
});
test('rgbToHsl wraps hue below zero', () => assert.deepEqual(rgbToHsl(255, 0, 128), [330, 100, 50]));
test('averageRgb ignores alpha and rounds', () => {
  assert.deepEqual(averageRgb(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 0, 10, 20, 30, 7])), [88, 92, 95]);
  assert.deepEqual(averageRgb(new Uint8ClampedArray([])), [0, 0, 0]);
});
test('dragToRect: tiny drag is a point, order and clamping handled', () => {
  assert.equal(dragToRect(0.5, 0.5, 0.501, 0.501, 100, 100), null);
  assert.deepEqual(dragToRect(0.5, 0.4, 0.2, 0.1, 100, 100), { x: 20, y: 10, w: 30, h: 30 });
  assert.deepEqual(dragToRect(0.9, 0.9, 1.4, 1.4, 100, 100), { x: 90, y: 90, w: 10, h: 10 });
});
test('probesToCsv escapes and converts', () => {
  const csv = probesToCsv([{ id: 1, label: 'sky, "blue"', kind: 'point', x: 5, y: 10, w: 1, h: 1, rgb: [255, 0, 0] }], 'a.png', 100, 50);
  const [head, row] = csv.trim().split('\r\n');
  assert.ok(head.startsWith('id,label,type,x,y,'));
  assert.equal(row, '1,"sky, ""blue""",point,5,10,1,1,0.05000,0.20000,255,0,0,#ff0000,0,100,50,a.png,100,50');
});
