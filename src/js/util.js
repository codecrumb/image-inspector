// ── Shared utilities ──────────────────────────────────────────────────────
export function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}


export function makeDownloadBtn(buffer, offset, len, ext) {
  const blob = new Blob([new Uint8Array(buffer, offset, len)]);
  const url  = URL.createObjectURL(blob);
  return `<a href="${url}" download="appended_data.${ext}" class="inline-block mt-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Download .${ext}</a>`;
}

export function formatMimeType(mime) {
  const map = {
    'image/jpeg': 'JPEG', 'image/jpg': 'JPEG', 'image/png': 'PNG',
    'image/gif': 'GIF', 'image/webp': 'WebP', 'image/bmp': 'BMP',
    'image/tiff': 'TIFF', 'image/svg+xml': 'SVG', 'image/avif': 'AVIF',
    'image/heic': 'HEIC', 'image/heif': 'HEIF',
    'video/mp4': 'MP4', 'video/quicktime': 'MOV', 'video/webm': 'WebM',
    'video/x-msvideo': 'AVI', 'video/x-matroska': 'MKV',
    'video/ogg': 'OGG', 'video/3gpp': '3GP', 'video/x-ms-wmv': 'WMV',
  };
  return map[mime.toLowerCase()] ?? mime.replace(/^(image|video)\//, '').toUpperCase();
}

export function formatDuration(s) {
  if (!isFinite(s) || s < 0) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

export function formatBitrate(bytes, seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '—';
  const bps = (bytes * 8) / seconds;
  return bps >= 1e6 ? (bps / 1e6).toFixed(1) + ' Mbps' : Math.round(bps / 1e3) + ' Kbps';
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
export function aspectRatio(w, h) {
  if (!w || !h) return '—';
  const d = gcd(w, h);
  return `${w/d}:${h/d}`;
}

export function formatMegapixels(w, h) {
  const mp = (w * h) / 1_000_000;
  if (mp < 0.1) return mp.toFixed(3) + ' MP';
  if (mp < 10)  return mp.toFixed(2) + ' MP';
  return mp.toFixed(1) + ' MP';
}

export function readUint16BE(view, off) { return view.getUint16(off, false); }
export function readString(view, offset, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}
