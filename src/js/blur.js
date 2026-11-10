import { state } from './state.js';
import { blurCanvas } from './blur-engine.js';
import { EFFECTS, effectLayer, setBlurImpl } from './effects.js';
import { findQualityForTarget } from './output.js';
import { formatBytes } from './util.js';
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
  const origName = (state.imageQueue[state.queueIndex]?.file.name || 'image').replace(/\.[^.]+$/, '');
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  let outType = EXT[state.currentMime] ? state.currentMime : 'image/png';

  const modal = document.createElement('div');
  modal.id = 'blurModal';
  modal.className = 'fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-full flex flex-col overflow-hidden" role="dialog" aria-label="Blur and download">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Blur &amp; Download</span>
        <button data-x class="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none px-1" aria-label="Close">&times;</button>
      </div>
      <div class="flex-1 min-h-[120px] flex items-center justify-center bg-gray-50 dark:bg-gray-700 p-3">
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
        <button data-dl class="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white transition-colors">Download</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const $ = (q) => modal.querySelector(q);
  const cv = $('[data-cv]'), ctx = cv.getContext('2d'), dl = $('[data-dl]');
  let img, base, scratch, pw = 0, ph = 0;
  const layers = {}, masks = {}; // per-effect preview layer and stroke mask, built lazily
  let mode = 'all', fx = 'blur', drawing = false, raf = 0, strT = 0;
  const strokes = []; // { w: brush width as a fraction of the long side, fx, pts: [[nx, ny], ...] }
  const undoStack = []; // each entry: a painted stroke, or { cleared: [...strokes] } so Clear can be undone too
  let pendingShare = null, closed = false, roT = 0, roRunning = false, roAgain = false;

  const close = () => {
    closed = true;
    cancelAnimationFrame(raf); clearTimeout(strT); clearTimeout(roT);
    document.removeEventListener('keydown', onKey);
    Object.values(layers).forEach(c => release(c)); Object.values(masks).forEach(c => release(c));
    release(base, scratch, cv);
    modal.remove();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && mode === 'brush') { e.preventDefault(); undo(); }
  };
  document.addEventListener('keydown', onKey);
  $('[data-x]').onclick = close;
  // a stray tap on the backdrop shouldn't throw away painted work
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal && !strokes.length) close(); });

  const strength = () => +$('[data-str]').value;
  const dirty = () => { pendingShare = null; dl.textContent = 'Download'; queueReadout(); };
  const strip = () => $('[data-strip]').checked;
  const fromJpeg = state.currentMime === 'image/jpeg';
  let sizeNote = '', dropped = false;
  function renderNote() {
    const msg = strip() ? 'Saved copy has metadata removed.'
      : dropped ? 'The original\'s metadata could not be kept safely, so it was removed.'
      : fromJpeg && outType === 'image/jpeg' ? 'Camera info and GPS from the original are kept. The built-in preview is removed, but some camera makers hide extra previews in their own data that may remain.'
      : 'Only JPEG can keep metadata; this file will still be stripped.';
    $('[data-note]').textContent = msg + sizeNote;
  }
  $('[data-strip]').onchange = () => { renderNote(); dirty(); };
  renderNote();

  const targetKB = () => { const v = parseFloat($('[data-target]').value); return v > 0 ? v : 0; };
  $('[data-fmt]').value = outType;
  function syncOutput() {
    const png = outType === 'image/png';
    $('[data-q]').disabled = png; $('[data-target]').disabled = png;
    $('[data-qv]').textContent = png ? '—' : $('[data-q]').value;
    renderNote(); dirty();
  }
  $('[data-fmt]').onchange = (e) => { outType = e.target.value; syncOutput(); };
  $('[data-q]').oninput = $('[data-target]').oninput = syncOutput;
  syncOutput();
  function showSize(blob, reached) {
    const o = state.imageQueue[state.queueIndex]?.file.size, el = $('[data-size]');
    el.classList.remove('hidden');
    el.textContent = (o ? `Original ${formatBytes(o)} → ` : 'Saved size: ') + formatBytes(blob.size)
      + (reached ? '' : ` · Smallest possible: ${formatBytes(blob.size)}`);
  }
  // Desktop only: re-render and encode shortly after the last change; runs are serialized and never outlive the modal.
  function queueReadout() {
    if (isTouch || closed || !base) return;
    clearTimeout(roT); roT = setTimeout(runReadout, 500);
  }
  async function runReadout() {
    if (closed) return;
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

  const layerFor = (f) => layers[f] ||= effectLayer(f, base, strength());
  const maskFor = (f) => masks[f] ||= mk(pw, ph);
  function resetLayers() {
    Object.values(layers).forEach(c => release(c));
    for (const k in layers) delete layers[k];
    render();
  }

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
  function undo() {
    const last = undoStack.pop();
    if (!last) return;
    if (last.cleared) strokes.push(...last.cleared); else strokes.pop();
    repaintMask(); render(); dirty();
  }
  $('[data-undo]').onclick = undo;
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
    if (mode !== 'brush') return;
    drawing = true; cv.setPointerCapture(e.pointerId);
    const s = { w: $('[data-brush]').value / 100 * 0.5, fx, pts: [] };
    strokes.push(s); undoStack.push(s); addPoint(e, s); paintStroke(maskFor(fx).getContext('2d'), s, pw, ph); schedule(); dirty();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const s = strokes[strokes.length - 1], from = s.pts.length;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) addPoint(ev, s);
    paintStroke(maskFor(s.fx).getContext('2d'), s, pw, ph, from); schedule();
  });
  const end = () => { drawing = false; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  // Full-resolution render of the final composite. Intermediate canvases are released as soon as they're consumed.
  async function renderFinal() {
    const k = Math.min(1, EXPORT_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const orig = mk(w, h);
    orig.getContext('2d').drawImage(img, 0, 0, w, h);
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
    return out;
  }

  // Encode the final canvas, re-injecting the original's EXIF when the user chose to keep it.
  async function encode(canvas, type, q) {
    const blob = await new Promise(r => canvas.toBlob(r, type, q));
    if (!blob || strip() || !fromJpeg || type !== 'image/jpeg') return { blob, kept: false };
    dropped = false;
    const seg = extractExifSegment(new Uint8Array(state.currentBuffer));
    const safe = seg && sanitizeExifSegment(seg);
    if (!safe) { dropped = !!seg; renderNote(); return { blob, kept: false }; }
    return { blob: new Blob([injectExifSegment(new Uint8Array(await blob.arrayBuffer()), safe)], { type }), kept: true };
  }

  // Renders once, then encodes at the slider quality, or searches for the best quality under the target size.
  async function exportBlob() {
    const type = outType, canvas = await renderFinal();
    try {
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
    try {
      const type = outType, { blob, reached } = await exportBlob();
      if (!blob) throw new Error('empty');
      if (!closed) showSize(blob, reached);
      await deliver(new File([blob], `${origName}-blurred.${EXT[type]}`, { type }));
    } catch {
      alert('Could not export the image. It may be too large for this device.');
    } finally {
      dl.disabled = false;
      if (!pendingShare) dl.textContent = 'Download';
    }
  };

  img = new Image();
  img.onload = () => {
    const long = Math.max(img.naturalWidth, img.naturalHeight);
    const k = Math.min(1, PREVIEW_MAX / long);
    pw = Math.round(img.naturalWidth * k); ph = Math.round(img.naturalHeight * k);
    base = mk(pw, ph); base.getContext('2d').drawImage(img, 0, 0, pw, ph);
    scratch = mk(pw, ph);
    cv.width = pw; cv.height = ph;
    if (long > EXPORT_MAX) {
      const e = EXPORT_MAX / long;
      sizeNote = ` Large image: saved at ${Math.round(img.naturalWidth * e)}×${Math.round(img.naturalHeight * e)}.`;
      renderNote();
    }
    render();
    queueReadout();
  };
  img.onerror = () => { close(); alert('Could not load image.'); };
  img.src = src;
}
document.getElementById('blurBtn').addEventListener('click', openBlurTool);
