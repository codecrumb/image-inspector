// Rotate / flip / crop / resize maths for the editor. Pure functions have no DOM access at import time so Node tests can load it;
// applyOp creates its canvas only when called. Ops: {type:'rot',dir:1|-1}, {type:'flip',axis:'x'|'y'}, {type:'crop',x,y,w,h} (0..1).

export function opDims(op, w, h) {
  if (op.type === 'rot') return [h, w];
  if (op.type === 'crop') return [Math.max(1, Math.round(op.w * w)), Math.max(1, Math.round(op.h * h))];
  return [w, h];
}

// Returns new strokes for the image after `op`; (w, h) are the dimensions before it.
export function transformStrokes(strokes, op, w, h) {
  const mapPts = (f) => strokes.map((s) => ({ ...s, pts: s.pts.map(f) }));
  if (op.type === 'rot') return mapPts(op.dir === 1 ? ([x, y]) => [1 - y, x] : ([x, y]) => [y, 1 - x]);
  if (op.type === 'flip') return mapPts(op.axis === 'x' ? ([x, y]) => [1 - x, y] : ([x, y]) => [x, 1 - y]);
  const long = Math.max(w, h), [cw, ch] = opDims(op, w, h), scale = long / Math.max(cw, ch);
  const out = [];
  for (const s of strokes) {
    const r = s.w * long / 2, x0 = op.x * w - r, x1 = (op.x + op.w) * w + r, y0 = op.y * h - r, y1 = (op.y + op.h) * h + r;
    if (!s.pts.some(([x, y]) => x * w >= x0 && x * w <= x1 && y * h >= y0 && y * h <= y1)) continue;
    out.push({ ...s, w: s.w * scale, pts: s.pts.map(([x, y]) => [(x - op.x) / op.w, (y - op.y) / op.h]) });
  }
  return out;
}

// Clamp a 0..1 rect into the image; null if it is under minPx on either side.
export function clampCrop(rect, w, h, minPx = 8) {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  const cw = Math.min(1, rect.x + rect.w) - x, ch = Math.min(1, rect.y + rect.h) - y;
  if (cw * w < minPx || ch * h < minPx) return null;
  return { x, y, w: cw, h: ch };
}

// Size for a target width keeping the ratio, long side capped at `max`.
export function fitSize(w, h, targetW, max) {
  let tw = Math.max(1, targetW), th = tw * h / w;
  const long = Math.max(tw, th);
  if (long > max) { tw *= max / long; th *= max / long; }
  return [Math.max(1, Math.round(tw)), Math.max(1, Math.round(th))];
}

// Returns a new canvas with `op` applied to src (w x h pixels). Caller releases the old one.
export function applyOp(src, op, w, h) {
  const [nw, nh] = opDims(op, w, h);
  const out = Object.assign(document.createElement('canvas'), { width: nw, height: nh });
  const ctx = out.getContext('2d');
  if (op.type === 'rot') {
    ctx.translate(nw / 2, nh / 2);
    ctx.rotate(op.dir * Math.PI / 2);
    ctx.drawImage(src, -w / 2, -h / 2);
  } else if (op.type === 'flip') {
    const x = op.axis === 'x';
    ctx.translate(x ? w : 0, x ? 0 : h);
    ctx.scale(x ? -1 : 1, x ? 1 : -1);
    ctx.drawImage(src, 0, 0);
  } else {
    ctx.drawImage(src, Math.round(op.x * w), Math.round(op.y * h), nw, nh, 0, 0, nw, nh);
  }
  return out;
}
