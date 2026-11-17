# HEIC / HEIF Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open HEIC/HEIF files with full results (preview, palette, histogram, EXIF, Blur & Download), showing container metadata instantly while a lazy-loaded libheif decoder produces the preview.

**Architecture:** A pure ISO-BMFF header parser gives dimensions/brand with no decoder (phase 1, rendered through the PSD-style no-preview path). A separately built, lazily injected libheif-js script decodes to RGBA (phase 2), which upgrades the queue slot in place. A new `error` slot status stops any undecodable file from hanging the loader.

**Tech Stack:** Vanilla ES modules bundled by esbuild (IIFE), libheif-js (wasm, LGPL-3.0), `node --test` for pure modules, Playwright (Chromium) e2e against `dist/`.

**Spec:** `docs/superpowers/specs/2026-11-16-heic-support-design.md`

## Global Constraints

- No framework; shared state only via `state` in `src/js/state.js` (`state.x = ...`).
- Decoder must be lazy: zero decoder bytes fetched unless a HEIC file is opened.
- The wasm is a hashed asset covered by the 1-year immutable cache in `public/_headers`.
- `image-inspector.html` (standalone) does NOT include the decoder; HEIC there shows "HEIC needs the hosted version".
- Decoded preview capped at the existing Blur `EXPORT_MAX` (3072 touch, 4096 desktop).
- Only the primary image is decoded. No stego scan for HEIC. No HEIC output format.
- The inspected `File` stays the original HEIC (size, format, EXIF); only the preview/Blur source is the decoded PNG.
- Commit messages: no co-author or joint-authorship trailers. Commit to `main`.

## Review Focus

- Empty `file.type` with a `.heic`/`.HEIC`/`.hif` name (Linux) must route to HEIC, not be silently ignored (Task 1 unit test, Task 4 e2e).
- HEIC with `irot` 90/270 must report swapped (displayed) width/height (Task 1 unit test).
- Primary item not the first image / thumbnail item with its own `ispe` must not supply the dimensions (Task 1 unit test).
- Corrupt or undecodable HEIC (and any other undecodable image): metadata remains, preview says unavailable, no endless loader (Tasks 2, 4 e2e).
- Reload with a HEIC in OPFS (the original bug) restores both phases; navigating away mid-decode and back shows the decoded preview (Task 4 e2e).

## File Structure

- Create `src/js/parsers/heic.js` — pure: HEIC detection + container header parse.
- Create `src/js/heic-decoder.js` — separate esbuild entry; runs libheif, exposes `window.__heicDecode`.
- Create `src/js/heic-load.js` — loads the decoder script on demand, memoized.
- Create `src/js/analyze-heic.js` — two-phase HEIC analysis.
- Modify `src/js/queue.js`, `src/js/analyze-image.js`, `src/js/parsers/image-format.js`, `src/index.html`, `scripts/build.mjs`, `public/_headers`, `package.json`, `AGENTS.md`, `tasks/todo.md`.
- Tests: `tests/heic.test.mjs`; fixture `tests/fixtures/sample.heic`.

---

### Task 1: HEIC detection and container parser

**Files:**
- Create: `src/js/parsers/heic.js`
- Test: `tests/heic.test.mjs`

**Interfaces:**
- Produces: `isHeicFile(file: {name: string, type: string}): boolean`; `parseHeicHeader(buffer: ArrayBuffer): { brand: string, width: number, height: number } | null` (width/height are the *displayed* size, i.e. swapped when the primary item has an `irot` of 90°/270°).

- [ ] **Step 1: Write failing tests in `tests/heic.test.mjs`.** Build minimal ISO-BMFF buffers with a local helper `box(type, ...children|bytes)`; cases for `parseHeicHeader`: (a) `ftyp heic` + `meta` > `pitm`(item 1) + `iprp/ipco[ispe 4032x3024]` + `ipma` → `{brand:'heic', width:4032, height:3024}`; (b) same with `irot` angle 1 associated to item 1 → `3024 × 4032`; (c) `irot` angle 2 → unswapped; (d) primary item 1 with `ispe 4032x3024` plus thumbnail item 2 with `ispe 320x240` → 4032x3024; (e) primary item is item 2 (pitm=2) → item 2's `ispe`; (f) `ftyp mif1` with compatible brand `heic` → parsed; (g) `ftyp avif` and `ftyp mp42` → `null`; (h) truncated buffer / zero-length → `null`. Cases for `isHeicFile`: `image/heic`, `image/heif`, `image/heic-sequence` → true; `{name:'a.HEIC', type:''}` and `{name:'a.hif', type:'application/octet-stream'}` → true; `{name:'a.heic', type:'image/jpeg'}` → false; `{name:'a.png', type:'image/png'}` → false.
- [ ] **Step 2:** Run `node --test tests/heic.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement both functions in `src/js/parsers/heic.js`.** DataView walk: top-level boxes → `ftyp` (major + compatible brands; accept if any of `heic heix hevc hevx heim heis`), `meta` (FullBox: skip 4 version/flags bytes) → `pitm` (primary id, version 0/1) and `iprp` > `ipco` (property list, 1-based index) + `ipma` (item → property indexes, version/flags-dependent widths). Pick the primary item's `ispe` and `irot`. Bounds-check every read; return `null` on any failure, never throw.
- [ ] **Step 4:** Run `npm test`. Expected: all pass (35 existing + new).
- [ ] **Step 5: Commit** — `git add src/js/parsers/heic.js tests/heic.test.mjs && git commit -m "feat(heic): container header parser and file detection"`

---

### Task 2: Error slot status (fix the hang)

**Files:**
- Modify: `src/js/queue.js`, `src/js/analyze-image.js:63`, `src/js/parsers/image-format.js:73`, `src/index.html:93` (add `#queueError` overlay beside `#queueLoading`)

**Interfaces:**
- Consumes: slot shape in `queue.js` (`status: 'analyzing'|'done'|'error'` already documented in `state.js`).
- Produces: `analyzeFile` callbacks may now be called as `onDone(null, errorMessage: string)`. A slot with `status:'error'` renders `#queueError` showing the file name and message, with `#queueLoading` hidden and the nav still usable. Task 4 relies on this.

- [ ] **Step 1: Write the e2e check first** (Playwright script in the session scratchpad, not committed): serve `dist/`, drop a file named `broken.png` containing 100 random bytes (type `image/png`) → expect `#queueError` visible with `broken.png`, `#queueLoading` hidden, no `alert`. Then reload the page (OPFS restore path) → expect the same error state, no spinner.
- [ ] **Step 2:** `npm run build`, run the script. Expected: FAIL (alert shown / spinner stays).
- [ ] **Step 3: Implement.** `analyzeImage`'s `img.onerror` and `analyzePSD`'s null-header path call `onDone(null, 'Could not read this file.')` when `onDone` exists (keep the alert only when there is no `onDone`). In `queueFiles`' callback, `args === null` sets `slot.status = 'error'`, `slot.error = message`. `navigateTo` handles `'error'`: hide `#queueLoading`, show `#queueError`, show `#results`. Hide `#queueError` on every other branch.
- [ ] **Step 4:** Rebuild, rerun the script. Expected: PASS, including the reload case.
- [ ] **Step 5: Commit** — `git add -A src && git commit -m "fix(queue): show an error for undecodable files instead of hanging"`

---

### Task 3: Lazy decoder build and loader

**Files:**
- Create: `src/js/heic-decoder.js`, `src/js/heic-load.js`
- Modify: `scripts/build.mjs`, `package.json` (add `libheif-js` dependency, exact version), `public/_headers`

**Interfaces:**
- Produces: `loadHeicDecoder(): Promise<(buffer: ArrayBuffer) => Promise<{ width: number, height: number, data: Uint8ClampedArray }>>` in `heic-load.js`, memoized, promise cleared on failure so a retry works; rejects with `Error('HEIC needs the hosted version')` when the build-time constant `__HEIC_JS__` is `null` (standalone build).
- Build emits `dist/heic-decoder.<hash>.js` and `dist/heic.<hash>.wasm`; esbuild `define` injects `__HEIC_JS__` (hosted: file name string, standalone: `null`). `_headers` gets a `/*.wasm` immutable rule. The dev server's MIME table gets `.wasm: application/wasm`.

- [ ] **Step 1: Write the failing check** (scratchpad Playwright plus a shell assertion): serve `dist/`, open the page, assert no request whose URL matches `heic` or `.wasm` is made on load; assert `dist/` contains exactly one `heic-decoder.*.js` and one `heic.*.wasm`, and that `dist/image-inspector.html` contains neither name. Expected now: FAIL (files absent). Actual decoding is exercised in Task 4.
- [ ] **Step 2: Implement build.** `npm install libheif-js`. Second `esbuild` call bundles `src/js/heic-decoder.js` (IIFE, minified) and copies libheif's wasm to a hashed name. In `heic-decoder.js`, instantiate libheif with `locateFile` pointing at the wasm next to the script (derive the base URL from `document.currentScript.src` captured at load), and set `window.__heicDecode` to decode the primary image to RGBA. Choose the libheif-js entry (separate `.wasm` file variant, not the base64 bundle) that esbuild handles cleanly.
- [ ] **Step 3: Implement `loadHeicDecoder`** by appending a `<script src=__HEIC_JS__>` and resolving `window.__heicDecode` on load.
- [ ] **Step 4:** `npm run build && npm test`. Expected: dist contents as asserted in Step 1; tests pass.
- [ ] **Step 5: Commit** — `git add -A package.json package-lock.json scripts public src && git commit -m "feat(heic): lazy libheif decoder build and loader"`

---

### Task 4: Two-phase HEIC analysis and routing

**Files:**
- Create: `src/js/analyze-heic.js`, `tests/fixtures/sample.heic`
- Modify: `src/js/queue.js` (`analyzeFile`, `queueFiles`, `navigateTo`), `src/js/analyze-image.js` (`showImageResults`), `src/index.html` (`accept` list on `#fileInput`, add `#previewStatus` element in the preview area)

**Interfaces:**
- Consumes: `isHeicFile`, `parseHeicHeader` (Task 1); error contract (Task 2); `loadHeicDecoder` (Task 3).
- Produces: `analyzeHeic(file: File, onDone: (args) => void, onUpgrade: (args: Array, previewBlob: Blob | null) => void): void`. Phase 1 calls `onDone(args)` with a 12th arg `previewState = 'decoding'`; phase 2 calls `onUpgrade(args, pngBlob)` with full args and `previewState = null`, or `onUpgrade(args, null)` with `previewState = 'unavailable'` on failure. `showImageResults(..., orientationInfo = null, previewState = null)` shows `#previewStatus` ("Decoding preview…" / "Preview unavailable") and hides it when `null`. `slot.result.previewBlob` (`Blob | null | undefined`): when `!== undefined`, `navigateTo` uses it (null means no preview URL) instead of recreating the URL from `args[0]`; existing image/PSD behavior unchanged when `undefined`.

- [ ] **Step 1: Create the fixture:** on macOS convert a small generated image (e.g. 64×48 gradient PNG written by a Node one-off) with `sips -s format heic in.png --out tests/fixtures/sample.heic`; keep it under ~10 KB and note its dimensions in the e2e script.
- [ ] **Step 2: Write the e2e script first** (scratchpad Playwright, Chromium, over `dist/`), asserting: (a) drop `sample.heic` → within 1 s `#stat-resolution` shows the fixture's dimensions while `#previewStatus` says "Decoding preview…" and the preview is hidden; (b) later the preview is visible, palette rendered, Blur button visible, `#previewStatus` hidden; (c) same file with `type` forced to `''` and name `PHOTO.HEIC` takes the same path; (d) a corrupt copy (valid `ftyp`+`meta`, truncated payload) ends with metadata visible and `#previewStatus` = "Preview unavailable", no spinner; (e) reload after (b) restores the file and reaches (b) again; (f) queue two files (HEIC then a PNG), navigate to the PNG during decoding and back after → HEIC shows the decoded preview. Run it: Expected FAIL.
- [ ] **Step 3: Implement `analyzeHeic`.** Read the buffer, `parseHeicHeader`; `null` → `onDone(null, 'Could not read this HEIC file.')`. Start `loadHeicDecoder()` immediately (before building phase-1 args). Phase 1 args mirror the PSD path (`url = null`, empty visual data object as in `analyzePSD`, `buffer`, no DPI/quality/bit depth). On decode: draw RGBA to a canvas scaled to `EXPORT_MAX` (reuse the existing constant; move it into `platform.js` if it is local to `blur.js`), `extractVisualData(canvas)`, `canvas.toBlob('image/png')`, then `onUpgrade`.
- [ ] **Step 4: Route in `analyzeFile`:** HEIC check goes first (before the `image/` mime test), since empty-MIME files currently fall through. Add `.heic,.heif,.hif` to `#fileInput` `accept`. In `queueFiles`, `onUpgrade` replaces `slot.result` (keeping `previewBlob`) and calls `navigateTo(idx)` only if `state.queueIndex === idx`. In `showImageResults`, run `runExifrEnrichment(file)` when `url || isHeicFile(file)` so phase 1 gets EXIF.
- [ ] **Step 5:** `npm run build`, run the e2e script and `npm test`. Expected: all pass. Also confirm the Blur dialog opens on the decoded preview and downloads a PNG (outType falls back to PNG for HEIC).
- [ ] **Step 6: Commit** — `git add -A src tests && git commit -m "feat(heic): two-phase HEIC analysis with lazy preview decode"`

---

### Task 5: Standalone behavior, docs, wrap-up

**Files:**
- Modify: `src/js/analyze-heic.js` (message path), `AGENTS.md`, `tasks/todo.md`

- [ ] **Step 1: Check standalone over `file://`** (scratchpad Playwright): open `dist/image-inspector.html`, drop `sample.heic` → metadata shows, `#previewStatus` reads "HEIC needs the hosted version", no network requests, no spinner. Expected FAIL if the rejection message isn't surfaced.
- [ ] **Step 2:** Surface `loadHeicDecoder`'s rejection message in `#previewStatus` instead of the generic "Preview unavailable" when it is the hosted-version error.
- [ ] **Step 3:** Rerun Step 1; then `npm test` and `npm run build`. Expected: pass; record the new test count.
- [ ] **Step 4: Update `AGENTS.md`** (add HEIC to Key subsystems and Layout: the four new modules, the two-phase flow, the separate decoder bundle and its `define` constant, the updated test count) and add a HEIC section with a Review to `tasks/todo.md` listing what was verified and what was not (no real-device or real-Linux-Chromium run unless done).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "docs: HEIC support, standalone message"`
