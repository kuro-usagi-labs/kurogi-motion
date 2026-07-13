import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const shapes = await server.ssrLoadModule("/src/core/shapeLibrary.ts");
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const templates = await server.ssrLoadModule("/src/core/templateCatalog.ts");
  const rendererSource = await readFile(new URL("../src/MotionComposition.tsx", import.meta.url), "utf8");
  const editorSource = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const templateSource = await readFile(new URL("../src/core/templateCatalog.ts", import.meta.url), "utf8");
  const issues = [];

  const seen = new Set();
  for (const definition of shapes.SHAPE_DEFINITIONS) {
    if (seen.has(definition.type)) issues.push(`Duplicate shape definition: ${definition.type}`);
    seen.add(definition.type);
    if (!definition.path.startsWith("M")) issues.push(`${definition.type} path must start with M`);
    if (!(definition.aspectRatio > 0)) issues.push(`${definition.type} aspect ratio must be positive`);
    if (!(definition.defaultWidth > 0 && definition.defaultHeight > 0)) issues.push(`${definition.type} default size is invalid`);
    const mask = shapes.getShapeMaskDataUri(definition.type);
    if (!mask.startsWith("data:image/svg+xml,")) issues.push(`${definition.type} mask URI is invalid`);
  }

  const project = projectCore.createProject({ name: "Shape audit", format: "square", duration: 5, fps: 30, background: "#ffffff" });
  const scene = projectCore.getActiveScene(project);
  for (const definition of shapes.SHAPE_DEFINITIONS) {
    const layer = projectCore.createShapeLayer(scene, definition.type);
    if (layer.shape !== definition.type) issues.push(`${definition.type} did not survive layer creation`);
    if (layer.size.width <= 0 || layer.size.height <= 0) issues.push(`${definition.type} created invalid bounds`);
    if (layer.scale.x !== 1 || layer.scale.y !== 1) issues.push(`${definition.type} must use identity base scale`);
  }

  if (!rendererSource.includes("getShapeMaskStyle")) issues.push("Renderer does not use vector shape masks");
  if (!rendererSource.includes('preserveAspectRatio="none"')) issues.push("Renderer is missing precise responsive SVG stroke geometry");
  if (!editorSource.includes("SHAPE_DEFINITIONS")) issues.push("Editor shape library is not catalog-driven");
  if (!editorSource.includes("shape-library-section")) issues.push("Editor shape groups are missing");

  const forbiddenGlyphs = [/♥/u, /❤/u, /✨/u, /⭐/u, /★/u];
  for (const glyph of forbiddenGlyphs) {
    if (glyph.test(templateSource)) issues.push(`Template catalog still contains decorative text glyph ${glyph}`);
  }

  const reports = templates.auditAllCatalogTemplates();
  const blocking = reports.flatMap((report) => report.errors.map((error) => `${report.templateId}: ${error.code} ${error.layerName}`));
  issues.push(...blocking);

  if (issues.length) {
    console.error("Shape library audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`Shape library audit passed: ${shapes.SHAPE_DEFINITIONS.length} editable vector shapes, precise renderer masks, grouped editor controls, emoji-free template accents, and ${reports.length} template layouts are valid.`);
  }
} finally {
  await server.close();
}
