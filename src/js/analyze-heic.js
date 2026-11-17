import { parseHeicHeader } from './parsers/heic.js';
import { extractVisualData } from './parsers/visual-data.js';
import { loadHeicDecoder } from './heic-load.js';
import { EXPORT_MAX } from './platform.js';

const EMPTY_VISUAL = () => ({ palette: [], avgColor: null, histR: new Array(256).fill(0), histG: new Array(256).fill(0), histB: new Array(256).fill(0), histL: new Array(256).fill(0) });

// Phase 1 (instant): container header -> size, EXIF. Phase 2 (lazy decoder): decoded preview, palette, histogram.
export function analyzeHeic(file, onDone, onUpgrade) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target.result;
    const head = parseHeicHeader(buffer);
    if (!head) { onDone(null, 'Could not read this HEIC file.'); return; }
    const decoding = loadHeicDecoder().then(decode => decode(buffer));
    const args = (url, visual, state) => [file, url, head.width, head.height, null, [], visual, buffer, null, null, null, state];
    onDone(args(null, EMPTY_VISUAL(), 'decoding'));
    decoding.then(async ({ width, height, data }) => {
      const full = document.createElement('canvas');
      full.width = width; full.height = height;
      full.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0);
      const k = Math.min(1, EXPORT_MAX / Math.max(width, height));
      let canvas = full;
      if (k < 1) {
        canvas = document.createElement('canvas');
        canvas.width = Math.round(width * k); canvas.height = Math.round(height * k);
        canvas.getContext('2d').drawImage(full, 0, 0, canvas.width, canvas.height);
        full.width = full.height = 0;
      }
      const visual = extractVisualData(canvas);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error('encode failed');
      onUpgrade(args(null, visual, null), blob);
    }).catch((err) => { console.warn('HEIC preview failed:', err); onUpgrade(args(null, EMPTY_VISUAL(), err?.message === 'HEIC needs the hosted version' ? 'hosted-only' : 'unavailable'), null); });
  };
  reader.readAsArrayBuffer(file);
}
