import { state } from './state.js';
import { parseJPEGDPI, parseJPEGQuality, parsePNGDPI } from './parsers/jpeg-png.js';
import { parseBitDepth } from './parsers/image-format.js';
import { buildExifRows, findJPEGEXIFBase, parseEXIFFull } from './parsers/exif-parse.js';
import { extractVisualData } from './parsers/visual-data.js';
import { checkSteganography, runAppendedDataScan } from './stego.js';
import { aspectRatio, formatBytes, formatMegapixels, formatMimeType } from './util.js';
import { renderVisualAnalysis } from './visual.js';
import { renderExif, runExifrEnrichment } from './exif-render.js';


// ── Image analysis ────────────────────────────────────────────────────────
export function analyzeImage(file, onDone = null) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const buffer = e.target.result;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      const mime = file.type.toLowerCase();

      // Draw to offscreen canvas for palette extraction
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = w; colorCanvas.height = h;
      colorCanvas.getContext('2d').drawImage(img, 0, 0);

      let dpiInfo = null;
      if (mime === 'image/jpeg' || mime === 'image/jpg') dpiInfo = parseJPEGDPI(buffer);
      else if (mime === 'image/png') dpiInfo = parsePNGDPI(buffer);

      let qualityInfo = null;
      if (mime === 'image/jpeg' || mime === 'image/jpg') qualityInfo = parseJPEGQuality(buffer);

      const bitDepthInfo = parseBitDepth(buffer, mime);

      // Full EXIF (JPEG only)
      let exifRows = [];
      let orientationInfo = null;
      if (mime === 'image/jpeg' || mime === 'image/jpg') {
        const tiffBase = findJPEGEXIFBase(buffer);
        if (tiffBase !== null) {
          const exif = parseEXIFFull(buffer, tiffBase);
          if (exif) {
            exifRows = buildExifRows(exif);
            const ov = exif.ifd0[0x0112];
            const orientLabels = {
              1:'Normal', 2:'Flipped Horizontal', 3:'Rotated 180°',
              4:'Flipped Vertical', 5:'Rotated 90° CW + Flipped',
              6:'Rotated 90° CW', 7:'Rotated 90° CCW + Flipped', 8:'Rotated 90° CCW'
            };
            if (ov != null && orientLabels[ov] && ov !== 1) {
              orientationInfo = { label: orientLabels[ov], note: `EXIF value: ${ov}` };
            }
          }
        }
      }

      const visualData = extractVisualData(colorCanvas);
      const _args = [file, url, w, h, dpiInfo, exifRows, visualData, buffer, qualityInfo, bitDepthInfo, orientationInfo];
      if (onDone) onDone(_args); else showImageResults(..._args);
    };
    img.onerror = () => { URL.revokeObjectURL(url); alert('Could not read image dimensions.'); };
    img.src = url;
  };
  reader.readAsArrayBuffer(file);
}

export function showImageResults(file, url, w, h, dpiInfo, exifRows, visualData, buffer, qualityInfo, bitDepthInfo, orientationInfo = null) {
  state.currentFileType = 'image';
  document.getElementById('lensBtn').classList.remove('hidden');
  document.getElementById('blurBtn').classList.toggle('hidden', !url);
  state.currentExifRows = exifRows;
  state.currentPalette  = visualData.palette;
  state.currentBuffer   = buffer ?? null;
  state.currentMime     = file.type.toLowerCase();
  document.getElementById('iptcSection').classList.add('hidden');
  document.getElementById('iccSection').classList.add('hidden');

  const scanSection = document.getElementById('stegoScanSection');
  const mime = file.type.toLowerCase();
  if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') {
    scanSection.classList.remove('hidden');
    document.getElementById('scanResult').innerHTML = '<p class="text-gray-400 dark:text-gray-500">Scanning…</p>';
    setTimeout(runAppendedDataScan, 0);
  } else {
    scanSection.classList.add('hidden');
  }

  const preview = document.getElementById('preview');
  if (preview._prevURL) URL.revokeObjectURL(preview._prevURL);
  preview._prevURL = url;
  document.getElementById('videoThumb').classList.add('hidden');
  if (url) {
    preview.src = url;
    preview.classList.remove('hidden');
  } else {
    preview.src = '';
    preview.classList.add('hidden');
  }

  const isPsd = mime === 'image/vnd.adobe.photoshop' || mime === 'image/x-photoshop'
             || mime === 'image/photoshop' || mime === 'application/x-photoshop'
             || mime === 'application/photoshop' || /\.ps[db]$/i.test(file.name);
  const isJpeg = mime === 'image/jpeg' || mime === 'image/jpg';
  const hasBitDepth = isJpeg || mime === 'image/png' || isPsd;
  document.getElementById('cell-pixels').classList.remove('hidden');
  document.getElementById('cell-dpi').classList.remove('hidden');
  document.getElementById('cell-bitdepth').classList.toggle('hidden', !hasBitDepth);
  document.getElementById('cell-quality').classList.toggle('hidden', !isJpeg);
  document.getElementById('cell-orientation').classList.toggle('hidden', !orientationInfo);
  document.getElementById('cell-duration').classList.add('hidden');
  document.getElementById('cell-bitrate').classList.add('hidden');
  document.getElementById('cell-fps').classList.add('hidden');

  document.getElementById('stat-format').textContent = formatMimeType(file.type);
  document.getElementById('stat-size').textContent   = formatBytes(file.size);
  const sizeSub = document.getElementById('stat-size-sub');
  if (file.size >= 1024) {
    sizeSub.textContent = `(${file.size.toLocaleString()} B)`;
    sizeSub.classList.remove('hidden');
  } else {
    sizeSub.classList.add('hidden');
  }
  document.getElementById('stat-resolution').textContent = `${w} × ${h} px`;
  document.getElementById('stat-aspect').textContent = aspectRatio(w, h);

  document.getElementById('stat-pixels').textContent = formatMegapixels(w, h);
  const pixSub = document.getElementById('stat-pixels-sub');
  pixSub.textContent = `(${(w * h).toLocaleString()} px²)`;
  pixSub.classList.remove('hidden');

  const dpiEl   = document.getElementById('stat-dpi');
  const dpiNote = document.getElementById('stat-dpi-note');
  if (dpiInfo) {
    dpiEl.textContent  = dpiInfo.label;
    dpiNote.textContent = dpiInfo.note || '';
    dpiNote.classList.toggle('hidden', !dpiInfo.note);
  } else {
    const supported = ['image/jpeg','image/jpg','image/png'].includes(file.type.toLowerCase());
    dpiEl.textContent  = 'Not embedded';
    dpiNote.textContent = supported ? 'No DPI metadata found in this file.' : 'DPI metadata parsing not supported for this format.';
    dpiNote.classList.remove('hidden');
  }

  if (hasBitDepth) {
    const bdEl   = document.getElementById('stat-bitdepth');
    const bdNote = document.getElementById('stat-bitdepth-note');
    if (bitDepthInfo) {
      bdEl.textContent   = bitDepthInfo.label;
      bdNote.textContent = bitDepthInfo.note;
      bdNote.classList.remove('hidden');
    } else {
      bdEl.textContent   = 'Unknown';
      bdNote.textContent = 'Could not read bit depth from this file.';
      bdNote.classList.remove('hidden');
    }
  }

  if (isJpeg) {
    const qualEl   = document.getElementById('stat-quality');
    const qualNote = document.getElementById('stat-quality-note');
    if (qualityInfo) {
      qualEl.textContent   = qualityInfo.label;
      qualNote.textContent = qualityInfo.note;
      qualNote.classList.remove('hidden');
    } else {
      qualEl.textContent   = 'Not found';
      qualNote.textContent = 'No quantization table in this file.';
      qualNote.classList.remove('hidden');
    }
  }

  if (orientationInfo) {
    const orEl   = document.getElementById('stat-orientation');
    const orNote = document.getElementById('stat-orientation-note');
    orEl.textContent   = orientationInfo.label;
    orNote.textContent = orientationInfo.note;
    orNote.classList.remove('hidden');
  }

  checkSteganography(file, w, h);
  renderVisualAnalysis(visualData);
  renderExif(exifRows);
  document.getElementById('results').classList.remove('hidden');
  if (url) runExifrEnrichment(file);
}
