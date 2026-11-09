import { state } from './state.js';

// ── Blur & Download (built lazily on first use) ───────────────────────────
function openBlurTool() {
  const src = document.getElementById('preview')._prevURL;
  if (!src || document.getElementById('blurModal')) return;
  const MAX = 4096;
  const origName = (state.imageQueue[state.queueIndex]?.file.name || 'image').replace(/\.[^.]+$/, '');
  const outType = /^image\/(jpeg|png|webp)$/.test(state.currentMime) ? state.currentMime : 'image/png';
  const outExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[outType];

  const modal = document.createElement('div');
  modal.id = 'blurModal';
  modal.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden" role="dialog" aria-label="Blur and download">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Blur &amp; Download</span>
        <button data-x class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none px-1" aria-label="Close">&times;</button>
      </div>
      <div class="flex-1 min-h-0 flex items-center justify-center bg-gray-50 dark:bg-gray-700 p-3">
        <canvas data-cv class="max-w-full max-h-[50vh] rounded shadow touch-none"></canvas>
      </div>
      <div class="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
        <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-sm">
          <button data-mode="all" class="flex-1 py-1.5 font-medium">Whole image</button>
          <button data-mode="brush" class="flex-1 py-1.5 font-medium">Paint areas</button>
        </div>
        <label class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span class="w-16">Strength</span>
          <input data-str type="range" min="1" max="100" value="40" class="flex-1 accent-indigo-500" />
        </label>
        <label data-brushrow class="hidden items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span class="w-16">Brush</span>
          <input data-brush type="range" min="2" max="30" value="10" class="flex-1 accent-indigo-500" />
          <button data-clear class="underline hover:text-gray-700 dark:hover:text-gray-200">Clear</button>
        </label>
        <p class="text-[11px] text-gray-400 dark:text-gray-500">Saved copy has metadata (EXIF, GPS) removed.</p>
        <button data-dl class="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">Download</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const $ = (q) => modal.querySelector(q);
  const cv = $('[data-cv]'), ctx = cv.getContext('2d');
  let base, blurred, mask, mctx, mode = 'all', drawing = false, raf = 0, strT = 0;

  const close = () => { cancelAnimationFrame(raf); clearTimeout(strT); document.removeEventListener('keydown', onKey); modal.remove(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('[data-x]').onclick = close;
  modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });

  const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const hasFilter = 'filter' in CanvasRenderingContext2D.prototype;

  function makeBlur() {
    const w = base.width, h = base.height;
    const r = $('[data-str]').value / 100 * Math.max(w, h) * 0.03;
    blurred = mk(w, h);
    const b = blurred.getContext('2d');
    if (hasFilter) {
      // draw oversized so edges don't fade to transparent
      const pad = Math.ceil(r * 2);
      b.filter = `blur(${r}px)`;
      b.drawImage(base, -pad, -pad, w + pad * 2, h + pad * 2);
    } else {
      const f = Math.max(1, r), t = mk(Math.max(1, Math.round(w / f)), Math.max(1, Math.round(h / f)));
      const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high';
      tc.drawImage(base, 0, 0, t.width, t.height);
      b.imageSmoothingQuality = 'high';
      b.drawImage(t, 0, 0, w, h);
    }
    render();
  }

  function render() {
    const w = base.width, h = base.height;
    ctx.clearRect(0, 0, w, h);
    if (mode === 'all') { ctx.drawImage(blurred, 0, 0); return; }
    ctx.drawImage(base, 0, 0);
    const t = mk(w, h), tc = t.getContext('2d');
    tc.drawImage(blurred, 0, 0);
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(mask, 0, 0);
    ctx.drawImage(t, 0, 0);
  }
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };

  function setMode(m) {
    mode = m;
    modal.querySelectorAll('[data-mode]').forEach(b => {
      const on = b.dataset.mode === m;
      b.className = 'flex-1 py-1.5 font-medium ' + (on ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700');
    });
    const row = $('[data-brushrow]');
    row.classList.toggle('hidden', m !== 'brush');
    row.classList.toggle('flex', m === 'brush');
    cv.style.cursor = m === 'brush' ? 'crosshair' : 'default';
    if (base) render();
  }
  modal.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  setMode('all');

  $('[data-str]').oninput = () => { clearTimeout(strT); strT = setTimeout(makeBlur, 60); };
  $('[data-clear]').onclick = () => { mctx.clearRect(0, 0, mask.width, mask.height); render(); };

  let last = null;
  function stroke(e) {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * cv.width / r.width, y = (e.clientY - r.top) * cv.height / r.height;
    mctx.lineCap = mctx.lineJoin = 'round';
    mctx.strokeStyle = '#000';
    mctx.lineWidth = $('[data-brush]').value / 100 * Math.max(mask.width, mask.height) * 0.5;
    mctx.beginPath(); mctx.moveTo(...(last || [x, y])); mctx.lineTo(x, y); mctx.stroke();
    last = [x, y]; schedule();
  }
  cv.addEventListener('pointerdown', (e) => {
    if (mode !== 'brush') return;
    drawing = true; last = null; cv.setPointerCapture(e.pointerId); stroke(e);
  });
  cv.addEventListener('pointermove', (e) => { if (drawing) stroke(e); });
  const end = () => { drawing = false; last = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  $('[data-dl]').onclick = () => {
    render();
    cv.toBlob((blob) => {
      if (!blob) return alert('Could not export image.');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${origName}-blurred.${outExt}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, outType, 0.92);
  };

  const img = new Image();
  img.onload = () => {
    const sc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
    base = mk(w, h);
    base.getContext('2d').drawImage(img, 0, 0, w, h);
    cv.width = w; cv.height = h;
    mask = mk(w, h); mctx = mask.getContext('2d');
    makeBlur();
  };
  img.onerror = () => { close(); alert('Could not load image.'); };
  img.src = src;
}
document.getElementById('blurBtn').addEventListener('click', openBlurTool);
