// ── Color probes (pure) ───────────────────────────────────────────────────
// A probe is a point or rectangle stored as normalized (0..1) coordinates of
// the original image, so it survives resizing like the blur strokes do.

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Returns [h 0-359, s 0-100, l 0-100], all rounded integers.
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h) % 360, Math.round(s * 100), Math.round(l * 100)];
}

// Mean RGB of an RGBA byte array (alpha ignored, matching the point sampler).
export function averageRgb(data) {
  const n = data.length / 4;
  if (!n) return [0, 0, 0];
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// Normalized drag from (x0,y0) to (x1,y1) -> pixel rect inside a w×h image,
// at least 1×1, or null if the drag is too small to count as a region.
export function dragToRect(x0, y0, x1, y1, w, h, minPx = 3) {
  const clamp = (v, max) => Math.max(0, Math.min(max, v));
  const ax = clamp(Math.min(x0, x1) * w, w), bx = clamp(Math.max(x0, x1) * w, w);
  const ay = clamp(Math.min(y0, y1) * h, h), by = clamp(Math.max(y0, y1) * h, h);
  if (bx - ax < minPx && by - ay < minPx) return null;
  const x = Math.floor(ax), y = Math.floor(ay);
  return { x, y, w: Math.max(1, Math.min(w - x, Math.ceil(bx) - x)), h: Math.max(1, Math.min(h - y, Math.ceil(by) - y)) };
}

const csvCell = v => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

// probes: [{ id, label, kind: 'point'|'region', x, y, w, h (px of original), rgb: [r,g,b] }]
export function probesToCsv(probes, fileName, imgW, imgH) {
  const head = ['id', 'label', 'type', 'x', 'y', 'width', 'height', 'x_norm', 'y_norm', 'r', 'g', 'b', 'hex', 'h', 's', 'l', 'file', 'image_width', 'image_height'];
  const rows = probes.map(p => {
    const [r, g, b] = p.rgb, [h, s, l] = rgbToHsl(r, g, b);
    return [p.id, p.label, p.kind, p.x, p.y, p.w, p.h,
      (p.x / imgW).toFixed(5), (p.y / imgH).toFixed(5), r, g, b, rgbToHex(r, g, b), h, s, l, fileName, imgW, imgH];
  });
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
