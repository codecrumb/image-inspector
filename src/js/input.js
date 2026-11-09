import { state } from './state.js';
import { lightboxEl, openLightbox } from './lightbox.js';
import { toggle } from './theme.js';
import { closeHistogramModal, openHistogramModal } from './visual.js';
import { navigateTo, queueFiles } from './queue.js';

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Skip when typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  // Skip modifier combos
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.getElementById('blurModal')) return;

  const resultsVisible = !document.getElementById('results').classList.contains('hidden');
  const lightboxOpen   = !lightboxEl.classList.contains('hidden');
  const histOpen       = !document.getElementById('histModal').classList.contains('hidden');

  switch (e.key.toLowerCase()) {
    case 't':
      toggle.click();
      break;
    case 'enter':
      if (resultsVisible && !lightboxOpen && !histOpen) {
        const preview = document.getElementById('preview');
        if (!preview.classList.contains('hidden')) openLightbox(preview);
      }
      break;
    case 'h':
      if (resultsVisible && !lightboxOpen) {
        histOpen ? closeHistogramModal() : openHistogramModal();
      }
      break;
    case 'e':
      if (resultsVisible && !lightboxOpen && !histOpen) {
        document.getElementById('exifToggle').click();
      }
      break;
    case 'c':
      if (resultsVisible && !lightboxOpen && !histOpen) {
        document.getElementById('exportBtn').click();
      }
      break;
    case 'o':
      if (!lightboxOpen && !histOpen) {
        document.getElementById('fileInput').click();
      }
      break;
    case 'arrowleft':
      if (state.imageQueue.length >= 2 && !lightboxOpen && !histOpen) {
        e.preventDefault();
        if (state.queueIndex > 0) navigateTo(state.queueIndex - 1);
      }
      break;
    case 'arrowright':
      if (state.imageQueue.length >= 2 && !lightboxOpen && !histOpen) {
        e.preventDefault();
        if (state.queueIndex < state.imageQueue.length - 1) navigateTo(state.queueIndex + 1);
      }
      break;
  }
});

document.getElementById('preview').addEventListener('click', function () {
  if (!this.classList.contains('hidden')) openLightbox(this);
});
document.getElementById('videoThumb').addEventListener('click', function () {
  openLightbox(this);
});
document.getElementById('queuePrev').addEventListener('click', () => {
  if (state.queueIndex > 0) navigateTo(state.queueIndex - 1);
});
document.getElementById('queueNext').addEventListener('click', () => {
  if (state.queueIndex < state.imageQueue.length - 1) navigateTo(state.queueIndex + 1);
});

// ── Input handlers ────────────────────────────────────────────────────────
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', () => { if (fileInput.files.length) queueFiles(fileInput.files); });
dropzone.addEventListener('click', (e) => { if (e.target === fileInput || e.target.closest('label') || e.target.closest('#pasteBtn')) return; fileInput.click(); });

// ── Full-page drag-and-drop ───────────────────────────────────────────────
const pageDropOverlay = document.getElementById('pageDropOverlay');
let dragDepth = 0;

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  pageDropOverlay.classList.remove('hidden');
  if (e.target === dropzone || dropzone.contains(e.target)) dropzone.classList.add('drop-active');
});
document.addEventListener('dragleave', () => {
  dragDepth--;
  if (dragDepth <= 0) {
    dragDepth = 0;
    pageDropOverlay.classList.add('hidden');
    dropzone.classList.remove('drop-active');
  }
});
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  pageDropOverlay.classList.add('hidden');
  dropzone.classList.remove('drop-active');
  const files = e.dataTransfer.files;
  if (files.length) queueFiles(files);
});
