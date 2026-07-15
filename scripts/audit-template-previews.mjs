import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { createServer } from "vite";
import renderAssetStage from "../electron/renderAssetStage.cjs";

const { stageProjectAssetsForRender } = renderAssetStage;
const featuredTemplateIds = ["product", "gallery-swipe", "podcast-cover", "comment", "kinetic-type"];
const outputDirectory = path.resolve("artifacts", "template-preview-audit");
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "kurogi-template-preview-"));
const bundleDirectory = path.join(temporaryDirectory, "bundle");
let vite;

try {
  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  vite = await createServer({
    appType: "custom",
    configFile: false,
    envFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  const catalog = await vite.ssrLoadModule("/src/core/templateCatalog.ts");
  const definitions = catalog.MOTION_TEMPLATES.filter((template) => featuredTemplateIds.includes(template.id));
  assert.equal(definitions.length, featuredTemplateIds.length, "Every featured preview target must exist in the catalog.");
  const projects = definitions.map((template) => ({
    template,
    project: catalog.createCatalogTemplateProject({
      name: template.name,
      format: template.format,
      duration: template.duration,
      fps: 30,
      background: template.palette[0],
    }, template.id),
  }));
  await vite.close();
  vite = null;

  const serveUrl = await bundle({
    entryPoint: path.resolve("src/remotion-entry.tsx"),
    outDir: bundleDirectory,
    webpackOverride: (config) => config,
  });

  for (const { template, project } of projects) {
    const staged = await stageProjectAssetsForRender(project);
    try {
      const inputProps = { project: staged.project, renderMode: "active-scene", exportFps: 30 };
      const composition = await selectComposition({ serveUrl, id: "KurogiMotion", inputProps });
      const frame = Math.min(composition.durationInFrames - 1, Math.round(composition.fps * 1.9));
      const output = path.join(outputDirectory, `${template.id}.png`);
      await renderStill({
        composition,
        serveUrl,
        inputProps,
        output,
        frame,
        imageFormat: "png",
        scale: .5,
        logLevel: "error",
      });
      const stats = await fs.stat(output);
      assert.ok(stats.size > 10_000, `${template.name} preview is unexpectedly small: ${stats.size} bytes.`);
      console.log(`PASS ${template.id.padEnd(18)} ${composition.width}×${composition.height} · ${stats.size} bytes`);
    } finally {
      await staged.dispose();
    }
  }

  console.log(`\nRendered ${featuredTemplateIds.length} template previews to ${outputDirectory}`);
} finally {
  if (vite) await vite.close().catch(() => undefined);
  const resolved = path.resolve(temporaryDirectory);
  const temporaryRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${temporaryRoot}${path.sep}`) || !path.basename(resolved).startsWith("kurogi-template-preview-")) {
    throw new Error(`Refusing to remove unexpected template preview directory: ${resolved}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
