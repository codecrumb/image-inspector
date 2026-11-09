import { readUint16BE } from '../util.js';
import { showImageResults } from '../analyze-image.js';

// ── Bit depth parser ──────────────────────────────────────────────────────
export function parseBitDepth(buffer, mime) {
  const view = new DataView(buffer);

  if (mime === 'image/png') {
    // PNG signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4) + bitDepth (1) + colorType (1)
    if (buffer.byteLength < 26) return null;
    const bits = view.getUint8(24);
    const colorType = view.getUint8(25);
    const channelMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const channels = channelMap[colorType];
    const typeLabel = { 0: 'Grayscale', 2: 'RGB', 3: 'Indexed', 4: 'Grayscale+Alpha', 6: 'RGBA' }[colorType] ?? 'Unknown';
    const note = channels ? `${bits} bits/channel · ${typeLabel} (${bits * channels} bits/px)` : `${bits} bits/channel · ${typeLabel}`;
    return { label: `${bits}-bit`, note };
  }

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    // Walk JPEG segments for any SOF marker to read sample precision
    if (buffer.byteLength < 4 || readUint16BE(view, 0) !== 0xFFD8) return null;
    let offset = 2;
    while (offset + 4 <= buffer.byteLength) {
      if (view.getUint8(offset) !== 0xFF) break;
      const marker = readUint16BE(view, offset);
      if (marker === 0xFFD9 || marker === 0xFFDA) break;
      if (marker === 0xFFD8 || (marker >= 0xFFD0 && marker <= 0xFFD7)) { offset += 2; continue; }
      const segLen = readUint16BE(view, offset + 2);
      const lo = marker & 0xFF;
      // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF (exclude C4=DHT, C8=JPEG ext, CC=DAC)
      if (lo >= 0xC0 && lo <= 0xCF && lo !== 0xC4 && lo !== 0xC8 && lo !== 0xCC) {
        const bits = view.getUint8(offset + 4);
        return { label: `${bits}-bit`, note: `${bits} bits per channel (from SOF segment)` };
      }
      offset += 2 + segLen;
    }
    return null;
  }

  return null;
}

// ── PSD / PSB header parser ───────────────────────────────────────────────
function parsePSDHeader(buffer) {
  if (buffer.byteLength < 26) return null;
  const view = new DataView(buffer);
  const sig = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (sig !== '8BPS') return null;
  const version  = view.getUint16(4, false); // 1=PSD, 2=PSB
  const channels = view.getUint16(12, false);
  const height   = view.getUint32(14, false);
  const width    = view.getUint32(18, false);
  const depth    = view.getUint16(22, false);
  const colorMode = view.getUint16(24, false);
  const modeLabels = { 0:'Bitmap', 1:'Grayscale', 2:'Indexed Color', 3:'RGB', 4:'CMYK',
                       7:'Multichannel', 8:'Duotone', 9:'Lab Color' };
  const modeLabel = modeLabels[colorMode] ?? `Mode ${colorMode}`;
  const bitsPerPx = depth * channels;
  return {
    version, width, height, channels, depth, colorMode, modeLabel,
    bitDepthInfo: { label: `${depth}-bit`, note: `${depth} bits/channel · ${modeLabel} · ${channels} ch (${bitsPerPx} bits/px)` },
    dpiInfo: null,
  };
}

export function analyzePSD(file, onDone = null) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target.result;
    const psd = parsePSDHeader(buffer);
    if (!psd) {
      if (onDone) onDone(null); else alert('Could not read PSD header.');
      return;
    }
    const emptyVisualData = { palette: [], avgColor: null, histR: new Array(256).fill(0),
                              histG: new Array(256).fill(0), histB: new Array(256).fill(0),
                              histL: new Array(256).fill(0) };
    const _args = [file, null, psd.width, psd.height, psd.dpiInfo, [], emptyVisualData,
                   buffer, null, psd.bitDepthInfo, null];
    if (onDone) onDone(_args); else showImageResults(..._args);
  };
  reader.readAsArrayBuffer(file);
}
