import { readString } from '../util.js';

// ── MP4 frame rate parser (unchanged) ─────────────────────────────────────
export function parseMP4FrameRate(buffer) {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  function findBox(offset, end, type) {
    while (offset + 8 <= end) {
      const size = view.getUint32(offset, false);
      const t = readString(view, offset + 4, 4);
      if (size < 8 || offset + size > end) break;
      if (t === type) return { data: offset + 8, end: offset + size };
      offset += size;
    }
    return null;
  }
  try {
    const moov = findBox(0, len, 'moov');
    if (!moov) return null;
    let off = moov.data;
    while (off + 8 <= moov.end) {
      const size = view.getUint32(off, false);
      const type = readString(view, off + 4, 4);
      if (size < 8) break;
      if (type === 'trak') {
        const mdia = findBox(off + 8, off + size, 'mdia');
        if (mdia) {
          const hdlr = findBox(mdia.data, mdia.end, 'hdlr');
          if (hdlr && readString(view, hdlr.data + 8, 4) === 'vide') {
            const mdhd = findBox(mdia.data, mdia.end, 'mdhd');
            if (mdhd) {
              const version = view.getUint8(mdhd.data);
              const timescale = view.getUint32(mdhd.data + 4 + (version === 1 ? 16 : 8), false);
              if (!timescale) break;
              const minf = findBox(mdia.data, mdia.end, 'minf');
              if (minf) {
                const stbl = findBox(minf.data, minf.end, 'stbl');
                if (stbl) {
                  const stts = findBox(stbl.data, stbl.end, 'stts');
                  if (stts) {
                    const delta = view.getUint32(stts.data + 8, false);
                    if (delta > 0) return Math.round((timescale / delta) * 1000) / 1000;
                  }
                }
              }
            }
          }
        }
      }
      off += size;
    }
  } catch (_) {}
  return null;
}
