# AGENTS.md

@workflow.md

This file provides guidance to AI coding agents when working with this repository.

## Running the App

Source lives in `src/`; `npm run build` writes the deployable site to `dist/` (gitignored). Install once with `npm install`.

```bash
npm run build   # dist/: index.html + hashed app.*.js/css, static files, and image-inspector.html
npm run dev     # build, watch src/ public/ vendor/, serve dist/ on http://localhost:8000
```

Deploy: Cloudflare Pages runs `npm run build` and serves `dist/`. Don't commit `dist/`.

## Layout

- `src/index.html` — page template (`{{HEAD_LINKS}}`, `{{CSS}}`, `{{FOOTER}}`, `{{JS}}` are filled by the build)
- `src/js/` — ES modules; `main.js` is the entry. `src/styles.css` is hand-written CSS, `src/tailwind.css` the Tailwind input (it scans `src/`, so classes inside JS template strings work)
- `public/` — copied to `dist/` as-is (icons, manifest, `_headers`, robots, Google verification)
- `vendor/exifr.esm.js` — vendored exifr, bundled into the app
- `scripts/build.mjs` — esbuild (IIFE bundle) + Tailwind CLI. Emits two pages:
  - `index.html` — hashed assets (so the 1-year immutable cache in `_headers` is safe)
  - `image-inspector.html` — everything inlined, linked from the footer as "Download the full page". Works offline from `file://`; the Google Lens button is hidden because it needs an upload service

## Architecture

No framework. The app is a set of ES modules bundled into one script. All processing is client-side.

**Shared state:** `state` in `src/js/state.js` (`currentFileType`, `currentExifRows`, `currentPalette`, `currentBuffer`, `currentMime`, `currentSourceUrl`, `imageQueue`, `queueIndex`). ES modules can't reassign imported bindings, so always write `state.x = ...`. Module-private state stays a local `let`.

**Core data flow:**
1. File enters via drag-drop, file input, or paste (`analyzeFile()`)
2. Routed to `analyzeImage()` or `analyzeVideo()`
3. Binary buffer is parsed (hand-rolled DataView parsing for JPEG markers, PNG chunks, EXIF/TIFF, MP4 boxes)
4. Results rendered via `showImageResults()` / `showVideoResults()`

**Key subsystems:**

- **Binary parsers:** `parseJPEGQuality()`, `parseJPEGDPI()`, `parsePNGDPI()`, `parseEXIFFull()`, `parseBitDepth()`, `parseMP4FrameRate()` — each handles one metadata type
- **Visual analysis:** `extractVisualData()` samples a 200×200px canvas to build RGB histograms and a 6-color dominant palette; `drawHistogram()` / `drawHistogramLarge()` render to canvas
- **Steganography detection:** `checkSteganography()`, `findJPEGAppendedOffset()`, `findPNGAppendedOffset()`, `sniffDataType()` — scan for data appended after EOF markers
- **Blur & Download:** `blur.js` (modal UI, brush strokes stored as normalized points, full-resolution export) and `blur-engine.js` (native `ctx.filter` where it exists, else a 3-pass box blur because Safari has no canvas filter). Phones cap export size to stay within canvas memory and use the share sheet to save
- **UI:** lightbox zoom with pixel loupe (`openLightbox()`), histogram expand modal (`openHistogramModal()`), dark/light theme via localStorage

No data leaves the browser except paste-by-URL (`fetch`) and Google Lens (uploads the image to a temporary host).

There is no service worker; the manifest only makes it installable.
