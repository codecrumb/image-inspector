# Image workbench: design

Status: draft for approval. Nothing here is built yet.

## Intent

Image Inspector shows what is inside an image. Its Blur & Download tool already lets people hide parts of
one. The owner wants to grow that into a small, privacy-first workbench: a handful of fast, client-side edits
that end in one Download. The tool stays an inspector first. It must not turn into a general photo editor
or a format converter.

Everything stays in the browser. No image data leaves the device (existing rule; Google Lens remains the only upload).

## Goals

1. Brush effects: blur, pixelate, and (my idea) solid redaction, usable on the whole image or on painted areas.
2. Optional metadata stripping on export (currently always on). A clear "Privacy" control.
3. Output controls: format (JPEG/PNG/WebP) and quality, with a live before/after file size. This is the light
   "converter and compressor" the owner mentioned.
4. Geometry edits: crop, resize (with aspect-ratio lock), rotate, flip.
5. Undo everywhere (Cmd/Ctrl+Z, and Clear is undoable). Already done for brush strokes.
6. Later, as separate small additions: color counter, image diff.

## Non-goals

- No filters, adjustments (brightness, curves), text, layers, or drawing tools.
- Format conversion is a side effect of export, not a headline feature or its own page.
- No accounts, no server processing, no saving of projects.

## Anti-goals (a failure even if it technically works)

- Privacy mode that looks like it strips data but leaves some behind. Stripping must be verified by re-parsing the output.
- A preview that differs from the saved file (crop or rotate lining up wrong with blur strokes).
- A phone running out of canvas memory. Existing export caps (3072/4096) stay.
- Slowing first load. The editor is built lazily, as the blur tool is today.

## Decisions by the owner

- Pixelate is another brush effect alongside blur; "whole image" or "painted area". Could be both on one brush.
- EXIF/GPS stripping becomes optional, in the blur tool or a sibling tool.
- Crop, resize, rotate and flip join the same area as the color picker (the lightbox).
- Format conversion and compression are acceptable as small extras.
- It is one main tool: several edits can be combined, then downloaded once as the end result.
- The owner floated extra tools (image diff, pixel counter, color counter, color replacer, aspect-ratio calculator) as optional.

## My calls (the owner has not agreed to these yet)

**Structure.** One editor, as the owner decided (this section is my design for it). Edits apply in a fixed order at export:
geometry (crop, rotate, flip, resize) first, then brush effects, then encode (format and quality), then optional metadata strip.
Brush strokes stay in normalized coordinates (as today), measured against the geometry-edited image, so the
preview and the full-size export line up. If geometry changes after strokes exist, the strokes are
transformed along with the image (owner's suggestion; simpler than I first thought): flip maps x to 1-x (or y to 1-y),
rotate 90 degrees swaps and flips coordinates, resize needs nothing, crop remaps points into the cropped area and drops
strokes outside it. Brush width is a fraction of the long side, so rotate and crop rescale it. Every geometry change
is one undo step that restores the previous strokes. Geometry can therefore be done in any order relative to painting.

**Where it lives.** A toolbar in the lightbox (Inspect, Blur/Pixelate, Crop, and so on). The sidebar "Blur & Download"
button stays as a shortcut that opens the editor in brush mode. I would not move it out until the toolbar exists.

**Metadata.** A "Remove metadata" switch, on by default so current behavior is unchanged. Re-encoding through a canvas
already drops EXIF/GPS. The switch off means preserving the original bytes' metadata, which is real work (re-inject
the original EXIF segment into the JPEG, copy PNG text chunks). Proposal: when it is off, support JPEG
only at first (EXIF re-injection); PNG/WebP always strip, with a note saying so. Orientation must be handled
so a preserved EXIF orientation does not double-rotate the pixels.

**Solid redaction.** Same brush, opaque fill. Cheap, and blur is reversible-ish at low strength, so it strengthens
the privacy story.

**Phasing.**
1. Brush effects (pixelate, solid) and the metadata switch. Output format and quality with size readout.
2. Geometry: crop, resize with ratio lock, rotate, flip.
3. Lightbox toolbar entry point.
4. Later and separate: color counter (unique colors, cheap, fits the inspector), image diff (two images from the
   existing queue, highlight changed pixels; medium effort).

**Ideas I'd fold in or skip.**
- Aspect-ratio calculator: fold into resize as the lock control, not a separate tool.
- Pixel counter: dimensions and megapixels are already shown in image information (owner confirmed); skip.
- Compressor: covered by the quality slider and size readout; add a "target size" option (find the quality that fits, e.g. under 500 KB).
- Copy result to clipboard (next to Download) and a post-export metadata report ("Removed: GPS, camera model, N other fields"): both wanted by the owner, in phase 1.
- Optional, not yet requested: max-dimension presets in resize.
- Color replacer: skip for now; it is the first step toward a photo editor.

## Constraints

- No framework. ES modules bundled by esbuild. State goes through `state` in `src/js/state.js`.
- Tailwind classes in JS template strings work.
- The offline single-file page (`image-inspector.html`) must keep working from `file://`.
- Preview works on a downscaled copy; export replays at full size within the phone caps.
- Safari has no canvas `ctx.filter`; blur falls back to a box blur. Pixelate is plain canvas scaling, so it needs no such fallback.

## Left to the builder

- Pixelate block size mapping to the strength slider.
- Crop interaction details (handles, touch behavior, aspect presets).
- Layout of the toolbar on small screens.
- How the quality slider and size readout re-encode without blocking (debounce, worker or not).

## How we'll know it works

- Exporting with "Remove metadata" on yields a file whose re-parsed EXIF/GPS is empty, checked by the app's own parsers.
- A cropped, rotated, blurred image looks identical in preview and in the saved file at the same scale.
- Undo and redo behave through Clear, mode switches, and geometry changes.
- Phone export of a large image does not crash.
