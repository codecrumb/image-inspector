import './platform.js';
import './theme.js';
import './copy-feedback.js';
import './visual.js';
import './exif-render.js';
import './export.js';
import './lightbox.js';
import './input.js';
import './lens.js';
import './blur.js';
import './paste.js';
import { cleanupOPFS, loadFromOPFS, ssGetIds, ssGetQueueId, ssSetIds } from './opfs-cache.js';
import { navigateTo, queueFiles } from './queue.js';

// ── Restore cached images from OPFS on reload ──────────────────────────
(async function restoreFromOPFS() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('q')) return; // skip restore when loading from URL
  const ids = ssGetIds();
  if (!ids.length) { cleanupOPFS().catch(() => {}); return; }

  // Show spinner immediately so the drop zone never flashes in
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('results').classList.remove('hidden');
  document.getElementById('queueLoading').classList.remove('hidden');

  // Load all files in parallel
  const results = await Promise.all(ids.map(id => loadFromOPFS(id).then(file => ({ id, file }))));
  const valid = results.filter(r => r.file);
  ssSetIds(valid.map(r => r.id));

  if (valid.length) {
    queueFiles(valid.map(r => r.file), null, valid.map(r => r.id));
    // Restore last viewed position by cacheId (immune to partial eviction)
    const savedId = ssGetQueueId();
    const savedIdx = savedId ? valid.findIndex(r => r.id === savedId) : 0;
    navigateTo(savedIdx >= 0 ? savedIdx : 0);
  } else {
    // Nothing to restore — show drop zone again
    document.getElementById('dropzone').classList.remove('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('queueLoading').classList.add('hidden');
  }
  // Clean up stale OPFS entries from closed tabs
  cleanupOPFS().catch(() => {});
})();

// ── Load from ?q=<url> query parameter ────────────────────────────────────
(function () {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q');
  if (!q) return;
  const url = q;
  const fetchAndAnalyze = (fetchUrl) =>
    fetch(fetchUrl).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.startsWith('image/') && !ct.startsWith('video/')) throw new Error('Not an image or video URL');
      return res.blob().then((blob) => {
        const ext = url.split('?')[0].split('.').pop().toLowerCase();
        const mime = ct.split(';')[0].trim();
        const name = url.split('/').pop().split('?')[0] || `image.${ext}`;
        queueFiles([new File([blob], name, { type: mime })], url);
      });
    });
  fetchAndAnalyze(url)
    .catch(() => fetchAndAnalyze('https://corsproxy.io/?' + encodeURIComponent(url)))
    .catch(() => fetchAndAnalyze('https://images.weserv.nl/?url=' + encodeURIComponent(url)))
    .catch(() => {});
})();
