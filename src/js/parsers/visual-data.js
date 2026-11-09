// ── Visual data extraction (palette + histogram + avg color) ──────────────
export function extractVisualData(sourceCanvas) {
  try {
    const SIZE = 200;
    const off = document.createElement('canvas');
    off.width = SIZE; off.height = SIZE;
    off.getContext('2d').drawImage(sourceCanvas, 0, 0, SIZE, SIZE);
    const data = off.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;

    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const histL = new Uint32Array(256);
    const freq  = {};
    let totalR = 0, totalG = 0, totalB = 0, pixCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      histR[r]++; histG[g]++; histB[b]++;
      histL[Math.round(0.299*r + 0.587*g + 0.114*b)]++;
      totalR += r; totalG += g; totalB += b; pixCount++;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      freq[key] = (freq[key] || 0) + 1;
    }

    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const palette = [];
    for (const [keyStr] of sorted) {
      if (palette.length >= 6) break;
      const key = parseInt(keyStr);
      const r = ((key >> 10) & 31) << 3;
      const g = ((key >>  5) & 31) << 3;
      const b = ( key        & 31) << 3;
      if (palette.some(([pr,pg,pb]) => Math.hypot(r-pr,g-pg,b-pb) < 60)) continue;
      palette.push([r, g, b]);
    }
    const paletteHex = palette.map(([r,g,b]) => '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join(''));

    const avgHex = pixCount ? '#' + [totalR, totalG, totalB]
      .map(v => Math.round(v / pixCount).toString(16).padStart(2, '0')).join('') : null;

    // Build luminance array for spatial analysis
    const lum = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < data.length; i += 4) {
      lum[i >> 2] = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
    }

    // Brightness: mean luminance
    let lumSum = 0;
    for (let lv = 0; lv < 256; lv++) lumSum += lv * histL[lv];
    const avgLum = pixCount ? lumSum / pixCount : 0;

    // Contrast: std dev of luminance
    let lum2Sum = 0;
    for (let lv = 0; lv < 256; lv++) lum2Sum += lv * lv * histL[lv];
    const lumStdDev = pixCount ? Math.sqrt(Math.max(0, lum2Sum / pixCount - avgLum * avgLum)) : 0;

    // Sharpness: variance of Laplacian over interior pixels
    let lapSumSq = 0, lapCount = 0;
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        const c = y * SIZE + x;
        const lap = lum[c - SIZE] + lum[c + SIZE] + lum[c - 1] + lum[c + 1] - 4 * lum[c];
        lapSumSq += lap * lap;
        lapCount++;
      }
    }
    const lapVariance = lapCount ? lapSumSq / lapCount : 0;

    // Noise: minimum local variance across 10×10 blocks (noise floor in smooth regions)
    const BSIZE = 10;
    let minLocalVar = Infinity;
    for (let by = 0; by + BSIZE <= SIZE; by += BSIZE) {
      for (let bx = 0; bx + BSIZE <= SIZE; bx += BSIZE) {
        let s = 0, s2 = 0;
        for (let dy = 0; dy < BSIZE; dy++) {
          for (let dx = 0; dx < BSIZE; dx++) {
            const v = lum[(by + dy) * SIZE + (bx + dx)];
            s += v; s2 += v * v;
          }
        }
        const n = BSIZE * BSIZE;
        const blockMean = s / n;
        const blockVar = s2 / n - blockMean * blockMean;
        if (blockVar < minLocalVar) minLocalVar = blockVar;
      }
    }
    const noiseSigma = Math.sqrt(Math.max(0, minLocalVar));

    return { palette: paletteHex, avgColor: avgHex, histR, histG, histB, histL,
             brightness: avgLum, contrast: lumStdDev, lapVariance, noiseSigma };
  } catch (_) {
    return { palette: [], avgColor: null, histR: null, histG: null, histB: null, histL: null,
             brightness: null, contrast: null, lapVariance: null, noiseSigma: null };
  }
}
