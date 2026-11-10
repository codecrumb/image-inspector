import { state } from './state.js';
import { blurCanvas } from './blur-engine.js';
import { EFFECTS, effectLayer, setBlurImpl } from './effects.js';
import { findQualityForTarget } from './output.js';
import { describeMetadata } from './metadata-report.js';
import { formatBytes } from './util.js';
import { opDims, transformStrokes, clampCrop, applyOp, fitSize } from './geometry.js';
import { extractExifSegment, sanitizeExifSegment, injectExifSegment } from './parsers/jpeg-exif.js';

setBlurImpl(blurCanvas);
const FX_LABEL = { blur: 'Blur', pixelate: 'Pixelate', solid: 'Solid' };

// ── Blur & Download (built lazily on first use) ───────────────────────────
// The preview runs on a downscaled copy; strokes are stored in normalized coordinates and replayed
// at export size, so the saved file is blurred at full resolution without keeping big canvases alive.
const isTouch = matchMedia('(pointer: coarse)').matches;
const PREVIEW_MAX = 1600;
const EXPORT_MAX = isTouch ? 3072 : 4096; // phones run out of canvas memory above this

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
const release = (...cs) => cs.forEach(c => { if (c) c.width = c.height = 0; });

function openBlurTool() {
  const src = document.getElementById('preview')._prevURL;
  if (!src || document.getElementById('blurModal')) return;
  // The page can't change while the dialog is open, but snapshot anyway so an export never mixes in another photo's data.
  const srcBuf = state.currentBuffer, srcMime = state.currentMime, srcRows = state.currentExifRows, srcSize = state.imageQueue[state.queueIndex]?.file.size;
  const origName = (state.imageQueue[state.queueIndex]?.file.name || 'image').replace(/\.[^.]+$/, '');
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const webpOk = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); // Safari falls back to PNG
  let outType = EXT[srcMime] && (webpOk || srcMime !== 'image/webp') ? srcMime : 'image/png';

  const modal = document.createElement('div');
  modal.id = 'blurModal';
  modal.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden" role="dialog" aria-label="Blur and download">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Blur &amp; Download</span>
        <button data-x class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none px-1" aria-label="Close">&times;</button>
      </div>
      <div class="relative flex-1 min-h-[120px] flex items-center justify-center bg-gray-50 dark:bg-gray-700 p-3">
        <canvas data-cv class="max-w-full max-h-[45vh] rounded shadow touch-none"></canvas>
      </div>
      <div class="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700 overflow-y-auto min-h-0">
        <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-sm">
          <button data-mode="all" class="flex-1 py-1.5 font-medium">Whole image</button>
          <button data-mode="brush" class="flex-1 py-1.5 font-medium">Paint areas</button>
        </div>
        <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 text-sm">
          ${EFFECTS.map(f => `<button data-fx="${f}" class="flex-1 py-1.5 font-medium">${FX_LABEL[f]}</button>`).join('')}
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span class="w-16">Transform</span>
          <div class="flex flex-wrap gap-1.5 text-base leading-none">
            ${[['crop', 'Crop', 'Crop'], ['rotl', '↺', 'Rotate left'], ['rotr', '↻', 'Rotate right'], ['flipx', '⇆', 'Mirror'], ['flipy', '⇅', 'Flip vertically']].map(([k, g, t]) =>
              `<button data-${k} title="${t}" aria-label="${t}" class="${k === 'crop' ? 'px-2.5 text-sm' : 'w-9'} py-1.5 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">${g}</button>`).join('')}
            <button data-tundo title="Undo" aria-label="Undo" disabled class="px-2.5 text-sm py-1.5 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">Undo</button>
          </div>
        </div>
        <div data-croprow class="hidden items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span data-cropinfo class="flex-1 min-w-0">Drag on the picture to choose the area to keep.</span>
          <button data-cropok class="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white">Apply</button>
          <button data-cropno class="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
        </div>
        <label data-strrow class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span class="w-16">Strength</span>
          <input data-str type="range" min="1" max="100" value="40" class="flex-1 accent-indigo-500" />
        </label>
        <div data-brushrow class="hidden items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <label class="flex flex-1 items-center gap-3">
            <span class="w-16">Brush</span>
            <input data-brush type="range" min="2" max="30" value="10" class="flex-1 accent-indigo-500" />
          </label>
          <button data-undo class="underline hover:text-gray-700 dark:hover:text-gray-200">Undo</button>
          <button data-clear class="underline hover:text-gray-700 dark:hover:text-gray-200">Clear</button>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <input data-strip type="checkbox" checked class="accent-indigo-500" />
          <span>Remove metadata (EXIF, GPS)</span>
        </label>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <label class="flex items-center gap-2">
            <span class="whitespace-nowrap">Width (px)</span>
            <input data-rw type="number" min="1" step="1" inputmode="numeric" placeholder="Original" class="w-24 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-1 py-1" />
          </label>
          <span data-rwh class="min-w-[4.5rem]"></span>
          <div class="flex gap-1">
            ${[[1080, '1080'], [1920, '1920'], [2048, '2048'], [0, 'Original']].map(([v, t]) => `<button type="button" data-rwp="${v}" aria-pressed="false" aria-label="${v ? `Resize to ${v} pixels wide` : 'Original size'}" class="rwp px-2 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">${t}</button>`).join('')}
          </div>
        </div>
        <p data-rwnote class="hidden text-[11px] text-amber-600 dark:text-amber-400"></p>
        <div class="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
          <label class="flex items-center gap-2">
            <span>Format</span>
            <select data-fmt class="flex-1 min-w-0 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-1 py-1">
              <option value="image/jpeg">JPEG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option>
            </select>
          </label>
          <label class="flex items-center gap-2">
            <span class="whitespace-nowrap">Target size</span>
            <input data-target type="number" min="1" step="1" placeholder="KB" class="flex-1 min-w-0 rounded border border-gray-200 dark:border-gray-600 bg-transparent px-1 py-1 disabled:opacity-40" />
          </label>
        </div>
        <label class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span class="w-16">Quality <span data-qv>92</span></span>
          <input data-q type="range" min="30" max="95" value="92" class="flex-1 accent-indigo-500 disabled:opacity-40" />
        </label>
        <p data-size class="hidden text-xs text-gray-600 dark:text-gray-300"></p>
        <p data-note class="text-[11px] text-gray-400 dark:text-gray-500"></p>
        <div data-actions class="flex gap-2">
          <button data-copy class="hidden px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors">Copy</button>
          <button data-dl class="flex-1 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors">Download</button>
        </div>
        <p data-report class="text-[11px] text-gray-400 dark:text-gray-500"></p>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const $ = (q) => modal.querySelector(q);
  const cv = $('[data-cv]'), ctx = cv.getContext('2d'), dl = $('[data-dl]'), cp = $('[data-copy]');
  let img, base, scratch, pw = 0, ph = 0;
  const ops = []; // geometry applied in order: rotate / flip / crop
  let rw = 0; // requested output width; 0 = Original
  let curW = 0, curH = 0, capW = 0, capH = 0, capped = false; // full-resolution size after ops (EXPORT_MAX cap applied first)
  const layers = {}, masks = {}; // per-effect preview layer and stroke mask, built lazily
  let mode = 'all', fx = 'blur', drawing = false, raf = 0, strT = 0;
  const strokes = []; // { w: brush width as a fraction of the long side, fx, pts: [[nx, ny], ...] }
  const undoStack = []; // each entry: a painted stroke, { cleared: [...strokes] } so Clear can be undone too, or { geom, op, before: strokes }
  let cropping = false, crop = null, cropDrag = null, ov, box; // crop: normalized { x, y, w, h } or null
  let pendingShare = null, closed = false, roT = 0, roRunning = false, roAgain = false, cpT = 0;

  const close = () => {
    closed = true;
    cancelAnimationFrame(raf); clearTimeout(strT); clearTimeout(roT); clearTimeout(cpT);
    document.removeEventListener('keydown', onKey); removeEventListener('resize', layoutCrop);
    ov?.remove();
    Object.values(layers).forEach(c => release(c)); Object.values(masks).forEach(c => release(c));
    release(base, scratch, cv);
    modal.remove();
  };
  const hasWork = () => strokes.length || ops.length || cropping || crop;
  const onKey = (e) => {
    if (e.key === 'Escape') { if (cropping) exitCrop(); else if (!hasWork() || confirm('Discard your edits?')) close(); }
    else if (cropping) { if (e.key === 'Enter' && !e.target.closest?.('input,button,select,textarea')) { e.preventDefault(); applyCrop(); } }
    else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.closest?.('input,select,textarea') && (mode === 'brush' || undoStack[undoStack.length - 1]?.geom)) { e.preventDefault(); undo(); }
  };
  document.addEventListener('keydown', onKey);
  $('[data-x]').onclick = close;
  // a stray tap on the backdrop shouldn't throw away painted work
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal && !hasWork()) close(); });

  const strength = () => +$('[data-str]').value;
  const dirty = () => { pendingShare = null; if (!cp.disabled) { clearTimeout(cpT); cp.textContent = 'Copy'; } dl.textContent = 'Download'; $('[data-report]').textContent = ''; updateUndo(); queueReadout(); if (isTouch) $('[data-size]').classList.add('hidden'); };
  const report = (kept) => { if (!closed) $('[data-report]').textContent = describeMetadata(srcRows, kept); };
  const strip = () => $('[data-strip]').checked;
  const fromJpeg = srcMime === 'image/jpeg';
  const hasExif = fromJpeg && !!extractExifSegment(new Uint8Array(srcBuf));
  let sizeNote = '', dropped = false;
  function renderNote() {
    const msg = strip() ? 'Saved copy has metadata removed.'
      : dropped ? 'The original\'s metadata could not be kept safely, so it was removed.'
      : fromJpeg && outType === 'image/jpeg' && !hasExif ? 'The original has no EXIF camera info or GPS, so there is nothing to keep.'
      : fromJpeg && outType === 'image/jpeg' ? 'Camera info and GPS from the original are kept. The built-in preview is removed, but some camera makers hide extra previews in their own data that may remain.'
      : 'Only JPEG can keep metadata; this file will still be stripped.';
    const changed = !strip() && fromJpeg && outType === 'image/jpeg' && hasExif && !dropped && (ops.length || outSize());
    $('[data-note]').textContent = msg + (changed ? ' Picture size in the camera data still shows the original.' : '') + sizeNote;
  }
  $('[data-strip]').onchange = () => { dropped = false; renderNote(); dirty(); };
  renderNote();

  const targetKB = () => { const v = parseFloat($('[data-target]').value); return v > 0 ? v : 0; };
  if (!webpOk) $('[data-fmt] option[value="image/webp"]').remove();
  $('[data-fmt]').value = outType;
  function syncOutput() {
    const png = outType === 'image/png';
    $('[data-q]').disabled = png; $('[data-target]').disabled = png;
    $('[data-qv]').textContent = png ? '—' : $('[data-q]').value;
    dropped = false; renderNote(); dirty();
  }
  $('[data-fmt]').onchange = (e) => { outType = e.target.value; syncOutput(); };
  $('[data-q]').oninput = $('[data-target]').oninput = syncOutput;
  // Resize target as [w, h], or null when the output stays at the current size. Always capped like the export itself.
  function outSize(w = curW, h = curH) {
    if (!(rw >= 1) || !w) return null;
    const s = fitSize(w, h, rw, EXPORT_MAX);
    return s[0] === w && s[1] === h ? null : s;
  }
  function refreshRw() {
    const ok = rw >= 1 && curW, s = ok && fitSize(curW, curH, rw, EXPORT_MAX), o = outSize(), n = $('[data-rwnote]');
    $('[data-rwh]').textContent = ok ? `× ${s[1]} px` : '';
    n.textContent = ok && s[0] !== Math.round(rw) ? `Limited to ${EXPORT_MAX} px on the long side.` : '';
    n.classList.toggle('hidden', !n.textContent);
    modal.querySelectorAll('[data-rwp]').forEach(b => { const on = +b.dataset.rwp === rw; b.setAttribute('aria-pressed', on); b.classList.toggle('bg-indigo-100', on); b.classList.toggle('dark:bg-indigo-900/50', on); b.classList.toggle('border-indigo-400', on); });
    const [fw, fh] = o || [curW, curH];
    sizeNote = capped ? ` Large image: saved at ${fw}×${fh}.` : '';
    renderNote();
  }
  function setRw(v) { rw = Number.isFinite(v) && v >= 1 ? Math.round(v) : 0; refreshRw(); syncOutput(); }
  $('[data-rw]').oninput = (e) => setRw(parseFloat(e.target.value));
  modal.querySelectorAll('[data-rwp]').forEach(b => b.onclick = () => { const v = +b.dataset.rwp; $('[data-rw]').value = v || ''; setRw(v); });
  syncOutput();
  function showSize(blob, reached) {
    const o = srcSize, el = $('[data-size]');
    el.classList.remove('hidden');
    el.textContent = (o ? `Original ${formatBytes(o)} → ` : 'Saved size: ') + formatBytes(blob.size)
      + (reached ? '' : ` · Smallest possible: ${formatBytes(blob.size)}`);
  }
  // Desktop only: re-render and encode shortly after the last change; runs are serialized and never outlive the modal.
  function queueReadout() {
    if (isTouch || closed || !base) return;
    clearTimeout(roT);
    if (drawing) { roAgain = roRunning; return; } // end of stroke re-queues
    roT = setTimeout(runReadout, 500);
  }
  async function runReadout() {
    if (closed || drawing) return;
    if (roRunning) { roAgain = true; return; }
    roRunning = true;
    try {
      do {
        roAgain = false;
        const r = await exportBlob();
        if (!closed && !roAgain && r.blob) showSize(r.blob, r.reached);
      } while (roAgain && !closed);
    } catch { /* the readout is best-effort */ }
    roRunning = false;
  }

  // Stop a pending readout and wait out a running one so two full-size exports never overlap.
  async function quiesce() {
    clearTimeout(roT); roAgain = false;
    while (roRunning) await new Promise(r => setTimeout(r, 30));
  }

  const layerFor = (f) => layers[f] ||= effectLayer(f, base, strength());
  const maskFor = (f) => masks[f] ||= mk(pw, ph);
  function resetLayers() {
    Object.values(layers).forEach(c => release(c));
    for (const k in layers) delete layers[k];
    render();
  }

  // Preview image = the original at preview size run through every op.
  function bakePreview() {
    const k = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    let cur = mk(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
    cur.getContext('2d').drawImage(img, 0, 0, cur.width, cur.height);
    for (const op of ops) { const next = applyOp(cur, op, cur.width, cur.height); release(cur); cur = next; }
    return cur;
  }
  function rebuildPreview() {
    Object.values(layers).forEach(c => release(c)); Object.values(masks).forEach(c => release(c));
    for (const k in layers) delete layers[k];
    for (const k in masks) delete masks[k];
    release(base, scratch);
    base = bakePreview(); pw = base.width; ph = base.height;
    scratch = mk(pw, ph);
    cv.width = pw; cv.height = ph;
  }
  function updateDims() {
    [curW, curH] = [capW, capH];
    for (const op of ops) [curW, curH] = opDims(op, curW, curH);
    refreshRw();
  }
  function applyGeometry(op) {
    if (closed || !base || drawing) return;
    undoStack.push({ geom: true, op, before: strokes.map(s => ({ ...s, pts: s.pts.map(p => [...p]) })) });
    strokes.splice(0, strokes.length, ...transformStrokes(strokes, op, curW, curH));
    ops.push(op); updateDims(); rebuildPreview(); repaintMask(); render(); dirty();
  }
  for (const [k, op] of [['rotl', { type: 'rot', dir: -1 }], ['rotr', { type: 'rot', dir: 1 }], ['flipx', { type: 'flip', axis: 'x' }], ['flipy', { type: 'flip', axis: 'y' }]])
    $(`[data-${k}]`).onclick = () => applyGeometry(op);

  // Crop mode: a selection box over the (CSS-scaled) canvas, tracked by layoutCrop on resize.
  function layoutCrop() {
    if (!cropping) return;
    Object.assign(ov.style, { left: cv.offsetLeft + 'px', top: cv.offsetTop + 'px', width: cv.offsetWidth + 'px', height: cv.offsetHeight + 'px' });
    box.style.display = crop ? 'block' : 'none';
    if (crop) Object.assign(box.style, { left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.w * 100 + '%', height: crop.h * 100 + '%' });
    $('[data-cropinfo]').textContent = crop ? `${Math.round(crop.w * curW)} × ${Math.round(crop.h * curH)} px` : 'Drag on the picture to choose the area to keep.';
  }
  function enterCrop() {
    if (cropping || closed || !base || drawing) return;
    cropping = true; crop = null;
    ov = document.createElement('div'); ov.className = 'absolute overflow-hidden pointer-events-none';
    box = document.createElement('div'); box.className = 'absolute border-2 border-white'; box.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.55)';
    ov.appendChild(box); cv.parentNode.appendChild(ov);
    for (const q of ['[data-crop]', '[data-rotl]', '[data-rotr]', '[data-flipx]', '[data-flipy]', '[data-undo]', '[data-clear]']) $(q).disabled = true;
    $('[data-tundo]').disabled = true;
    $('[data-actions]').classList.add('hidden');
    $('[data-croprow]').classList.replace('hidden', 'flex');
    cv.style.cursor = 'crosshair';
    addEventListener('resize', layoutCrop); layoutCrop();
  }
  function exitCrop() {
    if (!cropping) return;
    cropping = false; crop = cropDrag = null;
    removeEventListener('resize', layoutCrop);
    ov.remove(); ov = box = null;
    for (const q of ['[data-crop]', '[data-rotl]', '[data-rotr]', '[data-flipx]', '[data-flipy]', '[data-undo]', '[data-clear]']) $(q).disabled = false;
    $('[data-actions]').classList.remove('hidden');
    $('[data-croprow]').classList.replace('flex', 'hidden');
    cv.style.cursor = mode === 'brush' ? 'crosshair' : 'default';
    updateUndo();
  }
  function applyCrop() {
    const r = crop && clampCrop(crop, curW, curH);
    if (!r) { $('[data-cropinfo]').textContent = 'Crop is too small'; return; }
    exitCrop(); applyGeometry({ type: 'crop', ...r });
  }
  const cropPt = (e) => {
    const r = cv.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const cropMove = (e) => {
    const [x, y] = cropPt(e), { ax, ay } = cropDrag;
    crop = { x: Math.min(ax, x), y: Math.min(ay, y), w: Math.abs(x - ax), h: Math.abs(y - ay) };
    layoutCrop();
  };
  $('[data-crop]').onclick = enterCrop;
  $('[data-cropok]').onclick = applyCrop;
  $('[data-cropno]').onclick = exitCrop;

  function paintStroke(c, s, w, h, from = 0) {
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = '#000';
    c.lineWidth = s.w * Math.max(w, h);
    for (let i = from; i < s.pts.length; i++) {
      const [ax, ay] = s.pts[i - 1] || s.pts[i], [bx, by] = s.pts[i];
      c.beginPath(); c.moveTo(ax * w, ay * h); c.lineTo(bx * w, by * h); c.stroke();
    }
  }
  function repaintMask() {
    Object.values(masks).forEach(m => m.getContext('2d').clearRect(0, 0, pw, ph));
    strokes.forEach(s => paintStroke(maskFor(s.fx).getContext('2d'), s, pw, ph));
  }

  function render() {
    ctx.clearRect(0, 0, pw, ph);
    if (mode === 'all') { ctx.drawImage(layerFor(fx), 0, 0); return; }
    ctx.drawImage(base, 0, 0);
    const sc = scratch.getContext('2d');
    for (const f of EFFECTS) {
      if (!strokes.some(s => s.fx === f)) continue;
      sc.globalCompositeOperation = 'source-over';
      sc.clearRect(0, 0, pw, ph);
      sc.drawImage(layerFor(f), 0, 0);
      sc.globalCompositeOperation = 'destination-in';
      sc.drawImage(maskFor(f), 0, 0);
      ctx.drawImage(scratch, 0, 0);
    }
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
    dirty();
    if (base) render();
  }
  modal.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  setMode('all');

  function setFx(f) {
    fx = f;
    modal.querySelectorAll('[data-fx]').forEach(b => {
      const on = b.dataset.fx === f;
      b.className = 'flex-1 py-1.5 font-medium ' + (on ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700');
    });
    $('[data-strrow]').classList.toggle('hidden', f === 'solid');
    $('[data-strrow]').classList.toggle('flex', f !== 'solid');
    dirty();
    if (base) render();
  }
  modal.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => setFx(b.dataset.fx));
  setFx('blur');

  $('[data-str]').oninput = () => { dirty(); clearTimeout(strT); strT = setTimeout(resetLayers, 60); };
  function updateUndo() {
    const last = undoStack[undoStack.length - 1];
    $('[data-tundo]').disabled = cropping || !last || !(mode === 'brush' || last.geom);
  }
  function undo() {
    if (drawing) return;
    const last = undoStack.pop();
    if (!last) return;
    if (last.geom) { ops.pop(); strokes.splice(0, strokes.length, ...last.before); updateDims(); rebuildPreview(); }
    else if (last.cleared) strokes.push(...last.cleared); else strokes.pop();
    repaintMask(); render(); dirty();
  }
  $('[data-undo]').onclick = $('[data-tundo]').onclick = undo;
  $('[data-clear]').onclick = () => {
    if (!strokes.length) return;
    undoStack.push({ cleared: strokes.splice(0) });
    repaintMask(); render(); dirty();
  };

  function addPoint(e, s) {
    const r = cv.getBoundingClientRect();
    s.pts.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
  }
  cv.addEventListener('pointerdown', (e) => {
    if (cropping) {
      if (cropDrag) return;
      cv.setPointerCapture(e.pointerId); const [ax, ay] = cropPt(e); cropDrag = { id: e.pointerId, ax, ay }; crop = null; cropMove(e); return;
    }
    if (mode !== 'brush') return;
    drawing = true; cv.setPointerCapture(e.pointerId);
    const s = { w: $('[data-brush]').value / 100 * 0.5, fx, pts: [] };
    strokes.push(s); undoStack.push(s); addPoint(e, s); paintStroke(maskFor(fx).getContext('2d'), s, pw, ph); schedule(); dirty();
  });
  cv.addEventListener('pointermove', (e) => {
    if (cropDrag) { if (e.pointerId === cropDrag.id) cropMove(e); return; }
    if (!drawing) return;
    const s = strokes[strokes.length - 1], from = s.pts.length;
    const l = e.getCoalescedEvents?.(); for (const ev of l?.length ? l : [e]) addPoint(ev, s);
    paintStroke(maskFor(s.fx).getContext('2d'), s, pw, ph, from); schedule();
  });
  const end = (e) => { if (cropDrag) { if (e.pointerId === cropDrag.id) cropDrag = null; return; } if (drawing) { drawing = false; queueReadout(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  // Full-resolution render of the final composite. Intermediate canvases are released as soon as they're consumed.
  async function renderFinal() {
    const k = Math.min(1, EXPORT_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    let w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    let orig = mk(w, h);
    orig.getContext('2d').drawImage(img, 0, 0, w, h);
    for (const op of ops) { const next = applyOp(orig, op, w, h); [w, h] = opDims(op, w, h); release(orig); orig = next; }
    let out;
    if (mode === 'brush') {
      out = mk(w, h);
      const oc = out.getContext('2d');
      oc.drawImage(orig, 0, 0);
      for (const f of EFFECTS) {
        const mine = strokes.filter(s => s.fx === f);
        if (!mine.length) continue;
        const m = mk(w, h), mc = m.getContext('2d');
        mine.forEach(s => paintStroke(mc, s, w, h));
        const layer = effectLayer(f, orig, strength());
        layer.getContext('2d').globalCompositeOperation = 'destination-in';
        layer.getContext('2d').drawImage(m, 0, 0);
        release(m);
        oc.drawImage(layer, 0, 0);
        release(layer);
      }
      release(orig);
    } else {
      out = effectLayer(fx, orig, strength());
      release(orig);
    }
    const o = outSize(w, h);
    if (o) {
      const r = mk(o[0], o[1]), g = r.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.drawImage(out, 0, 0, o[0], o[1]);
      release(out); out = r;
    }
    return out;
  }

  // Encode the final canvas, re-injecting the original's EXIF when the user chose to keep it.
  async function encode(canvas, type, q) {
    const blob = await new Promise(r => canvas.toBlob(r, type, q));
    if (!blob || strip() || !fromJpeg || type !== 'image/jpeg') return { blob, kept: false };
    dropped = false;
    const seg = extractExifSegment(new Uint8Array(srcBuf));
    const safe = seg && sanitizeExifSegment(seg);
    if (!safe) { dropped = !!seg; renderNote(); return { blob, kept: false }; }
    return { blob: new Blob([injectExifSegment(new Uint8Array(await blob.arrayBuffer()), safe)], { type }), kept: true };
  }

  // Renders once, then encodes at the slider quality, or searches for the best quality under the target size.
  async function exportBlob() {
    const type = outType, canvas = await renderFinal();
    try {
      if (type === 'image/jpeg') { // JPEG has no alpha; transparent areas would turn black
        const g = canvas.getContext('2d');
        g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
      }
      let q = +$('[data-q]').value / 100, reached = true;
      const kb = targetKB();
      if (kb && type !== 'image/png') {
        const r = await findQualityForTarget(async (qq) => (await encode(canvas, type, qq)).blob?.size ?? Infinity, kb * 1024);
        q = r.quality; reached = r.reached;
      }
      const { blob, kept } = await encode(canvas, type, q);
      return { blob, kept, reached };
    } finally { release(canvas); }
  }

  function saveFile(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Phones: the share sheet offers "Save Image" to Photos; a plain download only opens a viewer.
  async function deliver(file) {
    if (isTouch && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) {
        if (e.name === 'AbortError') return;
        if (e.name === 'NotAllowedError') { pendingShare = file; dl.textContent = 'Tap to save'; return; } // gesture expired during render
      }
    }
    saveFile(file);
  }

  dl.onclick = async () => {
    if (pendingShare) {
      const file = pendingShare; dirty();
      try { await navigator.share({ files: [file] }); } catch (e) { if (e.name !== 'AbortError') saveFile(file); }
      return;
    }
    dl.disabled = true; dl.textContent = 'Processing…';
    await new Promise(r => setTimeout(r, 30)); // let the label paint before the heavy work
    await quiesce();
    try {
      const type = outType, { blob, kept, reached } = await exportBlob();
      if (!blob) throw new Error('empty');
      if (!closed) { showSize(blob, reached); report(kept); }
      await deliver(new File([blob], `${origName}-blurred.${EXT[type]}`, { type }));
    } catch {
      alert('Could not export the image. It may be too large for this device.');
    } finally {
      dl.disabled = false; queueReadout();
      if (!pendingShare) dl.textContent = 'Download';
    }
  };

  // Clipboard only reliably takes PNG, so Copy ignores the chosen format, metadata and target size.
  async function pngBlob() {
    await quiesce();
    const canvas = await renderFinal();
    try {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('empty');
      return blob;
    } finally { release(canvas); }
  }
  if (window.isSecureContext && location.protocol !== 'file:' && typeof ClipboardItem !== 'undefined') {
    cp.classList.remove('hidden');
    cp.onclick = async () => {
      if (cp.disabled) return;
      clearTimeout(cpT); cp.disabled = true; cp.textContent = 'Copying…';
      let ok = true;
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]); } // promise keeps Safari's user gesture
      catch { ok = false; }
      if (closed) return;
      queueReadout();
      cp.disabled = false; cp.textContent = ok ? 'Copied' : 'Copy failed';
      if (ok) report(false);
      cpT = setTimeout(() => { cp.textContent = 'Copy'; }, 1500);
    };
  }

  img = new Image();
  img.onload = () => {
    if (closed) return;
    const long = Math.max(img.naturalWidth, img.naturalHeight), e = Math.min(1, EXPORT_MAX / long);
    capW = Math.round(img.naturalWidth * e); capH = Math.round(img.naturalHeight * e); capped = long > EXPORT_MAX;
    updateDims(); rebuildPreview();
    render();
    queueReadout();
  };
  img.onerror = () => { close(); alert('Could not load image.'); };
  img.src = src;
}
document.getElementById('blurBtn').addEventListener('click', openBlurTool);
