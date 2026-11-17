// ── Lightbox + Magnifier Loupe + Color probes ─────────────────────────────
import { state } from './state.js';
import { rgbToHex, rgbToHsl, averageRgb, dragToRect, probesToCsv } from './probes.js';

let lightboxSource = null;
let probeMode = false;
let probes = [];        // pixel coords of the original image
let probeOwner = null;  // buffer the probes belong to; reset when the image changes
let nextProbeId = 1;
let drag = null;        // { x0, y0, x1, y1 } normalized, while dragging
let justDragged = false;
const isTouchDevice = navigator.maxTouchPoints > 0;
export const lightboxEl  = document.getElementById('lightbox');
const lbCanvas    = document.getElementById('lightboxCanvas');
const loupeEl     = document.getElementById('loupe');
const loupeCanvas = document.getElementById('loupeCanvas');
const loupeHexEl  = document.getElementById('loupeHex');

export function openLightbox(sourceEl) {
  const srcW = sourceEl.naturalWidth || sourceEl.width;
  const srcH = sourceEl.naturalHeight || sourceEl.height;
  if (!srcW || !srcH) return;

  const offscreen = document.createElement('canvas');
  offscreen.width = srcW; offscreen.height = srcH;
  offscreen.getContext('2d').drawImage(sourceEl, 0, 0);
  lightboxSource = offscreen;

  const pad = 40;
  const scale = Math.min((window.innerWidth - pad * 2) / srcW, (window.innerHeight - pad * 2) / srcH);
  const drawW = Math.round(srcW * scale);
  const drawH = Math.round(srcH * scale);

  lbCanvas.width = drawW; lbCanvas.height = drawH;
  if (probeOwner !== state.currentBuffer) { probes = []; nextProbeId = 1; probeOwner = state.currentBuffer; }
  redraw();
  renderProbes();
  lightboxEl.classList.remove('hidden');
}

function redraw() {
  const ctx = lbCanvas.getContext('2d');
  const w = lbCanvas.width, h = lbCanvas.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(lightboxSource, 0, 0, w, h);
  const kx = w / lightboxSource.width, ky = h / lightboxSource.height;
  const mark = (x, y, bw, bh, label, dashed) => {
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.setLineDash([]);
    if (bw) ctx.strokeRect(x, y, bw, bh); else { ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.stroke(); }
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.setLineDash(dashed ? [5, 4] : []);
    if (bw) ctx.strokeRect(x, y, bw, bh); else { ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.stroke(); }
    if (label) {
      ctx.font = '600 12px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.setLineDash([]);
      ctx.strokeText(label, x + 9, y - 6); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 9, y - 6);
    }
  };
  for (const p of probes) mark(p.x * kx, p.y * ky, p.kind === 'region' ? p.w * kx : 0, p.h * ky, p.id, false);
  if (drag) {
    const x = Math.min(drag.x0, drag.x1) * w, y = Math.min(drag.y0, drag.y1) * h;
    mark(x, y, Math.abs(drag.x1 - drag.x0) * w, Math.abs(drag.y1 - drag.y0) * h, '', true);
  }
}

function closeLightbox() {
  lightboxEl.classList.add('hidden');
  loupeEl.classList.add('hidden');
  lightboxSource = null;
  drag = null;
  setProbeMode(false);
}

function sampleHex(srcW, srcH, imgX, imgY) {
  const cx = Math.max(0, Math.min(srcW - 1, imgX));
  const cy = Math.max(0, Math.min(srcH - 1, imgY));
  const px = lightboxSource.getContext('2d').getImageData(cx, cy, 1, 1).data;
  return { hex: '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join(''), cx, cy };
}

lightboxEl.addEventListener('mousemove', (e) => {
  if (isTouchDevice || !lightboxSource) return;
  const rect = lbCanvas.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  if (cx < 0 || cx > rect.width || cy < 0 || cy > rect.height) {
    loupeEl.classList.add('hidden'); return;
  }

  const srcW = lightboxSource.width, srcH = lightboxSource.height;
  const imgX = Math.floor(cx / rect.width * srcW);
  const imgY = Math.floor(cy / rect.height * srcH);
  const { hex, cx: sx, cy: sy } = sampleHex(srcW, srcH, imgX, imgY);
  loupeHexEl.textContent = hex;

  const LOUPE = 120, ZOOM = 8, half = LOUPE / 2 / ZOOM;
  const lctx = loupeCanvas.getContext('2d');
  lctx.clearRect(0, 0, LOUPE, LOUPE);
  lctx.imageSmoothingEnabled = false;
  lctx.drawImage(lightboxSource, sx - half, sy - half, half * 2, half * 2, 0, 0, LOUPE, LOUPE);

  let lx = e.clientX + 20, ly = e.clientY - 145;
  if (lx + 130 > window.innerWidth) lx = e.clientX - 140;
  if (ly < 10) ly = e.clientY + 20;
  loupeEl.style.left = lx + 'px';
  loupeEl.style.top  = ly + 'px';
  loupeEl.classList.remove('hidden');
});

lightboxEl.addEventListener('mouseleave', () => loupeEl.classList.add('hidden'));

lbCanvas.addEventListener('click', (e) => {
  if (!lightboxSource) return;
  e.stopPropagation();
  if (probeMode) return;
  const rect = lbCanvas.getBoundingClientRect();
  const srcW = lightboxSource.width, srcH = lightboxSource.height;
  const imgX = Math.floor((e.clientX - rect.left) / rect.width * srcW);
  const imgY = Math.floor((e.clientY - rect.top) / rect.height * srcH);
  const { hex } = sampleHex(srcW, srcH, imgX, imgY);
  navigator.clipboard.writeText(hex).then(() => {
    const tip = document.createElement('div');
    tip.textContent = 'Copied!';
    tip.style.cssText = `position:fixed;left:${e.clientX + 10}px;top:${e.clientY - 30}px;background:#111827;color:#f9fafb;font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;pointer-events:none;z-index:100;white-space:nowrap;font-family:sans-serif;`;
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1200);
  });
});

lightboxEl.addEventListener('click', (e) => {
  if (justDragged) { justDragged = false; return; }
  if (e.target === lightboxEl) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (lightboxEl.classList.contains('hidden')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key.toLowerCase() === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey && e.target.tagName !== 'INPUT') setProbeMode(!probeMode);
});

// ── Color probes ──────────────────────────────────────────────────────────
const probeToggle = document.getElementById('probeToggle');
const probePanel  = document.getElementById('probePanel');
const probeList   = document.getElementById('probeList');

function setProbeMode(on) {
  probeMode = on;
  probePanel.classList.toggle('hidden', !on);
  probeToggle.classList.toggle('bg-blue-500', on);
  probeToggle.classList.toggle('bg-white/15', !on);
  lbCanvas.style.touchAction = on ? 'none' : '';
}
probeToggle.addEventListener('click', (e) => { e.stopPropagation(); setProbeMode(!probeMode); });

function toNorm(e) {
  const r = lbCanvas.getBoundingClientRect();
  return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
}

lbCanvas.addEventListener('pointerdown', (e) => {
  if (!probeMode || !lightboxSource || e.button) return;
  const [x, y] = toNorm(e);
  drag = { x0: x, y0: y, x1: x, y1: y };
  lbCanvas.setPointerCapture(e.pointerId);
});
lbCanvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  [drag.x1, drag.y1] = toNorm(e);
  redraw();
});
lbCanvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  [drag.x1, drag.y1] = toNorm(e);
  const w = lightboxSource.width, h = lightboxSource.height;
  const rect = dragToRect(drag.x0, drag.y0, drag.x1, drag.y1, w, h);
  let probe;
  if (rect) {
    probe = { kind: 'region', ...rect, rgb: sampleRegion(rect) };
  } else {
    const x = Math.min(w - 1, Math.floor(drag.x0 * w)), y = Math.min(h - 1, Math.floor(drag.y0 * h));
    const d = lightboxSource.getContext('2d').getImageData(x, y, 1, 1).data;
    probe = { kind: 'point', x, y, w: 1, h: 1, rgb: [d[0], d[1], d[2]] };
  }
  probes.push({ id: nextProbeId++, label: '', ...probe });
  drag = null;
  justDragged = true; setTimeout(() => { justDragged = false; }, 0);
  redraw(); renderProbes();
});
lbCanvas.addEventListener('pointercancel', () => { drag = null; redraw(); });

// Average a region by shrinking it onto a small canvas first, so a huge
// selection of a huge image never allocates its full pixel array.
function sampleRegion({ x, y, w, h }) {
  const k = Math.min(1, 256 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(lightboxSource, x, y, w, h, 0, 0, c.width, c.height);
  return averageRgb(cx.getImageData(0, 0, c.width, c.height).data);
}

function renderProbes() {
  probeList.textContent = '';
  for (const p of probes) {
    const [r, g, b] = p.rgb, [hh, ss, ll] = rgbToHsl(r, g, b), hex = rgbToHex(r, g, b);
    const li = document.createElement('li');
    li.className = 'rounded-lg bg-white/5 p-2 text-[11px] font-mono leading-snug';
    li.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded border border-white/30 shrink-0" style="background:${hex}"></span>
        <span class="font-sans font-semibold text-gray-300">${p.id}${p.kind === 'region' ? ' · avg' : ''}</span>
        <button type="button" class="ml-auto text-gray-400 hover:text-white px-1" title="Remove" aria-label="Remove probe ${p.id}">✕</button>
      </div>
      <div class="mt-1 select-all">${hex} · rgb(${r}, ${g}, ${b}) · hsl(${hh}, ${ss}%, ${ll}%)</div>
      <input type="text" maxlength="60" placeholder="Label" aria-label="Label for probe ${p.id}" class="mt-1 w-full rounded bg-black/30 px-1.5 py-1 font-sans text-gray-100 placeholder-gray-500 outline-none focus:ring-1 focus:ring-blue-400">`;
    const input = li.querySelector('input');
    input.value = p.label;
    input.addEventListener('input', () => { p.label = input.value; });
    li.querySelector('button').addEventListener('click', () => {
      probes = probes.filter(q => q !== p);
      redraw(); renderProbes();
    });
    probeList.appendChild(li);
  }
}

function csvText() {
  const name = state.imageQueue[state.queueIndex]?.file?.name || 'image';
  return probesToCsv(probes, name, lightboxSource.width, lightboxSource.height);
}
function flash(btn, text) {
  const orig = btn.textContent; btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 1200);
}
document.getElementById('probeCopy').addEventListener('click', (e) => {
  if (!probes.length) return flash(e.currentTarget, 'No probes');
  const btn = e.currentTarget;
  navigator.clipboard.writeText(csvText()).then(() => flash(btn, 'Copied!'), () => flash(btn, 'Copy failed'));
});
document.getElementById('probeDownload').addEventListener('click', (e) => {
  if (!probes.length) return flash(e.currentTarget, 'No probes');
  const url = URL.createObjectURL(new Blob([csvText()], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'color-probes.csv' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.getElementById('probeClear').addEventListener('click', () => {
  probes = []; nextProbeId = 1; redraw(); renderProbes();
});
