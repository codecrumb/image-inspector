import test from 'node:test';
import assert from 'node:assert/strict';
import { extractExifSegment, sanitizeExifSegment, injectExifSegment } from '../src/js/parsers/jpeg-exif.js';

const THUMB = [0xff, 0xd8, 0xaa, 0xbb];

// TIFF: header, IFD0 {orientation, ifd1 link}, IFD1 {0x0201, 0x0202}, thumbnail
function buildExif(le, orientation = 6, withThumb = true, { short = false, noLen = false, noStart = false } = {}) {
  const tiff = new Uint8Array(8 + 2 + 12 + 4 + 2 + 24 + 4 + THUMB.length);
  const v = new DataView(tiff.buffer);
  tiff.set([le ? 0x49 : 0x4d, le ? 0x49 : 0x4d]);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  v.setUint16(8, 1, le);
  v.setUint16(10, 0x0112, le); v.setUint16(12, 3, le); v.setUint32(14, 1, le); v.setUint16(18, orientation, le);
  const ifd1 = 8 + 2 + 12 + 4;
  v.setUint32(22, withThumb ? ifd1 : 0, le);
  const thumbOff = ifd1 + 2 + 24 + 4;
  v.setUint16(ifd1, 2, le);
  v.setUint16(ifd1 + 2, noStart ? 0x0213 : 0x0201, le); v.setUint16(ifd1 + 4, short ? 3 : 4, le); v.setUint32(ifd1 + 6, 1, le); if (short) v.setUint16(ifd1 + 10, thumbOff, le); else v.setUint32(ifd1 + 10, thumbOff, le);
  v.setUint16(ifd1 + 14, noLen ? 0x0213 : 0x0202, le); v.setUint16(ifd1 + 16, 4, le); v.setUint32(ifd1 + 18, 1, le); v.setUint32(ifd1 + 22, noLen ? 0 : THUMB.length, le);
  tiff.set(THUMB, thumbOff);
  const body = new Uint8Array(6 + tiff.length);
  body.set([0x45, 0x78, 0x69, 0x66, 0, 0]);
  body.set(tiff, 6);
  const seg = new Uint8Array(4 + body.length);
  seg.set([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  seg.set(body, 4);
  return seg;
}

const SOI = [0xff, 0xd8];
const JFIF = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
const REST = [0xff, 0xdb, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9];
const bare = () => new Uint8Array([...SOI, ...REST]);
const withExif = (seg, jfif = false) => new Uint8Array([...SOI, ...(jfif ? JFIF : []), ...seg, ...REST]);

function orientationOf(seg, le) {
  const v = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  return v.getUint16(4 + 6 + 18, le);
}
const countExif = (j) => {
  let n = 0;
  for (let i = 2; i + 10 < j.length;) {
    if (j[i] !== 0xff) break;
    const len = (j[i + 2] << 8) | j[i + 3];
    if (j[i + 1] === 0xe1 && j[i + 4] === 0x45 && j[i + 5] === 0x78) n++;
    if (j[i + 1] === 0xda) break;
    i += 2 + len;
  }
  return n;
};

test('extractExifSegment: null without EXIF, segment with', () => {
  assert.equal(extractExifSegment(bare()), null);
  const seg = buildExif(true);
  assert.deepEqual(extractExifSegment(withExif(seg, true)), seg);
});

test('extractExifSegment: malformed input returns null', () => {
  assert.equal(extractExifSegment(new Uint8Array([1, 2, 3])), null);
  assert.equal(extractExifSegment(new Uint8Array([...SOI, 0xff, 0xe1, 0xff, 0xff, 0x45])), null);
  assert.equal(extractExifSegment(new Uint8Array(0)), null);
});

for (const le of [true, false]) {
  const name = le ? 'II' : 'MM';
  test(`sanitizeExifSegment (${name}): orientation 1, IFD1 link 0, thumbnail zeroed`, () => {
    const seg = buildExif(le, 6);
    assert.equal(orientationOf(seg, le), 6);
    const out = sanitizeExifSegment(seg);
    assert.notEqual(out, seg);
    assert.equal(orientationOf(out, le), 1);
    assert.equal(new DataView(out.buffer).getUint32(4 + 6 + 22, le), 0);
    assert.ok(!out.includes(0xaa) && !out.includes(0xbb));
    assert.ok(seg.includes(0xaa), 'input not mutated');
    assert.equal(out.length, seg.length);
  });
}

test('sanitizeExifSegment: out-of-range thumbnail offset does not throw', () => {
  const seg = buildExif(true);
  new DataView(seg.buffer).setUint32(10 + 34, 0xfffffff0, true);
  assert.ok(sanitizeExifSegment(seg));
});

test('sanitizeExifSegment: malformed segments return null', () => {
  const bad = (fn) => { const s = buildExif(true); fn(s, new DataView(s.buffer)); return sanitizeExifSegment(s); };
  assert.equal(bad((s) => { s[10] = 0x58; s[11] = 0x58; }), null);
  assert.equal(bad((s, v) => v.setUint16(12, 43, true)), null);
  assert.equal(bad((s, v) => v.setUint32(14, 0xffffff, true)), null);
  assert.equal(bad((s, v) => v.setUint16(18, 0xffff, true)), null);
  assert.equal(bad((s, v) => v.setUint32(10 + 22, 0xffffff, true)), null);
  assert.equal(sanitizeExifSegment(new Uint8Array([0xff, 0xe1, 0, 8, 0x45, 0x78, 0x69, 0x66, 0, 0, 1])), null);
  assert.equal(sanitizeExifSegment(null), null);
});

test('sanitizeExifSegment: missing length tag zeroes from thumbnail start', () => {
  for (const le of [true, false]) {
    const out = sanitizeExifSegment(buildExif(le, 6, true, { noLen: true }));
    assert.ok(!out.includes(0xaa) && !out.includes(0xbb));
  }
});

test('sanitizeExifSegment: SHORT-typed offset in MM order', () => {
  const out = sanitizeExifSegment(buildExif(false, 6, true, { short: true }));
  assert.ok(!out.includes(0xaa) && !out.includes(0xbb));
});

test('injectExifSegment: round-trips and replaces existing', () => {
  const seg = buildExif(false);
  const once = injectExifSegment(bare(), seg);
  assert.deepEqual(extractExifSegment(once), seg);
  const twice = injectExifSegment(once, seg);
  assert.equal(countExif(twice), 1);
  assert.deepEqual(twice, once);
});

test('injectExifSegment: goes after JFIF APP0; non-JPEG unchanged', () => {
  const seg = buildExif(true);
  const jf = new Uint8Array([...SOI, ...JFIF, ...REST]);
  const out = injectExifSegment(jf, seg);
  assert.deepEqual([...out.slice(0, 2 + JFIF.length)], [...SOI, ...JFIF]);
  assert.deepEqual(extractExifSegment(out), seg);
  const png = new Uint8Array([0x89, 0x50]);
  assert.equal(injectExifSegment(png, seg), png);
});

test('injectExifSegment: invalid or oversize segment returns a copy of the jpeg', () => {
  const j = bare();
  for (const seg of [null, new Uint8Array(20), Uint8Array.from({ length: 65538 }, (_, i) => buildExif(true)[i] ?? 0)]) {
    const out = injectExifSegment(j, seg);
    assert.deepEqual(out, j);
    assert.notEqual(out, j);
  }
});

test('sanitizeExifSegment: IFD1 without a JPEG thumbnail pointer fails closed', () => {
  for (const le of [true, false]) assert.equal(sanitizeExifSegment(buildExif(le, 6, true, { noStart: true })), null);
  assert.ok(sanitizeExifSegment(buildExif(true, 6, false)), 'no IFD1 still fine');
});
