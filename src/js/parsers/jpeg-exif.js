// JPEG EXIF segment helpers: pure byte manipulation, no DOM.
const isExif = (b, i) => b[i] === 0xff && b[i + 1] === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 &&
  b[i + 6] === 0x69 && b[i + 7] === 0x66 && b[i + 8] === 0 && b[i + 9] === 0;

// Walks marker segments before SOS; yields [offset, totalLength, marker]
function* segments(jpeg) {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return;
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
    const marker = jpeg[i + 1];
    if (marker === 0xda || marker === 0xd9) return;
    const total = 2 + ((jpeg[i + 2] << 8) | jpeg[i + 3]);
    if (total < 4 || i + total > jpeg.length) return;
    yield [i, total, marker];
    i += total;
  }
}

export function extractExifSegment(jpeg) {
  for (const [off, len] of segments(jpeg)) {
    if (len >= 18 && isExif(jpeg, off)) return jpeg.slice(off, off + len);
  }
  return null;
}

export function sanitizeExifSegment(seg) {
  const out = seg.slice();
  if (out.length < 22 || !isExif(out, 0)) return out;
  const t = 10, size = out.length - t;
  const v = new DataView(out.buffer, out.byteOffset + t, size);
  const bom = String.fromCharCode(out[t], out[t + 1]);
  if (bom !== 'II' && bom !== 'MM') return out;
  const le = bom === 'II';
  if (v.getUint16(2, le) !== 42) return out;
  const ifd0 = v.getUint32(4, le);
  if (ifd0 < 8 || ifd0 + 2 > size) return out;
  const n0 = v.getUint16(ifd0, le);
  const next0 = ifd0 + 2 + n0 * 12;
  if (next0 + 4 > size) return out;
  for (let i = 0; i < n0; i++) {
    const e = ifd0 + 2 + i * 12;
    if (v.getUint16(e, le) === 0x0112) v.setUint16(e + 8, 1, le);
  }
  const ifd1 = v.getUint32(next0, le);
  v.setUint32(next0, 0, le);
  if (ifd1 >= 8 && ifd1 + 2 <= size) {
    const n1 = v.getUint16(ifd1, le);
    let start = 0, length = 0;
    for (let i = 0; i < n1; i++) {
      const e = ifd1 + 2 + i * 12;
      if (e + 12 > size) break;
      const tag = v.getUint16(e, le);
      if (tag === 0x0201) start = v.getUint32(e + 8, le);
      else if (tag === 0x0202) length = v.getUint32(e + 8, le);
    }
    if (start > 0 && start < size) out.fill(0, t + start, t + Math.min(size, start + length));
  }
  return out;
}

export function injectExifSegment(jpeg, seg) {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const keep = [jpeg.subarray(0, 2)];
  let at = 2, pos = 2;
  for (const [off, len, marker] of segments(jpeg)) {
    if (marker === 0xe1 && isExif(jpeg, off)) {
      keep.push(jpeg.subarray(pos, off));
      pos = off + len;
    } else if (off === 2 && marker === 0xe0) at = off + len;
  }
  keep.push(jpeg.subarray(pos));
  const body = new Uint8Array(keep.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of keep) { body.set(part, p); p += part.length; }
  const out = new Uint8Array(body.length + seg.length);
  out.set(body.subarray(0, at));
  out.set(seg, at);
  out.set(body.subarray(at), at + seg.length);
  return out;
}
