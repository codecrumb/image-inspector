# AGENTS.md

This file provides guidance to AI coding agents when working with this repository.

## Running the App

No build step required. Open `index.html` in a browser, or serve it with any static server:

```bash
python3 -m http.server 8000
```

The app is a PWA — no npm, no bundler, no dependencies beyond Tailwind CSS via CDN.

## Architecture

The entire application lives in a single file: `index.html` (~1700 lines). It contains all HTML, inline CSS, and JavaScript. There are no separate source files.

**Global state:** `currentFileType`, `currentExifRows`, `currentBuffer`, `currentPalette` — simple module-level variables.

**Core data flow:**
1. File enters via drag-drop, file input, or paste (`analyzeFile()`)
2. Routed to `analyzeImage()` or `analyzeVideo()`
3. Binary buffer is parsed (hand-rolled DataView parsing for JPEG markers, PNG chunks, EXIF/TIFF, MP4 boxes)
4. Results rendered via `showImageResults()` / `showVideoResults()`

**Key subsystems:**

- **Binary parsers:** `parseJPEGQuality()`, `parseJPEGDPI()`, `parsePNGDPI()`, `parseEXIFFull()`, `parseBitDepth()`, `parseMP4FrameRate()` — each handles one metadata type
- **Visual analysis:** `extractVisualData()` samples a 200×200px canvas to build RGB histograms and a 6-color dominant palette; `drawHistogram()` / `drawHistogramLarge()` render to canvas
- **Steganography detection:** `checkSteganography()`, `findJPEGAppendedOffset()`, `findPNGAppendedOffset()`, `sniffDataType()` — scan for data appended after EOF markers
- **UI:** lightbox zoom with pixel loupe (`openLightbox()`), histogram expand modal (`openHistogramModal()`), dark/light theme via localStorage

All processing is client-side only. No data leaves the browser except paste-by-URL (uses `fetch`).
