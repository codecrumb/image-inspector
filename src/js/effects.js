// Redaction effects drawn onto a new canvas. No DOM access at import time so Node tests can load it;
// the blur implementation is injected (blur-engine builds a canvas on import).

export const EFFECTS = ['blur', 'pixelate', 'solid'];

let blurImpl = null;
export const setBlurImpl = (fn) => { blurImpl = fn; };

export const pixelBlockSize = (strength, w, h) => Math.max(2, Math.round(strength / 100 * Math.max(w, h) * 0.06));

// Cell grid for pixelate; the count depends only on strength and aspect, so preview and export match at any size.
export function pixelCells(strength, w, h) {
  const long = Math.max(w, h), short = Math.min(w, h);
  const l = Math.min(Math.ceil(long / 2), Math.max(1, Math.round(100 / (strength * 0.06))));
  const sh = Math.max(1, Math.round(l * short / long));
  return w >= h ? [l, sh] : [sh, l];
}

const mk = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// Returns a new canvas the size of `src` with the effect applied. Caller releases it.
export function effectLayer(fx, src, strength) {
  const w = src.width, h = src.height;
  if (fx === 'blur') {
    if (!blurImpl) throw new Error('effects: setBlurImpl() was not called');
    return blurImpl(src, strength / 100 * Math.max(w, h) * 0.03);
  }
  const out = mk(w, h), ctx = out.getContext('2d');
  if (fx === 'solid') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    return out;
  }
  const [cx, cy] = pixelCells(strength, w, h), small = mk(cx, cy);
  small.getContext('2d').drawImage(src, 0, 0, cx, cy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, w, h);
  small.width = small.height = 0;
  return out;
}
