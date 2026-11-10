# Image Workbench Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Blur & Download tool with pixelate and solid brush effects, an optional metadata strip, format/quality/target-size output with a size readout, copy to clipboard, and a post-export metadata report.

**Architecture:** Pure logic goes in small new modules (`effects.js`, `parsers/jpeg-exif.js`, `output.js`, `metadata-report.js`) covered by `node --test`. `blur.js` is wired to them. Each stroke records its own effect, so blur, pixelate and solid can be mixed on one image. Export keeps the existing full-resolution replay.

**Tech Stack:** Vanilla ES modules, esbuild, Tailwind, `node:test` (built in, no new dependency).

**Spec:** `docs/superpowers/specs/2026-11-10-image-workbench-design.md` (phase 1 only; geometry is a later plan).

## Global Constraints

- No framework, no new runtime dependency; the offline `image-inspector.html` must still work from `file://`.
- State goes through `state` in `src/js/state.js` (`state.x = ...`).
- Export caps stay: `EXPORT_MAX` 4096 desktop, 3072 touch. Canvases are released after use (`release(...)`).
- Metadata stripping stays ON by default; current behavior is unchanged until the user switches it off.
- Do not add Co-Authored-By lines to commits. Commit to `main`.
- Subagents run on sonnet or haiku, never Opus (ask the user first if Opus seems needed).

## Review Focus

- Preserved EXIF carries an embedded thumbnail of the unblurred original: it must be zeroed and unlinked.
- Preserved EXIF orientation must be reset to 1, or a rotated phone photo is rotated twice.
- PNG has no quality: the quality slider and target-size are disabled for PNG, and Copy always uses PNG.
- Clipboard is unavailable on `file://` and some browsers: the Copy button must hide, not fail on click.
- Target-size may be unreachable (tiny target on a large image): return the lowest quality result and say so.
- The original has no metadata: the report says "No metadata found", never "Removed: 0 fields".
- Undo after Clear must restore strokes with their original effects (existing undo stack, now carrying `fx`).
- Source file is not JPEG while "Remove metadata" is off: the output is stripped, with a visible note saying why.

---

### Task 1: Effects module (pixelate, solid, blur dispatch)

**Files:**
- Create: `src/js/effects.js`, `tests/effects.test.mjs`
- Modify: `package.json` (add `"test": "node --test tests/"`)

**Interfaces:**
- Produces: `export const EFFECTS = ['blur', 'pixelate', 'solid']`
- Produces: `export function pixelBlockSize(strength: number, w: number, h: number): number`: strength 1 to 100; returns `max(2, round(strength / 100 * max(w, h) * 0.06))`.
- Produces: `export function effectLayer(fx: 'blur'|'pixelate'|'solid', src: HTMLCanvasElement, strength: number): HTMLCanvasElement`: a new canvas the size of `src`. Blur calls `blurCanvas(src, strength / 100 * max(w,h) * 0.03)`. Pixelate downsamples by the block size and upsamples with `imageSmoothingEnabled = false`. Solid is filled `#000`. The caller releases it.

- [ ] **Step 1: Write failing tests** in `tests/effects.test.mjs` for `pixelBlockSize` only (canvas code is browser-only): `pixelBlockSize(1, 100, 100) === 2`; `pixelBlockSize(100, 1000, 500) === 60`; `pixelBlockSize(50, 4000, 3000) === 120`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `effects.js` per the signatures above; `pixelBlockSize` must not touch `document`, so the file can be imported by Node (import `blurCanvas` lazily inside `effectLayer`).
- [ ] **Step 4:** Run `npm test`. Expected: 3 pass.
- [ ] **Step 5:** Commit `feat(blur): effects module with pixelate and solid`.

### Task 2: Per-stroke effects in the blur tool

**Files:**
- Modify: `src/js/blur.js` (strokes, `render`, `exportBlob`, modal template)

**Interfaces:**
- Consumes: `effectLayer`, `EFFECTS` from Task 1.
- Produces: strokes become `{ w, fx, pts }`. The modal gets an effect picker `[data-fx]` (three buttons Blur / Pixelate / Solid, default Blur) and the existing Strength slider labels apply to the active effect (hidden for Solid). In "Whole image" mode the active effect applies to everything.

- [ ] **Step 1:** In `pointerdown`, set `fx` from the active picker value on the new stroke.
- [ ] **Step 2:** Replace the single `blurred` layer with a per-effect layer cache built lazily by `effectLayer(fx, base, strength)`, rebuilt (debounced 60 ms, as `makeBlur` is today) when strength changes. `render` draws the base, then for each fx present in `strokes` composites that layer through a mask of only that fx's strokes (reuse `paintStroke` for the mask; one mask canvas per fx, released on close).
- [ ] **Step 3:** In `exportBlob`, do the same at export size: group strokes by `fx`, build each layer from the full-size original with the same strength, mask, composite. Whole-image mode applies the active effect only.
- [ ] **Step 4:** Build (`npm run build`) and verify in the browser (see Task 7 harness): paint blur then pixelate then solid on one image; Undo and Cmd+Z remove strokes in reverse; Clear then Undo restores all with their effects; the exported file matches the preview.
- [ ] **Step 5:** Commit `feat(blur): pixelate and solid brush effects`.

### Task 3: JPEG EXIF preserve module

**Files:**
- Create: `src/js/parsers/jpeg-exif.js`, `tests/jpeg-exif.test.mjs`

**Interfaces:**
- Produces: `export function extractExifSegment(jpeg: Uint8Array): Uint8Array | null`: the full APP1 "Exif\0\0" segment including marker and length, or null.
- Produces: `export function sanitizeExifSegment(seg: Uint8Array): Uint8Array`: returns a copy with orientation (tag 0x0112) set to 1 where present, the IFD1 link (next-IFD offset in IFD0) set to 0, and the thumbnail bytes (tags 0x0201 offset, 0x0202 length in IFD1) overwritten with zeros.
- Produces: `export function injectExifSegment(jpeg: Uint8Array, seg: Uint8Array): Uint8Array`: inserts `seg` right after SOI (after JFIF APP0 if present), removing any existing Exif APP1.

- [ ] **Step 1: Write failing tests** with synthetic bytes built in the test: (a) `extractExifSegment` returns null for a JPEG without EXIF and the segment for one with; (b) `sanitizeExifSegment` of a segment with orientation 6 reads back 1, with IFD1 linked to a 4-byte thumbnail `[0xFF,0xD8,0xAA,0xBB]` leaves no `0xAA`/`0xBB` bytes and a zero IFD1 link; (c) `injectExifSegment` into a bare JPEG then `extractExifSegment` round-trips the same bytes; injecting twice leaves exactly one Exif APP1.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement with `DataView`; handle both byte orders ("II" and "MM"); reject (return input unchanged / null) on malformed lengths instead of throwing.
- [ ] **Step 4:** Run `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: JPEG EXIF extract, sanitize and inject`.

### Task 4: Remove-metadata switch

**Files:**
- Modify: `src/js/blur.js` (template note line 51, `exportBlob`, `dl.onclick`)

**Interfaces:**
- Consumes: Task 3 functions; `state.currentBuffer` (original bytes), `state.currentMime`.
- Produces: `[data-strip]` checkbox, default checked, label "Remove metadata (EXIF, GPS)". `exportBlob` returns `{ blob: Blob, kept: boolean }`.

- [ ] **Step 1:** Add the checkbox to the template, replacing the static note; the note becomes dynamic: checked → "Saved copy has metadata removed."; unchecked and JPEG → "Camera info and GPS from the original are kept. Embedded preview image is removed."; unchecked and non-JPEG → "Only JPEG can keep metadata; this file will still be stripped."
- [ ] **Step 2:** After encoding, when the box is unchecked and `outType === 'image/jpeg'`, take `extractExifSegment(original)`, run `sanitizeExifSegment`, and `injectExifSegment` into the encoded bytes; set `kept = true`.
- [ ] **Step 3:** Verify in the browser with a JPEG containing GPS: unchecked export re-parsed by the app (drop it back in) shows GPS and orientation correct; checked export shows none.
- [ ] **Step 4:** Commit `feat(blur): optional metadata keep for JPEG`.

### Task 5: Output controls (format, quality, target size, size readout)

**Files:**
- Create: `src/js/output.js`, `tests/output.test.mjs`
- Modify: `src/js/blur.js`

**Interfaces:**
- Produces: `export async function findQualityForTarget(encode: (q: number) => Promise<number>, targetBytes: number): Promise<{ quality: number, bytes: number, reached: boolean }>`: binary search over quality 0.30 to 0.95, at most 7 calls to `encode` (which returns the byte size); `reached` false when even 0.30 exceeds the target (result is the 0.30 one).
- Produces in the modal: format select (JPEG, PNG, WebP; default is the current `outType`), quality slider 30 to 95 (default 92, disabled for PNG), an optional "Target size" input in KB, and a readout "Original 3.2 MB → 410 KB".

- [ ] **Step 1: Write failing tests** with a fake `encode` (`bytes = 1000 * q * 100`): target between bounds converges within 7 calls and `bytes <= target`; target below the 0.30 size returns `reached: false, quality: 0.30`; target above the 0.95 size returns `quality: 0.95, reached: true`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `findQualityForTarget`.
- [ ] **Step 4:** Wire the controls in `blur.js`: `exportBlob` reads format and quality; extension and filename follow the chosen format. Size readout on desktop re-renders and encodes after a 500 ms debounce on any change; on touch it is shown after Download only. Render the final canvas once and reuse it for all `encode` calls in the search.
- [ ] **Step 5:** Verify in the browser: PNG disables the slider; target 200 KB on a large JPEG lands at or under 200 KB; an unreachable target shows "Smallest possible: X KB".
- [ ] **Step 6:** Commit `feat(blur): format, quality and target-size output`.

### Task 6: Copy to clipboard

**Files:**
- Modify: `src/js/blur.js` (template, handler)

**Interfaces:**
- Produces: `[data-copy]` button next to Download, label "Copy". Hidden unless `window.isSecureContext && typeof ClipboardItem !== 'undefined'`.

- [ ] **Step 1:** On click, pass a promise of the PNG blob to `new ClipboardItem({ 'image/png': promise })` so Safari keeps the user gesture, then `navigator.clipboard.write([item])`. Always PNG regardless of the chosen output format, with the same effects applied. Metadata is not applicable (clipboard PNG has none).
- [ ] **Step 2:** Show "Copied" on the button for 1.5 s; on failure show "Copy failed" and leave Download working.
- [ ] **Step 3:** Verify in the browser over `http://localhost:8000` (paste into another app) and confirm the button is hidden when opened from `file://` (`dist/image-inspector.html`).
- [ ] **Step 4:** Commit `feat(blur): copy result to clipboard`.

### Task 7: Metadata report + verification

**Files:**
- Create: `src/js/metadata-report.js`, `tests/metadata-report.test.mjs`
- Modify: `src/js/blur.js`, `tasks/todo.md`

**Interfaces:**
- Consumes: `state.currentExifRows: Array<[label: string, value: string]>`
- Produces: `export function describeMetadata(rows: Array<[string, string]>, kept: boolean): string`.
  - No rows → `"No metadata found in the original."`
  - Removed, with GPS row → `"Removed: GPS location, camera (Make, Model), N other fields."` (camera part only if a Make or Model row exists; N counts the rest, singular "1 other field")
  - Kept → `"Kept: ..."` with the same wording.

- [ ] **Step 1: Write failing tests** for: empty rows; GPS plus Make plus Model plus two others; one other field (singular); kept variant.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `describeMetadata`.
- [ ] **Step 4:** After a successful export or copy, show the string in a `[data-report]` line under the Download button; clear it on `dirty()`.
- [ ] **Step 5: End-to-end check** with Playwright (Chromium and the WebKit iPhone profile used before): JPEG with GPS, each effect, strip on and off, PNG and WebP output, target size, Copy, report text, and a 5000×3800 image on the touch profile. Record results and anything not tested on a real device in the Review section of `tasks/todo.md`.
- [ ] **Step 6:** Update `AGENTS.md` (effects, jpeg-exif, output modules; `npm test`), then commit `feat(blur): metadata report` and `docs: phase 1 results`.

---

## Self-review notes

- Spec coverage: pixelate/solid (T1, T2), optional strip (T3, T4), format/quality/compress with size readout and target size (T5), clipboard (T6), metadata report (T7), undo continues to work (T2 check). Geometry, toolbar and color counter/diff are later plans.
- Names checked across tasks: `EFFECTS`, `effectLayer`, `pixelBlockSize`, `extractExifSegment`, `sanitizeExifSegment`, `injectExifSegment`, `findQualityForTarget`, `describeMetadata`; `exportBlob` returns `{ blob, kept }` from Task 4 on.
- Order matters only where tasks share `blur.js` (2, 4, 5, 6, 7 must run in sequence). Tasks 1, 3 and the two pure modules in 5 and 7 can run in parallel.
