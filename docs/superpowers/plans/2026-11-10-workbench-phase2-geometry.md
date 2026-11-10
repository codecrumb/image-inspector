# Image Workbench Phase 2 (Geometry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rotate, flip, crop and resize to the Blur & Download tool so several edits combine into one downloaded result.

**Architecture:** Geometry is a list of ops (`rot`, `flip`, `crop`) kept in the editor. Painted strokes are transformed with each op (they are stored as 0..1 coordinates, so this is plain arithmetic) and every op is one undo step. The preview re-bakes its downscaled working image after each op; export replays the same ops on the full-resolution original, then replays the strokes, then applies the resize and encodes. A pure `geometry.js` holds the maths and is covered by `node --test`; `blur.js` is wired to it.

**Tech Stack:** Vanilla ES modules, esbuild, Tailwind, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-10-image-workbench-design.md` (sections "My calls: Structure" and phase 2). Phase 1 plan: `docs/superpowers/plans/2026-11-10-workbench-phase1.md`.

## Global Constraints

- No framework, no new runtime dependency; the offline `image-inspector.html` must still work from `file://`.
- Export caps stay: `EXPORT_MAX` 4096 desktop, 3072 touch (the cap is applied to the original BEFORE the ops are replayed). Canvases are released after use (`release(...)`).
- Strokes are `{ w, fx, pts }`: `pts` are `[nx, ny]` in 0..1 of the current image; `w` is a fraction of the current long side.
- Preview must match the saved file (anti-goal in the spec). Pixelate/blur scale with image size already; geometry must not break that.
- Metadata rules from phase 1 are unchanged (strip on by default; `sanitizeExifSegment` already resets orientation to 1).
- Subagents run on sonnet or haiku, never Opus. No Co-Authored-By lines. Commit to `main`.

## Review Focus

- Rotate 90 on a non-square image swaps width and height: stroke positions land on the same pixels of the rotated picture, brush width is unchanged (long side is the same).
- Four rotations (or two flips on one axis) return strokes to the originals within float tolerance.
- Crop: strokes entirely outside the crop are dropped; partly outside are kept and clipped by the canvas; brush width rescales so it covers the same pixels.
- Undo of a geometry op restores both the picture and the exact previous strokes (including after Clear, and across several ops).
- Crop with a zero-size or off-image drag does nothing (no empty canvas, no NaN); minimum crop size 8 px.
- Resize: width and height stay in proportion, never below 1 px or above `EXPORT_MAX` (the preview says the capped size), and the size readout, target-size search and Copy all use the resized canvas.
- Export of a rotated/cropped large image on the touch profile does not exceed the cap and releases intermediate canvases (each op replaces the previous canvas).
- Closing the dialog mid-crop or mid-rebake leaves nothing allocated.

---

### Task 1: Geometry maths (pure)

**Files:**
- Create: `src/js/geometry.js`, `tests/geometry.test.mjs`

**Interfaces:**
- Produces: op shapes: `{ type: 'rot', dir: 1 | -1 }` (1 = clockwise), `{ type: 'flip', axis: 'x' | 'y' }` (`x` mirrors left-right), `{ type: 'crop', x, y, w, h }` (0..1 of the current image).
- Produces: `export function opDims(op, w, h): [number, number]` returns the dimensions after the op (rot swaps; flip same; crop `[max(1, round(op.w * w)), max(1, round(op.h * h))]`).
- Produces: `export function transformStrokes(strokes, op, w, h): Stroke[]` returns NEW stroke objects (same `fx`), never mutating the input. Rot CW maps `[nx, ny] -> [1 - ny, nx]`, CCW `[nx, ny] -> [ny, 1 - nx]`, `w` unchanged. Flip x `[1 - nx, ny]`, flip y `[nx, 1 - ny]`. Crop `[(nx - op.x) / op.w, (ny - op.y) / op.h]` with `w' = w * max(w0, h0) / max(cw, ch)` where `(w0, h0)` are the old dims and `(cw, ch)` the cropped dims. Crop drops a stroke when every point lies outside the crop rect grown by `s.w * max(w0, h0) / 2` pixels on each side.
- Produces: `export function clampCrop(rect, w, h, minPx = 8): { x, y, w, h } | null`: `rect` is `{x, y, w, h}` in 0..1; clamps into the image and returns null when width or height in pixels is below `minPx` after clamping.
- Produces: `export function fitSize(w, h, targetW, max): [number, number]`: height from width keeping ratio; width is clamped to `[1, max]` on the long side (i.e. if the result's long side exceeds `max`, scale down to it); both rounded, at least 1.
- Produces (browser only; no DOM access at import time): `export function applyOp(src: HTMLCanvasElement | HTMLImageElement, op, w, h): HTMLCanvasElement` returns a NEW canvas with the op applied to `src` (`w`, `h` = src pixel dimensions); caller releases the old one. Rot via translate/rotate; flip via scale(-1, 1)/(1, -1); crop via `drawImage` of the sub-rect.

- [ ] **Step 1: Write failing tests** in `tests/geometry.test.mjs` (`node:test`, `node:assert/strict`):
  - `rot cw maps a stroke point`: stroke `{w: .1, fx: 'blur', pts: [[0.25, 0.5]]}` on 400x200 rot cw -> pts `[[0.5, 0.25]]`, `w` 0.1, `opDims` gives `[200, 400]`.
  - `four rotations return the original` and `flip x twice returns the original` (assert `Math.abs(diff) < 1e-9`).
  - `rot ccw is the inverse of rot cw`.
  - `crop remaps and rescales`: image 1000x500, crop `{x: .5, y: 0, w: .5, h: 1}`, stroke `{w: .1, pts: [[0.75, 0.5]]}` -> pts `[[0.5, 0.5]]`, new `w` = 0.1 * 1000 / 500 = 0.2.
  - `crop drops a stroke fully outside` and `keeps one that overlaps the edge`.
  - `transformStrokes does not mutate its input`.
  - `clampCrop`: rect beyond the image is clamped; a 4 px wide result on a 1000 px image returns null.
  - `fitSize(4000, 3000, 1000, 4096)` -> `[1000, 750]`; `fitSize(4000, 3000, 9000, 4096)` -> `[4096, 3072]`; `fitSize(100, 100, 0, 4096)` -> `[1, 1]`.
- [ ] **Step 2:** `npm test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `geometry.js` per the signatures above; the pure functions must not touch `document` so Node can import the file.
- [ ] **Step 4:** `npm test`. Expected: all pass.
- [ ] **Step 5:** Commit `feat: geometry maths for rotate, flip, crop and resize`.

### Task 2: Geometry ops in the editor (rotate, flip, undo, export replay)

**Files:**
- Modify: `src/js/blur.js`

**Interfaces:**
- Consumes: `opDims`, `transformStrokes`, `applyOp` from Task 1.
- Produces: editor state `ops: Op[]` and `curW, curH` (dimensions of the current image at FULL resolution after the ops, with the EXPORT_MAX cap applied to the original first). Toolbar buttons `[data-rotl]` (rotate left), `[data-rotr]` (rotate right), `[data-flipx]` (mirror), `[data-flipy]` (flip vertically), in a new row "Transform" above the Strength row, small buttons with an icon or short label and `title`s. A function `applyGeometry(op)` used by Task 3 as well.

- [ ] **Step 1:** Make the working image rebuildable: factor the code in `img.onload` that creates `base`, `mask`, `scratch`, the per-effect `layers`/`masks`, `pw`/`ph` and `cv.width/height` into a function that can run again after an op (`rebuildPreview()`), releasing the previous canvases first.
- [ ] **Step 2:** `applyGeometry(op)`: push an undo entry `{ geom: true, op, before: <deep copy of strokes> }` on `undoStack`, transform `strokes` in place with `transformStrokes` (replace the array contents), append to `ops`, update `curW/curH` with `opDims`, rebake the preview image from the original through ALL `ops` at preview size (cheap: ops replayed on the 1600 px preview source), call `rebuildPreview()`, `repaintMask()`, `render()`, `dirty()`.
- [ ] **Step 3:** Extend `undo()` so a `{ geom }` entry pops the last op, restores `strokes` from `before`, rebakes and re-renders. Cmd/Ctrl+Z keeps working in every mode now (geometry applies in both Whole image and Paint areas modes; keep the existing brush-mode-only rule only for stroke entries, or simply allow the shortcut in both modes when the top entry is geometry). `Clear` after geometry still undoes as before.
- [ ] **Step 4:** Export: in `renderFinal`, after the original is drawn at the capped size, replay `ops` with `applyOp` (release each previous canvas), then replay strokes against the result dimensions, as today.
- [ ] **Step 5:** Verify in the browser (Playwright Chromium; see Task 5 for the harness): rotate right twice + flip: the exported file's dimensions and a painted blur spot line up with the preview; undo walks back each op; on a non-square image width/height swap; the readout and Copy use the transformed picture.
- [ ] **Step 6:** Commit `feat(blur): rotate and flip with strokes following the image`.

### Task 3: Crop tool

**Files:**
- Modify: `src/js/blur.js`

**Interfaces:**
- Consumes: `applyGeometry(op)` (Task 2), `clampCrop` (Task 1).
- Produces: a "Crop" button `[data-crop]` in the Transform row. While active, the preview canvas shows a draggable crop rectangle overlay (a positioned `div` over the canvas, or drawn on a second canvas) with "Apply" and "Cancel" buttons; Enter applies, Esc cancels (and Esc must not close the dialog while a crop is being drawn).

- [ ] **Step 1:** Entering crop mode disables brush drawing (pointer handlers ignore strokes) and shows the overlay; drag on the canvas to draw a rectangle in normalized coordinates (works with touch and mouse via pointer events, `touch-none` already on the canvas); dragging again redraws it. Aspect presets are not required (builder's call: optional Free/1:1/4:3/16:9 chips if small).
- [ ] **Step 2:** Apply -> `clampCrop(rect, curW, curH)`; if null, show a short "Crop is too small" message and stay in crop mode; otherwise `applyGeometry({ type: 'crop', ...rect })` and leave crop mode. Cancel just leaves crop mode.
- [ ] **Step 3:** Leaving the dialog while in crop mode (close, Esc handling) leaves nothing allocated; the backdrop-tap guard (`!strokes.length`) also treats an active crop as "work in progress".
- [ ] **Step 4:** Verify in the browser: crop the middle of an image with a painted stroke straddling the edge; the exported file is the cropped size and the stroke is clipped correctly; a stroke fully outside is gone and comes back with Undo; a 3x3 px drag does nothing but shows the message.
- [ ] **Step 5:** Commit `feat(blur): crop tool`.

### Task 4: Resize output

**Files:**
- Modify: `src/js/blur.js`

**Interfaces:**
- Consumes: `fitSize` (Task 1), `curW/curH` (Task 2).
- Produces: in the Output section, a "Width (px)" number input `[data-rw]` with the computed height shown next to it, and preset chips (e.g. 1080, 1920, 2048, "Original"); empty/"Original" means no resize. The final canvas is scaled (high-quality `imageSmoothingQuality = 'high'`) at the very end of `renderFinal`, before JPEG white fill and encoding. The value is clamped via `fitSize(curW, curH, w, EXPORT_MAX)`; if clamped, the helper text says so.

- [ ] **Step 1:** Add the controls and wire `input`/chip clicks to `syncOutput()` so the note, `dirty()` and the readout update. When geometry changes (`curW/curH` change), keep the entered width if still valid and refresh the computed height, otherwise reset to Original.
- [ ] **Step 2:** In `renderFinal`, after ops and strokes are composited, scale to the resized dimensions when set (release the larger canvas). Download, the size readout, target-size search and Copy all go through this path.
- [ ] **Step 3:** Verify in the browser: width 800 on a 3200x2400 image gives an 800x600 file; width larger than the cap is clamped with the message; after a crop the height updates; Copy gives the same dimensions.
- [ ] **Step 4:** Commit `feat(blur): resize output`.

### Task 5: End-to-end verification and docs

**Files:**
- Modify: `AGENTS.md` (the repo's `agents.md`), `tasks/todo.md`

- [ ] **Step 1:** With Playwright Chromium and the WebKit iPhone profile (reuse the earlier harness in the scratchpad `t7e2e/` if still present), cover: all four transform buttons, crop, resize, combined (crop + rotate + pixelate stroke + resize + JPEG) with output pixel checks that a marker colour painted with Solid ends up at the expected output location; undo through a mixed history (stroke, rotate, crop, clear) back to the start; a 5000x3800 image on the touch profile (cap respected, no crash); closing the dialog mid-crop; the phase 1 flows still work (strip on/off, formats, target size, Copy, report).
- [ ] **Step 2:** Update `AGENTS.md` (geometry.js, the ops model, `npm test`) and add a Review section to `tasks/todo.md` with the results and what was not tested on a real device.
- [ ] **Step 3:** Commit `docs: phase 2 geometry results`.

---

## Self-review notes

- Spec coverage: crop, resize (width-driven with ratio kept; the spec's "ratio lock" is always on, no free distortion: a deliberate simplification), rotate, flip (T1-T4); strokes follow geometry as one undo step each (T2); presets for max dimension (T4); verification (T5). Lightbox toolbar, color counter and image diff remain later phases.
- Names used across tasks: `opDims`, `transformStrokes`, `clampCrop`, `fitSize`, `applyOp`, `applyGeometry`, `rebuildPreview`, `ops`, `curW/curH`.
- Tasks 2 to 4 all edit `blur.js` and must run in order; Task 1 is independent.
