// Gaussian-ish blur for canvases. Uses the native canvas filter where it exists; Safari doesn't
// have one, so there a 3-pass box blur on pixel data approximates a Gaussian.

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export const hasCanvasFilter = typeof mk(1, 1).getContext('2d').filter === 'string';

// Box widths whose repeated application approximates a Gaussian of the given sigma.
function boxRadii(sigma, n = 3) {
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let lo = Math.floor(ideal);
  if (lo % 2 === 0) lo--;
  const m = Math.round((12 * sigma * sigma - n * lo * lo - 4 * n * lo - 3 * n) / (-4 * lo - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? lo : lo + 2) - 1) / 2);
}

// One edge-clamped box pass along rows (horizontal) or columns, via a running sum.
function boxPass(src, dst, w, h, r, horizontal) {
  const len = horizontal ? w : h, lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4, lineStep = horizontal ? w * 4 : 4;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    for (let c = 0; c < 4; c++) {
      const o = l * lineStep + c;
      let acc = (r + 1) * src[o];
      for (let k = 1; k <= r; k++) acc += src[o + Math.min(k, len - 1) * step];
      for (let i = 0; i < len; i++) {
        dst[o + i * step] = acc * inv;
        acc += src[o + Math.min(i + r + 1, len - 1) * step] - src[o + Math.max(i - r, 0) * step];
      }
    }
  }
}

function boxBlurImageData(img, sigma) {
  let a = img.data, b = new Uint8ClampedArray(a.length);
  for (const r of boxRadii(sigma)) {
    boxPass(a, b, img.width, img.height, r, true);
    boxPass(b, a, img.width, img.height, r, false);
  }
  return img;
}

// Returns a new canvas with `src` blurred by `sigma` pixels. Edges stay opaque (no fade to transparent).
export function blurCanvas(src, sigma) {
  const w = src.width, h = src.height, out = mk(w, h), ctx = out.getContext('2d');
  if (sigma < 0.5) { ctx.drawImage(src, 0, 0); return out; }
  if (hasCanvasFilter) {
    // blur a copy padded by replicating edge pixels, then crop, so borders neither fade nor shift
    const p = Math.ceil(sigma * 3), pw = w + p * 2, ph = h + p * 2;
    const padded = mk(pw, ph), pc = padded.getContext('2d');
    pc.drawImage(src, p, p);
    pc.drawImage(src, 0, 0, 1, h, 0, p, p, h);
    pc.drawImage(src, w - 1, 0, 1, h, p + w, p, p, h);
    pc.drawImage(src, 0, 0, w, 1, p, 0, w, p);
    pc.drawImage(src, 0, h - 1, w, 1, p, p + h, w, p);
    pc.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
    pc.drawImage(src, w - 1, 0, 1, 1, p + w, 0, p, p);
    pc.drawImage(src, 0, h - 1, 1, 1, 0, p + h, p, p);
    pc.drawImage(src, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
    const blurred = mk(pw, ph), bc = blurred.getContext('2d');
    bc.filter = `blur(${sigma}px)`;
    bc.drawImage(padded, 0, 0);
    ctx.drawImage(blurred, p, p, w, h, 0, 0, w, h);
    return out;
  }
  ctx.drawImage(src, 0, 0);
  ctx.putImageData(boxBlurImageData(ctx.getImageData(0, 0, w, h), sigma), 0, 0);
  return out;
}
