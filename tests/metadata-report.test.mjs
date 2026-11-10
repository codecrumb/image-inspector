import test from 'node:test';
import assert from 'node:assert/strict';
import { describeMetadata } from '../src/js/metadata-report.js';

const r = (...labels) => labels.map(l => [l, 'x']);

test('no rows', () => assert.equal(describeMetadata([], false), 'No metadata found in the original.'));
test('GPS, camera and two others', () =>
  assert.equal(describeMetadata(r('GPS', 'Camera', 'Date Taken', 'Flash'), false), 'Removed: GPS location, camera, 2 other fields.'));
test('one other field is singular', () =>
  assert.equal(describeMetadata(r('Flash'), false), 'Removed: 1 other field.'));
test('kept variant', () =>
  assert.equal(describeMetadata(r('GPS', 'Camera', 'Flash'), true), 'Kept: GPS location, camera, 1 other field.'));
test('camera only', () => assert.equal(describeMetadata(r('Camera'), false), 'Removed: camera.'));
test('GPS only', () => assert.equal(describeMetadata(r('GPS'), true), 'Kept: GPS location.'));
test('structural rows are ignored', () => {
  assert.equal(describeMetadata(r('JFIF Version', 'Encoding', 'YCbCr Subsampling'), false), 'No metadata found in the original.');
  assert.equal(describeMetadata(r('JFIF Version', 'Flash'), false), 'Removed: 1 other field.');
});
test('count-only form', () => {
  const rows = [['Flash', 'Fired'], ['ISO', '100'], ['Exposure', '1/60s']];
  assert.equal(describeMetadata(rows, false), 'Removed: 3 other fields.');
  assert.equal(describeMetadata(rows, true), 'Kept: 3 other fields.');
});
