// Redaction effects drawn onto a new canvas. No DOM access at import time so Node tests can load it;
// the blur implementation is injected (blur-engine builds a canvas on import).

export const EFFECTS = ['blur', 'pixelate', 'solid'];

let blurImpl = null;
export const setBlurImpl = (fn) => { blurImpl = fn; };

export const pixelBlockSize = (strength, w, h) => Math.max(2, Math.round(strength / 100 * Math.max(w, h) * 0.06));

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// Returns a new canvas the size of `src` with the effect applied. Caller releases it.
export function effectLayer(fx, src, strength) {
  const w = src.width, h = src.height;
  if (fx === 'blur') return blurImpl(src, strength / 100 * Math.max(w, h) * 0.03);
  const out = mk(w, h), ctx = out.getContext('2d');
  if (fx === 'solid') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    return out;
  }
  const b = pixelBlockSize(strength, w, h), small = mk(Math.max(1, Math.ceil(w / b)), Math.max(1, Math.ceil(h / b)));
  small.getContext('2d').drawImage(src, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width * b, small.height * b);
  return out;
}
