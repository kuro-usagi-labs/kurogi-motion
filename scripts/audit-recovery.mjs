import assert from "node:assert/strict";
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
  const projectCore = await server.ssrLoadModule("/src/core/project.ts");
  const projectFiles = await server.ssrLoadModule("/src/core/projectFiles.ts");
  const safeExit = await server.ssrLoadModule("/src/core/saveBeforeExit.ts");

  const original = projectCore.createProject({
    name: "Recovery audit",
    format: "square",
    duration: 4,
    fps: 30,
  });
  const scene = projectCore.getActiveScene(original);
  const layer = projectCore.createTextLayer(scene, { text: "Safe project" });
  const project = projectCore.addLayers(original, [layer]);

  const serialized = projectFiles.serializeKuroMotion(project, "project");
  const roundTrip = projectFiles.parseKuroMotionText(serialized);
  assert.equal(roundTrip.kind, "project");
  assert.equal(roundTrip.project.id, project.id);
  assert.equal(roundTrip.project.layers[layer.id].text, "Safe project");

  for (const invalid of [
    "not json",
    JSON.stringify({ hello: "world" }),
    JSON.stringify({
      application: "Kurogi Motion",
      kind: "project",
      fileVersion: 1,
      exportedAt: new Date().toISOString(),
      project: {},
    }),
    JSON.stringify({
      ...project,
      activeSceneId: "scene-missing",
    }),
    JSON.stringify({
      ...project,
      scenes: {
        [scene.id]: {
          ...project.scenes[scene.id],
          layerIds: ["layer-missing"],
        },
      },
    }),
  ]) {
    assert.throws(() => projectFiles.parseKuroMotionText(invalid));
  }

  const futureEnvelope = JSON.parse(serialized);
  futureEnvelope.fileVersion = projectFiles.KUROMOTION_FILE_VERSION + 1;
  assert.throws(
    () => projectFiles.parseKuroMotionText(JSON.stringify(futureEnvelope)),
    /newer version/i,
  );

  const calls = [];
  await safeExit.persistProjectBeforeExit(
    project,
    async () => { calls.push("save"); },
    async () => { calls.push("clear"); },
  );
  assert.deepEqual(calls, ["save", "clear"]);

  let clearedAfterFailure = false;
  await assert.rejects(() => safeExit.persistProjectBeforeExit(
    project,
    async () => { throw new Error("storage full"); },
    async () => { clearedAfterFailure = true; },
  ));
  assert.equal(clearedAfterFailure, false, "A failed save must not clear the recovery draft.");

  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const persistIndex = appSource.indexOf("await persistProjectBeforeExit");
  const closeIndex = appSource.indexOf("setCurrentProject(null)", persistIndex);
  assert.ok(persistIndex >= 0 && closeIndex > persistIndex, "The editor must close only after persistence resolves.");

  console.log("Recovery audit passed: malformed imports are rejected and failed saves keep the editor open.");
} finally {
  await server.close();
}
