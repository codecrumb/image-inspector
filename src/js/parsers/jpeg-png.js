import { readString, readUint16BE } from '../util.js';

// ── JPEG Quality estimator ────────────────────────────────────────────────
export function parseJPEGQuality(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 4 || readUint16BE(view, 0) !== 0xFFD8) return null;
  let offset = 2;
  while (offset + 4 <= buffer.byteLength) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = readUint16BE(view, offset);
    if (marker === 0xFFD9 || marker === 0xFFDA) break;
    if (marker === 0xFFD8 || (marker >= 0xFFD0 && marker <= 0xFFD7)) { offset += 2; continue; }
    const segLen = readUint16BE(view, offset + 2);
    const segEnd = offset + 2 + segLen;
    if (marker === 0xFFDB) {
      let pos = offset + 4;
      while (pos + 1 <= segEnd) {
        const precId    = view.getUint8(pos++);
        const precision = (precId >> 4) & 0xF; // 0=8-bit, 1=16-bit
        const tableId   = precId & 0xF;
        const step      = precision === 0 ? 1 : 2;
        if (pos + 64 * step > segEnd) break;
        const first = precision === 0 ? view.getUint8(pos) : readUint16BE(view, pos);
        if (tableId === 0) {
          // Reverse libjpeg formula (base coeff = 16)
          const scale   = Math.round(first * 100 / 16);
          const quality = Math.min(100, Math.max(1,
            scale <= 100 ? Math.round((200 - scale) / 2) : Math.round(5000 / scale)
          ));
          return { label: `~${quality} / 100`, note: 'Estimated from luminance quantization table' };
        }
        pos += 64 * step;
      }
    }
    offset = segEnd;
  }
  return null;
}

// ── Image DPI parsers (unchanged) ─────────────────────────────────────────
export function parseJPEGDPI(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 4 || readUint16BE(view, 0) !== 0xFFD8) return null;
  let offset = 2;
  while (offset + 4 <= buffer.byteLength) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = readUint16BE(view, offset);
    if (marker === 0xFFD9 || marker === 0xFFDA) break;
    if (marker === 0xFFD8 || (marker >= 0xFFD0 && marker <= 0xFFD7)) { offset += 2; continue; }
    const segLen = readUint16BE(view, offset + 2);
    const segStart = offset + 4;
    if (marker === 0xFFE0) {
      const id = readString(view, segStart, 5);
      if (id === 'JFIF\0') {
        const units = view.getUint8(segStart + 7);
        const xd = readUint16BE(view, segStart + 8);
        const yd = readUint16BE(view, segStart + 10);
        if (xd > 0 || yd > 0) {
          if (units === 1) return { label: `${xd} × ${yd} DPI`, note: 'Source: JFIF APP0' };
          if (units === 2) return { label: `${Math.round(xd*2.54)} × ${Math.round(yd*2.54)} DPI`, note: 'Source: JFIF APP0 (converted from DPCM)' };
          return { label: `${xd} × ${yd} (no unit)`, note: 'Source: JFIF APP0 — unit unspecified' };
        }
      }
    } else if (marker === 0xFFE1) {
      const id = readString(view, segStart, 6);
      if (id === 'Exif\0\0') { const r = parseEXIFDPI(buffer, segStart + 6); if (r) return r; }
    }
    offset += 2 + segLen;
  }
  return null;
}

function parseEXIFDPI(buffer, tiffBase) {
  const view = new DataView(buffer);
  if (tiffBase + 8 > buffer.byteLength) return null;
  const le = readString(view, tiffBase, 2) === 'II';
  const r16 = (off) => view.getUint16(tiffBase + off, le);
  const r32 = (off) => view.getUint32(tiffBase + off, le);
  const rRat = (off) => { const n = view.getUint32(tiffBase+off,le), d = view.getUint32(tiffBase+off+4,le); return d===0?0:n/d; };
  if (r16(2) !== 42) return null;
  const ifdOffset = r32(4);
  const count = r16(ifdOffset);
  let xRes = null, yRes = null, unit = 2;
  for (let i = 0; i < count; i++) {
    const e = ifdOffset + 2 + i * 12;
    if (e + 12 > buffer.byteLength - tiffBase) break;
    const tag = r16(e), valOff = e + 8;
    if (tag === 0x011A) xRes = rRat(r32(valOff));
    else if (tag === 0x011B) yRes = rRat(r32(valOff));
    else if (tag === 0x0128) unit = r16(valOff);
  }
  if (xRes !== null && yRes !== null && (xRes > 0 || yRes > 0)) {
    if (unit === 2) return { label: `${Math.round(xRes)} × ${Math.round(yRes)} DPI`, note: 'Source: EXIF IFD0' };
    if (unit === 3) return { label: `${Math.round(xRes*2.54)} × ${Math.round(yRes*2.54)} DPI`, note: 'Source: EXIF IFD0 (converted from DPCM)' };
    return { label: `${Math.round(xRes)} × ${Math.round(yRes)} (no unit)`, note: 'Source: EXIF IFD0 — unit unspecified' };
  }
  return null;
}

export function parsePNGDPI(buffer) {
  const view = new DataView(buffer);
  let offset = 8;
  while (offset + 12 <= buffer.byteLength) {
    const length = view.getUint32(offset, false);
    const type = readString(view, offset + 4, 4);
    const d = offset + 8;
    if (type === 'pHYs') {
      const ppuX = view.getUint32(d, false), ppuY = view.getUint32(d+4, false);
      const unit = view.getUint8(d+8);
      if (unit === 1) return { label: `${Math.round(ppuX*0.0254)} × ${Math.round(ppuY*0.0254)} DPI`, note: 'Source: PNG pHYs chunk (converted from px/m)' };
      return { label: `${ppuX} × ${ppuY} (aspect only, no unit)`, note: 'Source: PNG pHYs chunk — unit unknown' };
    }
    if (type === 'IDAT' || type === 'IEND') break;
    offset += 12 + length;
  }
  return null;
}
