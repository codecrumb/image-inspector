import { state } from './state.js';
import { extractVisualData } from './parsers/visual-data.js';
import { parseMP4FrameRate } from './parsers/mp4.js';
import { aspectRatio, formatBitrate, formatBytes, formatDuration, formatMimeType } from './util.js';
import { renderVisualAnalysis } from './visual.js';
import { renderExif } from './exif-render.js';

// ── Video analysis ────────────────────────────────────────────────────────
export function analyzeVideo(file, onDone = null) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;

  video.onloadedmetadata = () => {
    video.currentTime = Math.min(1, video.duration * 0.1);
  };

  video.onseeked = () => {
    const canvas = document.getElementById('videoThumb');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const visualData = extractVisualData(canvas);

    const mime = file.type.toLowerCase();
    const needsFps = mime === 'video/mp4' || mime === 'video/quicktime';
    if (needsFps) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fps = parseMP4FrameRate(e.target.result);
        const _args = [file, canvas, video.videoWidth, video.videoHeight, video.duration, fps, visualData];
        if (onDone) onDone(_args); else showVideoResults(..._args);
        URL.revokeObjectURL(url);
      };
      reader.onerror = () => {
        const _args = [file, canvas, video.videoWidth, video.videoHeight, video.duration, null, visualData];
        if (onDone) onDone(_args); else showVideoResults(..._args);
        URL.revokeObjectURL(url);
      };
      reader.readAsArrayBuffer(file.slice(0, 5 * 1024 * 1024));
    } else {
      const _args = [file, canvas, video.videoWidth, video.videoHeight, video.duration, null, visualData];
      if (onDone) onDone(_args); else showVideoResults(..._args);
      URL.revokeObjectURL(url);
    }
  };

  video.onerror = () => { URL.revokeObjectURL(url); alert('Could not read video.'); };
  video.src = url;
}

export function showVideoResults(file, canvas, w, h, duration, fps, visualData) {
  state.currentFileType = 'video';
  state.currentSourceUrl = null;
  document.getElementById('lensBtn').classList.add('hidden');
  document.getElementById('blurBtn').classList.add('hidden');
  state.currentExifRows = [];
  state.currentPalette  = visualData.palette;

  const preview = document.getElementById('preview');
  if (preview._prevURL) { URL.revokeObjectURL(preview._prevURL); preview._prevURL = null; }
  preview.classList.add('hidden');
  canvas.classList.remove('hidden');

  document.getElementById('cell-pixels').classList.add('hidden');
  document.getElementById('cell-dpi').classList.add('hidden');
  document.getElementById('cell-bitdepth').classList.add('hidden');
  document.getElementById('cell-quality').classList.add('hidden');
  document.getElementById('cell-orientation').classList.add('hidden');
  document.getElementById('cell-duration').classList.remove('hidden');
  document.getElementById('cell-bitrate').classList.remove('hidden');
  document.getElementById('cell-fps').classList.remove('hidden');

  document.getElementById('stat-format').textContent     = formatMimeType(file.type);
  document.getElementById('stat-size').textContent       = formatBytes(file.size);
  const sizeSub2 = document.getElementById('stat-size-sub');
  if (file.size >= 1024) {
    sizeSub2.textContent = `(${file.size.toLocaleString()} B)`;
    sizeSub2.classList.remove('hidden');
  } else {
    sizeSub2.classList.add('hidden');
  }
  document.getElementById('stat-resolution').textContent = w && h ? `${w} × ${h} px` : '—';
  document.getElementById('stat-aspect').textContent     = w && h ? aspectRatio(w, h) : '—';
  document.getElementById('stat-duration').textContent   = formatDuration(duration);
  document.getElementById('stat-bitrate').textContent    = formatBitrate(file.size, duration);

  const fpsEl   = document.getElementById('stat-fps');
  const fpsNote = document.getElementById('stat-fps-note');
  if (fps !== null) {
    fpsEl.textContent   = fps + ' fps';
    fpsNote.textContent = 'Source: MP4 moov/trak/mdia';
    fpsNote.classList.remove('hidden');
  } else {
    fpsEl.textContent   = '—';
    fpsNote.textContent = 'Frame rate not available for this format.';
    fpsNote.classList.remove('hidden');
  }

  document.getElementById('stegoWarning').classList.add('hidden');
  document.getElementById('stegoScanSection').classList.add('hidden');
  state.currentBuffer = null;
  renderVisualAnalysis(visualData);
  renderExif([]);
  document.getElementById('results').classList.remove('hidden');
}
