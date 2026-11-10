// One-line summary of what the saved copy did with the original's metadata.
export function describeMetadata(rows, kept) {
  if (!rows?.length) return 'No metadata found in the original.';
  const has = (l) => rows.some(([k]) => k === l);
  const others = rows.filter(([k]) => k !== 'GPS' && k !== 'Camera').length;
  const parts = [];
  if (has('GPS')) parts.push('GPS location');
  if (has('Camera')) parts.push('camera');
  if (others) parts.push(`${others} other field${others === 1 ? '' : 's'}`);
  return `${kept ? 'Kept' : 'Removed'}: ${parts.join(', ')}.`;
}
