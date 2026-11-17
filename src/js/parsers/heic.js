// HEIC/HEIF container header parser (ISO-BMFF). Pure: no DOM, never throws.

const HEIC_TYPES = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']);
const HEIC_EXT = /\.(heic|heif|hif)$/i;
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis']);

export function isHeicFile(file) {
  const type = (file.type || '').toLowerCase();
  if (HEIC_TYPES.has(type)) return true;
  return (type === '' || type === 'application/octet-stream') && HEIC_EXT.test(file.name || '');
}

const fourcc = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

// Child boxes in [start, end): { type, body, end } (body = payload start).
function* boxes(v, start, end) {
  let o = start;
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    const type = fourcc(v, o + 4);
    let body = o + 8;
    if (size === 1) {
      if (o + 16 > end) return;
      const hi = v.getUint32(o + 8);
      if (hi > 0x1fffff) return;
      size = hi * 4294967296 + v.getUint32(o + 12);
      body = o + 16;
    } else if (size === 0) {
      size = end - o;
    }
    if (size < body - o || o + size > end) return;
    yield { type, body, end: o + size };
    o += size;
  }
}

function parse(buffer) {
  const v = new DataView(buffer);
  const len = v.byteLength;
  let brand = null, compatible = false, meta = null;
  for (const b of boxes(v, 0, len)) {
    if (b.type === 'ftyp') {
      if (b.end - b.body < 8) return null;
      brand = fourcc(v, b.body);
      compatible = HEIC_BRANDS.has(brand);
      for (let o = b.body + 8; o + 4 <= b.end; o += 4) {
        if (HEIC_BRANDS.has(fourcc(v, o))) compatible = true;
      }
    } else if (b.type === 'meta') {
      meta = b;
    }
    if (brand && meta) break;
  }
  if (!brand || !compatible || !meta) return null;

  let primary = null, ipco = null, ipma = null;
  for (const b of boxes(v, meta.body + 4, meta.end)) {
    if (b.type === 'pitm') {
      primary = v.getUint8(b.body) === 0 ? v.getUint16(b.body + 4) : v.getUint32(b.body + 4);
    } else if (b.type === 'iprp') {
      for (const c of boxes(v, b.body, b.end)) {
        if (c.type === 'ipco') ipco = c;
        else if (c.type === 'ipma') ipma = c;
      }
    }
  }
  if (primary === null || !ipco || !ipma) return null;

  // Property list, 1-based index.
  const props = [];
  for (const p of boxes(v, ipco.body, ipco.end)) props.push(p);

  // ipma: find the primary item's property indexes.
  const version = v.getUint8(ipma.body);
  const wide = (v.getUint8(ipma.body + 3) & 1) === 1;
  let o = ipma.body + 4;
  const count = v.getUint32(o); o += 4;
  let indexes = null;
  for (let i = 0; i < count; i++) {
    let id;
    if (version === 0) { id = v.getUint16(o); o += 2; } else { id = v.getUint32(o); o += 4; }
    const n = v.getUint8(o); o += 1;
    const list = [];
    for (let j = 0; j < n; j++) {
      if (wide) { list.push(v.getUint16(o) & 0x7fff); o += 2; } else { list.push(v.getUint8(o) & 0x7f); o += 1; }
    }
    if (id === primary) { indexes = list; break; }
  }
  if (!indexes) return null;

  let width = null, height = null, angle = 0;
  for (const idx of indexes) {
    const p = props[idx - 1];
    if (!p) continue;
    if (p.type === 'ispe' && p.end - p.body >= 12) {
      width = v.getUint32(p.body + 4);
      height = v.getUint32(p.body + 8);
    } else if (p.type === 'irot' && p.end - p.body >= 1) {
      angle = v.getUint8(p.body) & 3;
    }
  }
  if (!width || !height) return null;
  if (angle === 1 || angle === 3) [width, height] = [height, width];
  return { brand, width, height };
}

export function parseHeicHeader(buffer) {
  try {
    return parse(buffer);
  } catch {
    return null;
  }
}
