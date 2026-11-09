# Split + build + standalone page + blur fixes

Plan: ~/.claude/plans/jiggly-imagining-comet.md (branch: feat/blur-download)

- [ ] 1. Scaffold: esbuild devDep, scripts/build.mjs, src/, public/, vendor/ (git mv static files)
- [ ] 2. Extract CSS + JS modules in dependency order; state -> `state` object; build after each batch
- [ ] 3. Standalone build (image-inspector.html) + footer download link
- [ ] 4. Behavior check vs main (JPEG/PNG/MP4/PSD, file:// standalone)
- [ ] 5. Blur fixes: iOS blur fallback, memory/preview res, share-sheet save, UX gaps
- [ ] 6. Mobile testing (WebKit iPhone profile, Chrome emulation)
- [ ] 7. Update AGENTS.md/agents.md, package.json, .gitignore
- [ ] 8. Cloudflare settings (user) then merge

## Review
(to fill in)
