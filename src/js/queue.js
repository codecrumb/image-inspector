import { state } from './state.js';
import { analyzePSD } from './parsers/image-format.js';
import { analyzeImage, showImageResults } from './analyze-image.js';
import { analyzeVideo, showVideoResults } from './analyze-video.js';
import { cacheFile, ssSaveQueueId } from './opfs-cache.js';


// ── File routing ──────────────────────────────────────────────────────────
function analyzeFile(file, sourceUrl = null, onDone = null) {
  if (!file) return;
  state.currentSourceUrl = sourceUrl;
  const psdMimes = ['image/vnd.adobe.photoshop', 'image/x-photoshop', 'image/photoshop', 'application/x-photoshop', 'application/photoshop'];
  const looksLikePSD = psdMimes.includes(file.type.toLowerCase()) || /\.ps[db]$/i.test(file.name);
  if (looksLikePSD) analyzePSD(file, onDone);
  else if (file.type.startsWith('image/')) analyzeImage(file, onDone);
  else if (file.type.startsWith('video/')) analyzeVideo(file, onDone);
}

// ── Batch queue ───────────────────────────────────────────────────────────
export function queueFiles(files, sourceUrl = null, existingCacheIds = null) {
  const firstNewIdx = state.imageQueue.length;
  Array.from(files).forEach((file, i) => {
    const slot = { file, sourceUrl, cacheId: existingCacheIds ? existingCacheIds[i] : null, status: 'analyzing', result: null };
    const idx  = state.imageQueue.length;
    state.imageQueue.push(slot);

    // Cache to OPFS (fire-and-forget); skip if slot already has an id (restore path)
    if (!slot.cacheId) {
      cacheFile(file).then(id => { if (id) slot.cacheId = id; }).catch(() => {});
    }

    analyzeFile(file, sourceUrl, (args) => {
      slot.status = 'done';
      slot.result = { type: file.type.startsWith('video/') ? 'video' : 'image', args };
      if (state.queueIndex === idx) navigateTo(idx);
      updateQueueNav();
    });
  });
  if (state.imageQueue.length > 0) navigateTo(firstNewIdx);
  updateQueueNav();
}

export function navigateTo(index) {
  if (index < 0 || index >= state.imageQueue.length) return;
  state.queueIndex = index;
  ssSaveQueueId(state.imageQueue[index].cacheId);
  const slot    = state.imageQueue[index];
  const loading = document.getElementById('queueLoading');
  if (slot.status === 'analyzing') {
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('queueLoadingName').textContent = slot.file.name;
    loading.classList.remove('hidden');
  } else if (slot.status === 'done') {
    loading.classList.add('hidden');
    const { type, args } = slot.result;
    if (type === 'image') {
      // args[1] is the blob URL, which may have been revoked when we last navigated away.
      // Recreate it from the still-valid File object (args[0]).
      if (args[1]) URL.revokeObjectURL(args[1]);
      args[1] = args[0] ? URL.createObjectURL(args[0]) : null;
      showImageResults(...args);
    } else {
      showVideoResults(...args);
    }
  }
  updateQueueNav();
}

function updateQueueNav() {
  const nav = document.getElementById('queueNav');
  if (!nav) return;
  if (state.imageQueue.length < 2) { nav.classList.add('hidden'); return; }
  nav.classList.remove('hidden');
  document.getElementById('queueCounter').textContent  = `${state.queueIndex + 1} / ${state.imageQueue.length}`;
  document.getElementById('queueFileName').textContent = state.imageQueue[state.queueIndex]?.file.name ?? '';
  document.getElementById('queuePrev').disabled = state.queueIndex <= 0;
  document.getElementById('queueNext').disabled = state.queueIndex >= state.imageQueue.length - 1;
}
