import assert from "node:assert/strict";
import { createServer } from "vite";
import renderAssetStage from "../electron/renderAssetStage.cjs";

const { stageProjectAssetsForRender } = renderAssetStage;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#7457d9"/><!--${"x".repeat(1024 * 1024)}--></svg>`;
const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const audioBytes = Buffer.alloc(1024 * 1024, 7);
const audioDataUrl = `data:audio/wav;base64,${audioBytes.toString("base64")}`;
const project = {
  id: "render-resilience",
  assets: Object.fromEntries([
    ...Array.from({ length: 24 }, (_, index) => [`image-${index}`, { id: `image-${index}`, type: "svg", mimeType: "image/svg+xml", sourceUrl: imageDataUrl, byteSize: Buffer.byteLength(svg) }]),
    ["audio", { id: "audio", type: "audio", mimeType: "audio/wav", sourceUrl: audioDataUrl, byteSize: audioBytes.length }],
  ]),
};
const originalInputBytes = Buffer.byteLength(JSON.stringify({ project }));
assert.ok(originalInputBytes > 30 * 1024 * 1024, `Synthetic heavy input is too small: ${originalInputBytes}`);

const staged = await stageProjectAssetsForRender(project);
let vite;
try {
  const stagedInputBytes = Buffer.byteLength(JSON.stringify({ project: staged.project }));
  assert.ok(stagedInputBytes < 32 * 1024, `Staged input props are still too large: ${stagedInputBytes}`);
  assert.equal(staged.stats.inlineAssetCount, 25);
  assert.equal(staged.stats.uniqueAssetCount, 2);
  assert.equal(staged.stats.duplicateAssetCount, 23);
  assert.notEqual(staged.project, project, "Asset staging must not mutate the editor project.");
  assert.equal(project.assets["image-0"].sourceUrl, imageDataUrl, "The original image source was mutated.");
  assert.equal(project.assets.audio.sourceUrl, audioDataUrl, "The original audio source was mutated.");
  assert.ok(Object.values(staged.project.assets).every((asset) => asset.sourceUrl.startsWith("http://127.0.0.1:")));
  assert.equal(new Set(Array.from({ length: 24 }, (_, index) => staged.project.assets[`image-${index}`].sourceUrl)).size, 1, "Duplicate image assets were not deduplicated.");

  const imageResponse = await fetch(staged.project.assets["image-0"].sourceUrl);
  assert.equal(imageResponse.status, 200);
  assert.equal((await imageResponse.arrayBuffer()).byteLength, Buffer.byteLength(svg));
  const rangeResponse = await fetch(staged.project.assets.audio.sourceUrl, { headers: { Range: "bytes=8-39" } });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get("content-range"), `bytes 8-39/${audioBytes.length}`);
  assert.equal((await rangeResponse.arrayBuffer()).byteLength, 32);

  vite = await createServer({ appType: "custom", configFile: false, logLevel: "error", optimizeDeps: { noDiscovery: true }, server: { hmr: false, middlewareMode: true, watch: null } });
  const timing = await vite.ssrLoadModule("/src/core/layerTiming.ts");
  const scene = { id: "scene", duration: 100 };
  const legacyLayer = {
    startTime: 0,
    duration: 100,
    animationActions: [
      { category: "in", startTime: 0, delay: 0, duration: .65 },
      { category: "in", startTime: 12, delay: 0, duration: .25 },
      { category: "out", startTime: 20, delay: 0, duration: .25 },
    ],
  };
  assert.deepEqual(timing.getLayerRenderTiming(legacyLayer, scene), { startTime: 12, duration: 8.25, animationOffset: 0, inferredFromActions: true });
  const explicitLayer = { ...legacyLayer, startTime: 5, duration: 10 };
  assert.deepEqual(timing.getLayerRenderTiming(explicitLayer, scene), { startTime: 5, duration: 10, animationOffset: 5, inferredFromActions: false });

  console.log(`Render resilience audit passed: ${(originalInputBytes / 1024 / 1024).toFixed(1)} MB input reduced to ${(stagedInputBytes / 1024).toFixed(1)} KB, ${staged.stats.inlineAssetCount} assets deduplicated to ${staged.stats.uniqueAssetCount}.`);
} finally {
  if (vite) await vite.close().catch(() => undefined);
  await staged.dispose();
}
