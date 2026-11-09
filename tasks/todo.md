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
