import test from 'node:test';
import assert from 'node:assert/strict';
import { isHeicFile, parseHeicHeader } from '../src/js/parsers/heic.js';

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const str = (s) => [...s].map((c) => c.charCodeAt(0));
const flat = (parts) => parts.flatMap((p) => (p instanceof Uint8Array ? [...p] : p));
const box = (type, ...parts) => {
  const body = flat(parts);
  return new Uint8Array([...u32(8 + body.length), ...str(type), ...body]);
};
const full = (type, ...parts) => box(type, [0, 0, 0, 0], ...parts);
const ftyp = (major, ...compat) => box('ftyp', str(major), u32(0), ...compat.map(str));
const pitm = (id) => full('pitm', u16(id));
const ispe = (w, h) => full('ispe', u32(w), u32(h));
const irot = (angle) => box('irot', [angle]);
// assoc: array of [itemId, [propertyIndex...]]
const ipma = (assoc) => full('ipma', u32(assoc.length),
  ...assoc.map(([id, props]) => [...u16(id), props.length, ...props]));
const meta = (...children) => full('meta', ...children);
const iprp = (props, assoc) => box('iprp', box('ipco', ...props), ipma(assoc));
const buf = (...boxes) => new Uint8Array(flat(boxes)).buffer;

test('basic heic: ispe via ipma', () => {
  const b = buf(ftyp('heic', 'mif1'), meta(pitm(1), iprp([ispe(4032, 3024)], [[1, [1]]])));
  assert.deepEqual(parseHeicHeader(b), { brand: 'heic', width: 4032, height: 3024 });
});

test('irot 90deg swaps dimensions', () => {
  const b = buf(ftyp('heic'), meta(pitm(1), iprp([ispe(4032, 3024), irot(1)], [[1, [1, 2]]])));
  const r = parseHeicHeader(b);
  assert.equal(r.width, 3024);
  assert.equal(r.height, 4032);
});

test('irot 180deg does not swap', () => {
  const b = buf(ftyp('heic'), meta(pitm(1), iprp([ispe(4032, 3024), irot(2)], [[1, [1, 2]]])));
  const r = parseHeicHeader(b);
  assert.equal(r.width, 4032);
  assert.equal(r.height, 3024);
});

test('thumbnail item ignored when primary is item 1', () => {
  const b = buf(ftyp('heic'), meta(pitm(1),
    iprp([ispe(4032, 3024), ispe(320, 240)], [[1, [1]], [2, [2]]])));
  const r = parseHeicHeader(b);
  assert.equal(r.width, 4032);
  assert.equal(r.height, 3024);
});

test('primary item 2 uses its own ispe', () => {
  const b = buf(ftyp('heic'), meta(pitm(2),
    iprp([ispe(320, 240), ispe(4032, 3024)], [[1, [1]], [2, [2]]])));
  const r = parseHeicHeader(b);
  assert.equal(r.width, 4032);
  assert.equal(r.height, 3024);
});

test('mif1 major with heic compatible brand parses', () => {
  const b = buf(ftyp('mif1', 'miaf', 'heic'), meta(pitm(1), iprp([ispe(100, 50)], [[1, [1]]])));
  const r = parseHeicHeader(b);
  assert.equal(r.width, 100);
  assert.equal(r.height, 50);
});

test('avif and mp4 brands return null', () => {
  const m = meta(pitm(1), iprp([ispe(100, 50)], [[1, [1]]]));
  assert.equal(parseHeicHeader(buf(ftyp('avif', 'mif1'), m)), null);
  assert.equal(parseHeicHeader(buf(ftyp('mp42', 'isom'), m)), null);
});

test('truncated and empty buffers return null', () => {
  const b = buf(ftyp('heic'), meta(pitm(1), iprp([ispe(4032, 3024)], [[1, [1]]])));
  assert.equal(parseHeicHeader(new ArrayBuffer(0)), null);
  for (const n of [3, 10, 30, 50, b.byteLength - 5]) {
    assert.doesNotThrow(() => parseHeicHeader(b.slice(0, n)));
  }
  assert.equal(parseHeicHeader(b.slice(0, 30)), null);
});

test('isHeicFile', () => {
  assert.equal(isHeicFile({ name: 'x', type: 'image/heic' }), true);
  assert.equal(isHeicFile({ name: 'x', type: 'image/heif' }), true);
  assert.equal(isHeicFile({ name: 'x', type: 'image/heic-sequence' }), true);
  assert.equal(isHeicFile({ name: 'a.HEIC', type: '' }), true);
  assert.equal(isHeicFile({ name: 'a.hif', type: 'application/octet-stream' }), true);
  assert.equal(isHeicFile({ name: 'a.heic', type: 'image/jpeg' }), false);
  assert.equal(isHeicFile({ name: 'a.png', type: 'image/png' }), false);
});
