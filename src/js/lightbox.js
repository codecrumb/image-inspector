// ── Lightbox + Magnifier Loupe ────────────────────────────────────────────
let lightboxSource = null;
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
  const ctx = lbCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreen, 0, 0, drawW, drawH);
  lightboxEl.classList.remove('hidden');
}

function closeLightbox() {
  lightboxEl.classList.add('hidden');
  loupeEl.classList.add('hidden');
  lightboxSource = null;
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

lightboxEl.addEventListener('click', (e) => { if (e.target === lightboxEl) closeLightbox(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightboxEl.classList.contains('hidden')) closeLightbox();
});
