import { showCopyFeedback } from './copy-feedback.js';

// ── Render visual analysis (avg color, palette, histogram) ───────────────
let _lastHistData = null;

export function renderVisualAnalysis(visualData) {
  const section = document.getElementById('paletteSection');
  const { palette, avgColor, histR, histG, histB, histL } = visualData;

  if (!palette.length && !avgColor) { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');

  // Average color
  const avgWrap   = document.getElementById('avgColorWrap');
  const avgSwatch = document.getElementById('avgColorSwatch');
  const avgHexEl  = document.getElementById('avgColorHex');
  if (avgColor) {
    avgSwatch.style.background = avgColor;
    avgHexEl.textContent = avgColor;
    avgWrap.classList.remove('hidden');
    avgWrap.classList.add('flex');
    avgSwatch.onclick = () => showCopyFeedback(avgWrap, avgColor);
  } else {
    avgWrap.classList.add('hidden');
  }

  // Palette swatches
  const container = document.getElementById('paletteSwatches');
  container.innerHTML = '';
  for (const hex of palette) {
    const btn = document.createElement('button');
    btn.className = 'relative group flex flex-col items-center gap-1';
    btn.innerHTML = `
      <div class="w-10 h-10 rounded-lg shadow-sm border border-black/10 dark:border-white/10" style="background:${hex}"></div>
      <span class="text-xs font-mono text-gray-500 dark:text-gray-400">${hex}</span>
    `;
    btn.addEventListener('click', () => showCopyFeedback(btn, hex));
    container.appendChild(btn);
  }

  // Histogram
  _lastHistData = histR ? { histR, histG, histB, histL } : null;
  drawHistogram();

  // Image metrics
  const metricsWrap = document.getElementById('imageMetricsWrap');
  if (visualData.brightness !== null && visualData.brightness !== undefined) {
    metricsWrap.classList.remove('hidden');

    // Brightness bar (0-255 → 0-100%)
    const bPct = Math.round(visualData.brightness / 255 * 100);
    document.getElementById('metricBrightnessBar').style.width = bPct + '%';
    const bLabel = visualData.brightness < 51 ? 'Very Dark'
      : visualData.brightness < 101 ? 'Dark'
      : visualData.brightness < 161 ? 'Moderate'
      : visualData.brightness < 211 ? 'Bright' : 'Very Bright';
    document.getElementById('metricBrightnessLabel').textContent = bLabel;

    // Contrast bar (std dev, 0-90 → 0-100%)
    const cPct = Math.min(100, Math.round(visualData.contrast / 90 * 100));
    document.getElementById('metricContrastBar').style.width = cPct + '%';
    const cLabel = visualData.contrast < 16 ? 'Very Low'
      : visualData.contrast < 36 ? 'Low'
      : visualData.contrast < 61 ? 'Moderate'
      : visualData.contrast < 91 ? 'High' : 'Very High';
    document.getElementById('metricContrastLabel').textContent = cLabel;

    // Sharpness badge
    const sharpEl = document.getElementById('metricSharpnessBadge');
    const lv = visualData.lapVariance;
    const sharpLabel = lv < 15 ? 'Blurry' : lv < 80 ? 'Moderate' : 'Sharp';
    const sharpCls = lv < 15
      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
      : lv < 80
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
    sharpEl.textContent = sharpLabel;
    sharpEl.className = 'text-xs font-medium px-2 py-0.5 rounded-full ' + sharpCls;

    // Noise badge
    const noiseEl = document.getElementById('metricNoiseBadge');
    const ns = visualData.noiseSigma;
    const noiseLabel = ns < 3 ? 'Clean' : ns < 8 ? 'Low' : ns < 20 ? 'Moderate' : 'Noisy';
    const noiseCls = ns < 3
      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
      : ns < 8
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
      : ns < 20
      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
    noiseEl.textContent = noiseLabel;
    noiseEl.className = 'text-xs font-medium px-2 py-0.5 rounded-full ' + noiseCls;
  } else {
    metricsWrap.classList.add('hidden');
  }
}

export function drawHistogram() {
  const wrap = document.getElementById('histogramWrap');
  if (!_lastHistData) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  const canvas = document.getElementById('histogramCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(canvas.clientWidth, 256) * dpr;
  const H = 60 * dpr;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.classList.contains('dark');

  ctx.fillStyle = isDark ? '#111827' : '#f9fafb';
  ctx.fillRect(0, 0, W, H);

  const { histR, histG, histB, histL } = _lastHistData;
  const peak = Math.max(...histR, ...histG, ...histB);
  if (peak === 0) return;

  const xScale = W / 256;

  function drawChannel(hist, color) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < 256; i++) {
      ctx.lineTo(i * xScale, H - (hist[i] / peak) * H);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawChannel(histR, 'rgba(239,68,68,0.5)');
  drawChannel(histG, 'rgba(34,197,94,0.5)');
  drawChannel(histB, 'rgba(59,130,246,0.5)');

  // Luminance line
  const lumPeak = Math.max(...histL);
  if (lumPeak > 0) {
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = i * xScale;
      const y = H - (histL[i] / lumPeak) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)';
    ctx.lineWidth = dpr;
    ctx.stroke();
  }
}

// ── Histogram modal ───────────────────────────────────────────────────────
export function openHistogramModal() {
  const modal = document.getElementById('histModal');
  modal.classList.remove('hidden');
  requestAnimationFrame(drawHistogramLarge);
}

export function closeHistogramModal() {
  document.getElementById('histModal').classList.add('hidden');
}

function drawHistogramLarge() {
  if (!_lastHistData) return;
  const canvas = document.getElementById('histModalCanvas');
  const dpr = window.devicePixelRatio || 1;
  const LABEL_H = 20; // px reserved for x-axis labels
  const logW = canvas.clientWidth || 560;
  const logH = 160;
  canvas.width  = logW * dpr;
  canvas.height = logH * dpr;
  canvas.style.height = logH + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const isDark = document.documentElement.classList.contains('dark');
  const chartH = logH - LABEL_H;
  const W = logW;

  // Background
  ctx.fillStyle = isDark ? '#111827' : '#f9fafb';
  ctx.fillRect(0, 0, W, logH);

  const { histR, histG, histB, histL } = _lastHistData;
  const peak = Math.max(...histR, ...histG, ...histB);
  const xScale = W / 256;

  // Grid lines
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 1;
  for (const v of [64, 128, 192]) {
    const x = v * xScale;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, chartH); ctx.stroke();
  }
  for (const frac of [0.25, 0.5, 0.75]) {
    const y = chartH - frac * chartH;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // X-axis labels
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  ctx.font = `${10 * dpr / dpr}px monospace`; // stays 10px logical
  ctx.textAlign = 'center';
  for (const v of [0, 64, 128, 192, 255]) {
    ctx.fillText(v, v * xScale, logH - 4);
  }

  if (peak === 0) return;

  function drawChannel(hist, color) {
    ctx.beginPath();
    ctx.moveTo(0, chartH);
    for (let i = 0; i < 256; i++) {
      ctx.lineTo(i * xScale, chartH - (hist[i] / peak) * chartH);
    }
    ctx.lineTo(W, chartH);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  drawChannel(histR, 'rgba(239,68,68,0.5)');
  drawChannel(histG, 'rgba(34,197,94,0.5)');
  drawChannel(histB, 'rgba(59,130,246,0.5)');

  // Luminance line
  const lumPeak = Math.max(...histL);
  if (lumPeak > 0) {
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = i * xScale;
      const y = chartH - (histL[i] / lumPeak) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

document.getElementById('histogramCanvas').addEventListener('click', openHistogramModal);
document.getElementById('histModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeHistogramModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('histModal').classList.contains('hidden')) {
    closeHistogramModal();
  }
});
document.getElementById('histCopyBtn').addEventListener('click', () => {
  const btn = document.getElementById('histCopyBtn');
  const canvas = document.getElementById('histModalCanvas');
  canvas.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      const lbl = document.getElementById('histCopyLabel');
      lbl.textContent = 'Copied!';
      setTimeout(() => { lbl.textContent = 'Copy'; }, 1500);
    } catch (_) {}
  });
});
