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
