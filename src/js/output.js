const Q_MIN = 0.3, Q_MAX = 0.95;

// Binary search for the highest quality whose encoded size fits targetBytes. At most 7 encode calls.
export async function findQualityForTarget(encode, targetBytes) {
  const top = await encode(Q_MAX);
  if (top <= targetBytes) return { quality: Q_MAX, bytes: top, reached: true };
  const bottom = await encode(Q_MIN);
  if (bottom > targetBytes) return { quality: Q_MIN, bytes: bottom, reached: false };
  let lo = Q_MIN, hi = Q_MAX, best = { quality: Q_MIN, bytes: bottom, reached: true };
  for (let i = 0; i < 5; i++) {
    const q = Math.round((lo + hi) * 50) / 100;
    const bytes = await encode(q);
    if (bytes <= targetBytes) { best = { quality: q, bytes, reached: true }; lo = q; } else hi = q;
  }
  return best;
}
