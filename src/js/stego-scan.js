import { readString, readUint16BE } from './util.js';


export function findPNGAppendedOffset(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12) return null;
  if (view.getUint32(0, false) !== 0x89504E47) return null;
  let offset = 8;
  while (offset + 12 <= buffer.byteLength) {
    const len  = view.getUint32(offset, false);
    const type = readString(view, offset + 4, 4);
    const end  = offset + 12 + len;
    if (type === 'IEND') return end < buffer.byteLength ? end : null;
    if (end > buffer.byteLength) break;
    offset = end;
  }
  return null;
}

export function findJPEGAppendedOffset(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 4) return null;
  if (readUint16BE(view, 0) !== 0xFFD8) return null;
  let offset = 2;
  while (offset + 2 <= buffer.byteLength) {
    if (view.getUint8(offset) !== 0xFF) break;
    const marker = readUint16BE(view, offset);
    if (marker === 0xFFD9) {
      const end = offset + 2;
      return end < buffer.byteLength ? end : null;
    }
    if (marker === 0xFFD8 || (marker >= 0xFFD0 && marker <= 0xFFD7)) { offset += 2; continue; }
    if (offset + 4 > buffer.byteLength) break;
    offset += 2 + readUint16BE(view, offset + 2);
  }
  return null;
}

export function sniffDataType(view, offset, len) {
  const check = (bytes) => bytes.every((b, i) => view.getUint8(offset + i) === b);
  const checkStr = (s) => [...s].every((c, i) => view.getUint8(offset + i) === c.charCodeAt(0));
  if (len >= 4 && checkStr('PK\x03\x04')) return 'ZIP archive';
  if (len >= 4 && checkStr('Rar!')) return 'RAR archive';
  if (len >= 2 && readUint16BE(view, offset) === 0xFFD8) return 'JPEG image';
  if (len >= 4 && view.getUint32(offset, false) === 0x89504E47) return 'PNG image';
  if (len >= 4 && checkStr('%PDF')) return 'PDF document';
  if (len >= 4 && checkStr('GIF8')) return 'GIF image';
  const sample = Math.min(128, len);
  let printable = 0;
  for (let i = 0; i < sample; i++) {
    const b = view.getUint8(offset + i);
    if ((b >= 0x20 && b <= 0x7E) || b === 0x09 || b === 0x0A || b === 0x0D) printable++;
  }
  if (printable / sample > 0.85) return 'plain text';
  return 'unknown binary';
}

export function parseZIPEntries(view, startOffset, len) {
  const entries = [];
  let offset = startOffset;
  const end = startOffset + len;
  while (offset + 30 <= end) {
    if (view.getUint32(offset, true) !== 0x04034B50) break;
    const flags      = view.getUint16(offset + 6,  true);
    const compSize   = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    const fnLen      = view.getUint16(offset + 26, true);
    const extraLen   = view.getUint16(offset + 28, true);
    if (offset + 30 + fnLen > end) break;
    const name = new TextDecoder('utf-8', { fatal: false }).decode(
      new Uint8Array(view.buffer, offset + 30, fnLen)
    );
    entries.push({ name, compressedSize: compSize, uncompressedSize: uncompSize });
    // if data descriptor flag set and sizes are 0, we can't skip forward reliably
    if ((flags & 0x08) && compSize === 0) break;
    const next = offset + 30 + fnLen + extraLen + compSize;
    if (next <= offset || next > end) break;
    offset = next;
  }
  return entries;
}
