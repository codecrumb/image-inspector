# Split + build + standalone page + blur fixes

Plan: ~/.claude/plans/jiggly-imagining-comet.md (branch: feat/blur-download)

- [x] 1. Scaffold: esbuild devDep, scripts/build.mjs, src/, public/, vendor/ (git mv static files)
- [x] 2. Extract CSS + JS modules in dependency order; state -> `state` object; build after each batch
- [x] 3. Standalone build (image-inspector.html) + footer download link
- [x] 4. Behavior check vs main (JPEG/PNG/MP4/PSD, file:// standalone)
- [x] 5. Blur fixes: iOS blur fallback, memory/preview res, share-sheet save, UX gaps
- [x] 6. Mobile testing (WebKit iPhone profile, Chrome emulation)
- [x] 7. Update AGENTS.md/agents.md, package.json, .gitignore
- [ ] 8. Cloudflare settings (user) then merge

## Review
- Split: 24 ES modules in src/js, `npm run build` -> dist/ (hashed site + inlined image-inspector.html). Text of results panel identical to main for JPEG/PNG(appended data)/huge JPEG in Chromium and WebKit; standalone verified over file:// (exifr data present, Lens hidden).
- Blur (tested in Playwright WebKit iPhone 13 + Chromium Pixel 7 profiles, NOT on a physical phone): WebKit has no ctx.filter, old fallback was blocky; new box blur matches native (mean diff 0.46/255). Brush mask, undo, 5000x3800 export (3072px on touch) verified from output files. Share-sheet save only stubbed, needs a real iPhone.
- Left for the user: Cloudflare Pages build settings (`npm run build`, output `dist`), then merge.

# Workbench phase 1 (pixelate/solid, metadata keep, output, copy, report)

## Review
- `npm test`: 23 pass. E2E in Playwright Chromium and WebKit iPhone 13 profile over `dist/`: blur/pixelate/solid x strip on/off on a JPEG with GPS+camera EXIF (kept output has EXIF, no thumbnail, orientation reset), PNG and WebP output (WebKit has no WebP encode, option hidden), 150 KB target size, Copy (PNG on clipboard, report "Removed"), report text in each state, fail-closed (corrupt IFD1 -> no camera/GPS EXIF, note says removed), note reset on JPEG -> PNG, transparent PNG as JPEG has white corner, 5000x3800 on touch exported at 3072x2335, size readout hidden after a change and shown after Download.
- Fixed after e2e: pixelate grid is now scale-invariant (`pixelCells`; parity mean diff 0.49/255 at 3200 px, blur 0.27); no-EXIF JPEG with strip off now says there is nothing to keep, and the report ignores structural rows (JFIF Version, Encoding, YCbCr Subsampling) so it reads "No metadata found". Safari's JPEG encoder still writes its own tiny EXIF stub (no camera/GPS). `npm test`: 25 pass. Final-review fixes: Blur snapshots its source (buffer, mime, rows, size) and queueFiles ignores input while the dialog is open; readout skips mid-stroke and never overlaps Download/Copy; sanitizeExifSegment fails closed when IFD1 has no JPEG thumbnail pointer.
- NOT tested on a real device: iOS share sheet save, Safari clipboard (Copy), Safari WebP, touch memory limits with the 3072 cap.

# Workbench phase 2 (geometry: rotate, flip, crop, resize)

## Review
- `npm test`: 35 pass; `npm run build` clean. Scripts in the session scratchpad (`p2.mjs`, reused `t7e2e/e2e.mjs`), run against `dist/` in Playwright Chromium and the WebKit iPhone 13 profile. 33/33 geometry checks pass in each browser; the phase 1 suite passes in both (22 Chromium, 24 WebKit).

| Check | Chromium | WebKit iPhone |
|---|---|---|
| Rotate left/right, flip x/y: output size and blue/red marker positions correct; undo restores preview exactly; 4x rotate right = identity | pass | pass |
| Crop 800x400 to 400x200, marker at expected spot | pass | pass |
| Resize after crop (200 wide gives 200x100, marker scaled); chips: aria-labels, aria-pressed follows input, Original clears input; non-finite value = no resize | pass | pass |
| Combined: rotate right, Solid stroke over red marker, crop, Pixelate stroke over a checker, resize 100, JPEG: 100x200, black at the mapped marker spot, unstroked red intact, checker smoothed | pass | pass |
| Mixed undo (stroke, rotate, crop, clear, flip) one step at a time: each preview equals the previous snapshot; full undo exports the original with no stroke | pass | pass |
| Close dialog mid-crop, Esc during crop (cancels crop only), right after rotate/flip, right after Download: no errors, reopen is fresh | pass | pass |
| Copy after rotate + resize: clipboard PNG is 200x400 (desktop only); width readout shows derived height after rotate | pass | readout pass, Copy not testable |
| 5000x3800 + rotate: 3113x4096 desktop, 2335x3072 touch (cap respected); + resize 1000 gives 1000x1316 | pass | pass |
| Preview vs export mean difference after rotate+crop on 3200x2400: blur 0.34, pixelate 0.56 (desktop); blur 0.12, pixelate 0.41 (touch) (limit 1.5) | pass | pass |
| Phase 1 flows (strip on/off with GPS JPEG, PNG/WebP, target size, report text, parity) | pass | pass |

- Fixed in this task (Task 4 review): width chips have aria-labels, `aria-pressed` and an active style tracking the width; `setRw` ignores non-finite input; `renderFinal` sizes the resize from the dimensions it just rendered.
- NOT tested on a real device: touch crop (real finger drags, pinch/second finger; tests use synthesized pointer events), iOS share sheet save, Safari clipboard (Copy), touch memory limits with the 3072 cap and a replayed op chain. "Copy dimensions" was read as the Copy button / width readout; there is no separate copy-dimensions control.
