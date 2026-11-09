import { state } from './state.js';
import { showCopyFeedback } from './copy-feedback.js';

// ── Export summary ────────────────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  const lines = [];
  const title = state.currentFileType === 'video' ? 'Video Analysis' : 'Image Analysis';
  lines.push(title);
  lines.push('─'.repeat(36));

  const always = [['Format','stat-format'],['File Size','stat-size'],['Resolution','stat-resolution'],['Aspect Ratio','stat-aspect']];
  const imageOnly = [['Megapixels','stat-pixels'],['DPI','stat-dpi'],['Orientation','stat-orientation']];
  const videoOnly = [['Duration','stat-duration'],['Bitrate','stat-bitrate'],['Frame Rate','stat-fps']];
  const statRows = [...always, ...(state.currentFileType === 'image' ? imageOnly : videoOnly)];

  for (const [label, id] of statRows) {
    const val = document.getElementById(id)?.textContent?.trim();
    if (val && val !== '—') lines.push(`${label.padEnd(14)}${val}`);
  }

  if (state.currentExifRows.length) {
    lines.push(''); lines.push('EXIF Data'); lines.push('─'.repeat(36));
    for (const [label, val] of state.currentExifRows) lines.push(`${label.padEnd(14)}${val}`);
  }

  if (state.currentPalette.length) {
    lines.push(''); lines.push('Visual Analysis'); lines.push('─'.repeat(36));
    lines.push(state.currentPalette.join('  '));
  }

  const text = lines.join('\n');
  const btn = document.getElementById('exportBtn');
  showCopyFeedback(btn, text);
});
