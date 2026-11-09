import { readString, readUint16BE } from '../util.js';

// ── Full EXIF parser ──────────────────────────────────────────────────────
export function findJPEGEXIFBase(buffer) {
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
    if (marker === 0xFFE1 && readString(view, segStart, 6) === 'Exif\0\0') return segStart + 6;
    offset += 2 + segLen;
  }
  return null;
}

export function parseEXIFFull(buffer, tiffBase) {
  const view = new DataView(buffer);
  if (tiffBase + 8 > buffer.byteLength) return null;
  const le = readString(view, tiffBase, 2) === 'II';

  const r8  = (off) => view.getUint8(tiffBase + off);
  const r16 = (off) => view.getUint16(tiffBase + off, le);
  const r32 = (off) => view.getUint32(tiffBase + off, le);
  if (r16(2) !== 42) return null;

  const TYPE_SIZE = [0,1,1,2,4,8,1,1,2,4,8,4,8];

  function readVal(type, count, valOff) {
    if (type < 1 || type > 12) return null;
    const tsize = TYPE_SIZE[type];
    const totalSize = tsize * count;
    const dataOff = totalSize <= 4 ? valOff : r32(valOff);

    if (type === 2) { // ASCII
      let s = '';
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(tiffBase + dataOff + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim() || null;
    }
    if (type === 3) { // SHORT
      if (count === 1) return view.getUint16(tiffBase + dataOff, le);
      const a = [];
      for (let i = 0; i < count; i++) a.push(view.getUint16(tiffBase + dataOff + i*2, le));
      return a;
    }
    if (type === 4) { // LONG
      if (count === 1) return view.getUint32(tiffBase + dataOff, le);
      const a = [];
      for (let i = 0; i < count; i++) a.push(view.getUint32(tiffBase + dataOff + i*4, le));
      return a;
    }
    if (type === 5) { // RATIONAL
      const a = [];
      for (let i = 0; i < count; i++) {
        const n = view.getUint32(tiffBase + dataOff + i*8, le);
        const d = view.getUint32(tiffBase + dataOff + i*8 + 4, le);
        a.push(d === 0 ? 0 : n / d);
      }
      return count === 1 ? a[0] : a;
    }
    if (type === 9) return view.getInt32(tiffBase + dataOff, le);
    if (type === 10) { // SRATIONAL
      const n = view.getInt32(tiffBase + dataOff, le);
      const d = view.getInt32(tiffBase + dataOff + 4, le);
      return d === 0 ? 0 : n / d;
    }
    return null;
  }

  function readIFD(ifdOff) {
    const tags = {};
    if (ifdOff + 2 > buffer.byteLength - tiffBase) return tags;
    const count = r16(ifdOff);
    for (let i = 0; i < count; i++) {
      const e = ifdOff + 2 + i * 12;
      if (e + 12 > buffer.byteLength - tiffBase) break;
      const tag  = r16(e);
      const type = r16(e + 2);
      const cnt  = r32(e + 4);
      try { const v = readVal(type, cnt, e + 8); if (v !== null) tags[tag] = v; } catch (_) {}
    }
    return tags;
  }

  const ifd0 = readIFD(r32(4));
  const exifIfd = ifd0[0x8769] ? readIFD(ifd0[0x8769]) : {};
  const gpsIfd  = ifd0[0x8825] ? readIFD(ifd0[0x8825]) : {};
  return { ifd0, exifIfd, gpsIfd };
}

export function buildExifRows({ ifd0, exifIfd, gpsIfd }) {
  const rows = [];
  const add = (label, val) => { if (val != null && val !== '') rows.push([label, String(val)]); };

  // Camera
  const make  = ifd0[0x010F];
  const model = ifd0[0x0110];
  if (make || model) add('Camera', [make, model].filter(Boolean).join(' '));

  // Dates
  const dateOrig = exifIfd[0x9003] || ifd0[0x0132];
  if (dateOrig) add('Date Taken', String(dateOrig).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));

  // Exposure triangle
  const expTime = exifIfd[0x829A];
  const fNum    = exifIfd[0x829D];
  const iso     = exifIfd[0x8827];
  if (expTime != null || fNum != null || iso != null) {
    const parts = [];
    if (expTime != null) parts.push(expTime < 1 ? `1/${Math.round(1/expTime)}s` : `${expTime.toFixed(1)}s`);
    if (fNum    != null) parts.push(`f/${(typeof fNum === 'number' ? fNum : fNum[0]).toFixed(1)}`);
    if (iso     != null) parts.push(`ISO ${Array.isArray(iso) ? iso[0] : iso}`);
    add('Exposure', parts.join('  '));
  }

  // Focal length
  const fl   = exifIfd[0x920A];
  const fl35 = exifIfd[0xA405];
  if (fl != null) add('Focal Length', `${(typeof fl === 'number' ? fl : fl[0]).toFixed(1)}mm` + (fl35 ? ` (${fl35}mm equiv.)` : ''));

  // Flash
  const flash = exifIfd[0x9209];
  if (flash != null) add('Flash', (flash & 1) ? 'Fired' : 'Did not fire');

  // White balance
  const wb = exifIfd[0xA403];
  if (wb != null) add('White Balance', wb === 0 ? 'Auto' : 'Manual');

  // Metering
  const metering = { 0:'Unknown',1:'Average',2:'Center-weighted',3:'Spot',4:'Multi-spot',5:'Multi-segment',6:'Partial' };
  const met = exifIfd[0x9207];
  if (met != null && metering[met]) add('Metering', metering[met]);

  // Color space
  const cs = exifIfd[0xA001];
  if (cs != null) add('Color Space', cs === 1 ? 'sRGB' : cs === 0xFFFF ? 'Uncalibrated' : `${cs}`);

  // Orientation
  const orientLabels = {
    1:'Normal', 2:'Flipped Horizontal', 3:'Rotated 180°',
    4:'Flipped Vertical', 5:'Rotated 90° CW + Flipped',
    6:'Rotated 90° CW', 7:'Rotated 90° CCW + Flipped', 8:'Rotated 90° CCW'
  };
  const ov = ifd0[0x0112];
  if (ov != null && orientLabels[ov] && ov !== 1) add('Orientation', orientLabels[ov]);

  // Software / Artist / Copyright
  if (ifd0[0x0131]) add('Software',  ifd0[0x0131]);
  if (ifd0[0x013B]) add('Artist',    ifd0[0x013B]);
  if (ifd0[0x8298]) add('Copyright', ifd0[0x8298]);

  // GPS
  if (gpsIfd[0x0001] && gpsIfd[0x0002] && gpsIfd[0x0003] && gpsIfd[0x0004]) {
    const latRef = gpsIfd[0x0001], lat = gpsIfd[0x0002];
    const lonRef = gpsIfd[0x0003], lon = gpsIfd[0x0004];
    if (Array.isArray(lat) && Array.isArray(lon)) {
      const latDec = (lat[0] + lat[1]/60 + lat[2]/3600) * (latRef === 'S' ? -1 : 1);
      const lonDec = (lon[0] + lon[1]/60 + lon[2]/3600) * (lonRef === 'W' ? -1 : 1);
      add('GPS', `${latDec.toFixed(6)}, ${lonDec.toFixed(6)}`);
    }
  }

  return rows;
}
