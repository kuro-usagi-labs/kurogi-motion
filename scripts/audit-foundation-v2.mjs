import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const persistence = await readFile(new URL("../src/core/persistence.ts", import.meta.url), "utf8");
const editor = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const history = await readFile(new URL("../src/core/useProjectHistory.ts", import.meta.url), "utf8");
const issues = [];
for (const [needle, message] of [
  ["assetBlobs", "Asset Blob store is missing."],
  ["prepareProjectForStorage", "Blob URLs are not detached before project persistence."],
  ["prepareProjectForExport", "Blob-backed assets are not hydrated for portable output."],
  ["asset.storage = \"inline\"", "Portable output retains local Blob storage metadata."],
  ["garbageCollectAssetBlobs", "Orphan blob collection is missing."],
  ["persisted?.updatedAt === project.updatedAt", "Draft persistence does not reject already-saved revisions."],
  ["persisted?.updatedAt === value.project.updatedAt", "Stale recovery drafts are not removed when loading."],
  ["projectAssetSignature", "Existing IndexedDB projects are not migrated into Blob storage on load."],
]) if (!persistence.includes(needle)) issues.push(message);
if (!editor.includes("saveDraft(history.projectRef.current)")) issues.push("Editor changes are not written to the recovery draft.");
if (!editor.includes("storeAssetBlob(project.id")) issues.push("Imported assets still bypass Blob storage.");
if (!app.includes("prepareProjectForExport")) issues.push(".kuromotion export does not hydrate Blob-backed assets.");
if (!app.includes("migrateProjectAssets")) issues.push("Imported .kuromotion files are not detached into Blob storage.");
if (!history.includes("createProjectPatch")) issues.push("History still uses full project snapshots.");
if (history.includes("useRef<KurogiProject[]>([])")) issues.push("History still stores full project snapshots in undo/redo stacks.");

const server = await createServer({ appType: "custom", configFile: false, logLevel: "error", optimizeDeps: { noDiscovery: true }, server: { hmr: false, middlewareMode: true, watch: null } });
try {
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const patchCore = await server.ssrLoadModule("/src/core/historyPatch.ts");
  const original = projectCore.createProject({ name: "Patch audit", format: "square" });
  const scene = projectCore.getActiveScene(original);
  const layer = projectCore.createTextLayer(scene);
  const changed = projectCore.addLayers(original, [layer]);
  const patch = patchCore.createProjectPatch(original, changed);
  if (patchCore.isProjectPatchEmpty(patch)) issues.push("Adding one layer produced an empty history patch.");
  if (Object.keys(patch.layers).length !== 1) issues.push("History patch did not isolate the changed layer.");
  const undone = patchCore.applyProjectPatch(changed, patch, "before");
  if (Object.keys(undone.layers).length !== 0) issues.push("Inverse history patch failed.");
  const redone = patchCore.applyProjectPatch(undone, patch, "after");
  if (!redone.layers[layer.id]) issues.push("Forward history patch failed.");
} finally { await server.close(); }

if (issues.length) {
  console.error("Foundation V2 audit failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log("Foundation V2 audit passed: Blob-backed assets, portable project files, patch history, IndexedDB migration, and stale-draft protection are wired.");
}
