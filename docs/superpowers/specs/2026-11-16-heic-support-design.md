# HEIC / HEIF support (short design)

## Why
Dropping a `.heic` on Chromium for Linux fails: `<img>` can't decode it, so `analyzeImage` alerts "Could not read image dimensions." and the queue slot stays `analyzing`, so a reload (OPFS restore) hangs on the loader forever. The user had to transcode to JPEG by hand. Goal: HEIC opens like any other image, with preview, palette, histogram, EXIF and Blur & Download.

## Goals / non-goals
- Goals: HEIC/HEIF inspect with full results; metadata visible immediately while the decoder loads; an undecodable file of any type shows an error instead of hanging.
- Non-goals: HEIC as an output format; video codecs (ffmpeg.wasm was considered and rejected: ~25-30 MB, weak HEIC tile-grid handling, needs cross-origin-isolation headers); stego scan for HEIC; bundling the decoder into the offline `image-inspector.html`.
- Anti-goal: paying the decoder cost (~1.5 MB wasm) for users who never open HEIC.

## Approaches
1. **libheif-js, lazy-loaded (chosen).** Wasm decodes HEIC/HEIF (and AVIF) correctly, including tile grids. Hashed asset, so the existing 1-year immutable cache makes it a one-time download.
2. ffmpeg.wasm: rejected (above).
3. Browser-native only (`ImageDecoder`/`<img>`): rejected, still fails on the user's Omarchy Chromium.

## Design
**Two-phase result (user's idea).** On a HEIC file:
1. *Phase 1, instant, no decoder.* Parse the ISO-BMFF container (`ftyp` brand, `meta` > `iprp/ispe` for dimensions; handle `irot` rotation so w/h match the displayed image). Render through the PSD-style path: `url = null`, empty visual data, EXIF from the vendored exifr (it has HEIC support; verify on a real file). Show a "Decoding preview…" indicator in the preview area. The slot is `done` for navigation purposes but flagged `upgrading`.
2. *Phase 2, after lazy load.* Dynamic-import the libheif module, decode the primary image to RGBA, draw to canvas, `toBlob` PNG, build a `File`-like blob URL, run `extractVisualData`, and replace `slot.result` with full args (preview URL, palette, histogram, Blur button enabled). If that slot is still the current one, re-render; otherwise the upgraded result is simply there when the user navigates to it. The original HEIC `File` stays the inspected file (size, format, EXIF); only the preview/blur source is the decoded PNG.
3. Start the module fetch as soon as a HEIC is detected (before phase 1 finishes) so the load overlaps the container parse.

**Failure handling (all image types).** If decode fails or the module can't load: slot `status = 'error'`, show the file name plus a one-line message in the results/loading area, never leave the loader spinning. HEIC keeps its phase-1 metadata and shows "Preview unavailable" in place of the spinner. The PSD `onDone(null)` crash path gets the same treatment.

**Routing.** Detect HEIC by MIME (`image/heic`, `image/heif`, `-sequence` variants) or extension (`.heic`, `.heif`, `.hif`) when `file.type` is empty (Linux). Add the extensions to the file input's `accept`. Add `*.wasm` to the immutable-cache rules in `public/_headers`.

**Build.** `scripts/build.mjs` emits the libheif wasm as a hashed asset next to the app bundle and the loader is a dynamic import in the IIFE bundle (or a separate lazily-fetched script; builder's call, whichever esbuild handles cleanly). The standalone `image-inspector.html` omits it and shows "HEIC needs the hosted version" for HEIC files.

**Tests.** Pure container parser (`ispe`, `irot`, brand) unit-tested in `tests/` with a small fixture; e2e in Playwright Chromium over `dist/` with a real HEIC for both phases, the error path, and the OPFS-reload case that originally hung.

## Calls I made (veto freely)
- libheif-js license is LGPL; acceptable for a bundled static site.
- Decoded preview is capped like Blur's existing `EXPORT_MAX` to keep canvas memory sane on phones.
- Only the primary image is decoded (no burst/sequence frames).
- Standalone offline page does not include HEIC decoding.

## Left to the builder
Exact libheif-js package/version and wasm loading mechanism under esbuild; indicator copy and styling; fixture selection.
