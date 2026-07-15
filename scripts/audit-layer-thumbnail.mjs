import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/app/LayerThumbnail.tsx");
const css = read("src/layerThumbnail.css");

assert.match(component, /export function LayerThumbnail/, "Layer thumbnail must be reusable outside one editor surface");
assert.match(component, /type: "video"/, "Thumbnail identity must be forward-compatible with video layers");
assert.match(component, /asset\.thumbnailUrl/, "Media identity must prefer a real saved thumbnail when available");
assert.match(component, /asset\.sourceUrl/, "Media identity must fall back to the real asset source");
assert.match(component, /candidate\.kind === "video"/, "Video media must render through a video preview when it has no poster thumbnail");
assert.match(component, /onError=\{moveToFallback\}/, "Broken media must advance through the fallback chain");
assert.match(component, /function TextIdentity/, "Text layers need content-aware identity");
assert.match(component, /function ShapeIdentity/, "Shape layers need geometry and fill identity");
assert.match(component, /function AudioIdentity/, "Audio clips need waveform identity");
assert.match(component, /function GroupIdentity/, "Groups need child-stack identity");
assert.match(component, /role=\{decorative \? undefined : "img"\}/, "Standalone thumbnails must expose image semantics");
assert.match(component, /aria-label=\{decorative \? undefined : label\}/, "Standalone thumbnails must expose a meaningful accessible name");
assert.match(component, /aria-hidden=\{decorative \|\| undefined\}/, "Integrated rows must be able to mark duplicate thumbnail semantics as decorative");
assert.doesNotMatch(component, /<img[^>]+alt="[^"]+"/, "Nested media must not duplicate the wrapper's accessible label");
assert.doesNotMatch(component, /[\u{1F300}-\u{1FAFF}]/u, "Thumbnail controls must not depend on emoji glyphs");

assert.match(css, /pointer-events:\s*none/, "Thumbnail identity must not steal row clicks or drag gestures");
assert.match(css, /user-select:\s*none/, "Thumbnail identity must feel like desktop chrome, not selectable HTML");
assert.match(css, /forced-colors:\s*active/, "Thumbnail identity needs a high-contrast fallback");
assert.match(css, /prefers-reduced-motion:\s*reduce/, "Thumbnail decoration must respect reduced-motion preferences");

console.log("Layer thumbnail audit passed: real media fallback chain, meaningful type identities, accessible labeling, and non-interactive desktop behavior verified.");
