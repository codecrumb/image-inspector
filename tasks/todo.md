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
- Known issues: pixelate grid in preview vs export differs slightly on images > 1600 px (mean diff 6/255 at 3200 px; blur is 0.27); for a JPEG with no EXIF and strip off the note still says camera info and GPS are kept; the report counts non-EXIF rows (e.g. JFIF) as "other fields"; Safari's JPEG encoder always writes its own tiny EXIF stub (no camera/GPS).
- NOT tested on a real device: iOS share sheet save, Safari clipboard (Copy), Safari WebP, touch memory limits with the 3072 cap.
