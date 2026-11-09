import { state } from './state.js';
import { findJPEGAppendedOffset, findPNGAppendedOffset, parseZIPEntries, sniffDataType } from './stego-scan.js';
import { formatBytes, makeDownloadBtn } from './util.js';

// ── Steganography hint ────────────────────────────────────────────────────
export function checkSteganography(file, w, h) {
  const bpp = file.size / (w * h);
  const fmt = file.type.toLowerCase();
  const thresholds = {
    'image/jpeg': { t: 2.0, typical: 'typical JPEG is under 0.5' },
    'image/jpg':  { t: 2.0, typical: 'typical JPEG is under 0.5' },
    'image/png':  { t: 4.5, typical: 'typical PNG is under 4' },
    'image/webp': { t: 1.5, typical: 'typical WebP is under 0.5' },
    'image/avif': { t: 1.0, typical: 'typical AVIF is under 0.3' },
  };
  const warning = document.getElementById('stegoWarning');
  const detail  = document.getElementById('stegoDetail');
  const entry = thresholds[fmt];
  if (entry && bpp > entry.t) {
    detail.textContent = `${bpp.toFixed(2)} bytes/px — ${entry.typical}. Could indicate embedded data, very high quality export, or large metadata (e.g. ICC profile, EXIF).`;
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}



export function runAppendedDataScan() {
  if (!state.currentBuffer) return;
  const view = new DataView(state.currentBuffer);
  const mime = state.currentMime;
  let appendOffset = null;
  if (mime === 'image/png') appendOffset = findPNGAppendedOffset(state.currentBuffer);
  else if (mime === 'image/jpeg' || mime === 'image/jpg') appendOffset = findJPEGAppendedOffset(state.currentBuffer);

  const result = document.getElementById('scanResult');
  const scanSection = document.getElementById('stegoScanSection');
  if (appendOffset === null) {
    scanSection.classList.add('hidden');
    return;
  } else {
    const appendedBytes = state.currentBuffer.byteLength - appendOffset;
    const type = sniffDataType(view, appendOffset, appendedBytes);

    const extMap = {
      'ZIP archive': 'zip', 'RAR archive': 'rar', 'JPEG image': 'jpg',
      'PNG image': 'png', 'PDF document': 'pdf', 'GIF image': 'gif',
      'plain text': 'txt', 'unknown binary': 'bin'
    };
    const ext = extMap[type] ?? 'bin';
    const dlBtn = makeDownloadBtn(state.currentBuffer, appendOffset, appendedBytes, ext);

    let previewHtml = '';
    if (type === 'plain text') {
      const slice = new Uint8Array(state.currentBuffer, appendOffset, Math.min(appendedBytes, 8192));
      const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      const truncated = appendedBytes > 8192;
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      previewHtml = `
        <div class="mt-2">
          <button class="text-xs text-blue-500 dark:text-blue-400 hover:underline" onclick="this.nextElementSibling.classList.toggle('hidden');this.textContent=this.nextElementSibling.classList.contains('hidden')?'Show content':'Hide content'">Show content</button>
          <div class="hidden mt-2">
            <pre class="text-xs bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono">${escaped}</pre>
            ${truncated ? `<p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Showing first 8 KB of ${formatBytes(appendedBytes)}.</p>` : ''}
          </div>
        </div>`;
    } else if (type === 'ZIP archive') {
      const entries = parseZIPEntries(view, appendOffset, appendedBytes);
      if (entries.length > 0) {
        const rows = entries.map(e =>
          `<li class="flex justify-between gap-4"><span class="font-mono truncate">${e.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span><span class="text-gray-400 dark:text-gray-500 shrink-0">${formatBytes(e.uncompressedSize)}</span></li>`
        ).join('');
        previewHtml = `<ul class="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300">${rows}</ul>`;
      }
    } else {
      const hexBytes = Math.min(appendedBytes, 64);
      let hex = '';
      for (let i = 0; i < hexBytes; i++) hex += view.getUint8(appendOffset + i).toString(16).padStart(2, '0') + ' ';
      previewHtml = `
        <div class="mt-2">
          <button class="text-xs text-blue-500 dark:text-blue-400 hover:underline" onclick="this.nextElementSibling.classList.toggle('hidden');this.textContent=this.nextElementSibling.classList.contains('hidden')?'Show hex preview':'Hide hex preview'">Show hex preview</button>
          <div class="hidden mt-2">
            <pre class="text-xs bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-32 overflow-auto font-mono break-all">${hex.trimEnd()}</pre>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">First ${hexBytes} bytes of ${formatBytes(appendedBytes)}.</p>
          </div>
        </div>`;
    }

    result.innerHTML = `<p class="text-red-600 dark:text-red-400 font-medium">⚠ ${formatBytes(appendedBytes)} of ${type} found after image end marker (byte offset ${appendOffset.toLocaleString()}).</p>${previewHtml}${dlBtn}`;
  }
}
