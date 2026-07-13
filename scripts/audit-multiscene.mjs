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
  const workspace = await server.ssrLoadModule("/src/core/sceneWorkspace.ts");
  const patchCore = await server.ssrLoadModule("/src/core/historyPatch.ts");

  let project = projectCore.createProject({
    name: "Multi-scene audit",
    format: "square",
    duration: 5,
    fps: 30,
  });
  const firstScene = projectCore.getActiveScene(project);
  const text = projectCore.createTextLayer(firstScene, { text: "Reusable layer" });
  text.animationActions.push(projectCore.createAnimationAction(text.id, "in", "moveIn"));
  project = projectCore.addLayers(project, [text]);

  const migrated = workspace.ensureSceneWorkspace(project);
  assert.notEqual(migrated, project, "Legacy single-scene projects should receive workspace coordinates.");
  assert.deepEqual(workspace.getSceneWorkspacePosition(migrated.scenes[firstScene.id]), { x: 0, y: 0 });
  assert.equal(workspace.ensureSceneWorkspace(migrated), migrated, "Workspace migration must be idempotent.");
  project = migrated;

  const created = workspace.createScene(project);
  assert.equal(Object.keys(created.project.scenes).length, 2);
  assert.equal(created.project.activeSceneId, created.sceneId);
  assert.equal(created.project.scenes[created.sceneId].layerIds.length, 0);
  assert.ok(workspace.getSceneWorkspacePosition(created.project.scenes[created.sceneId]).x > firstScene.width);

  const copied = workspace.copyLayersToScene(created.project, [text.id], created.sceneId);
  assert.equal(copied.project.activeSceneId, created.sceneId);
  assert.equal(copied.layerIds.length, 1);
  const copiedLayer = copied.project.layers[copied.layerIds[0]];
  assert.equal(copiedLayer.sceneId, created.sceneId);
  assert.notEqual(copiedLayer.id, text.id);
  assert.notEqual(copiedLayer.animationActions[0].id, text.animationActions[0].id);
  assert.equal(copiedLayer.animationActions[0].layerId, copiedLayer.id);
  assert.equal(copied.project.layers[text.id].sceneId, firstScene.id, "Copying must not mutate the source layer.");

  const duplicated = workspace.duplicateScene(copied.project, firstScene.id);
  assert.equal(Object.keys(duplicated.project.scenes).length, 3);
  assert.equal(duplicated.project.activeSceneId, duplicated.sceneId);
  assert.equal(duplicated.layerIds.length, 1);
  const duplicatedLayer = duplicated.project.layers[duplicated.layerIds[0]];
  assert.notEqual(duplicatedLayer.id, text.id);
  assert.equal(duplicatedLayer.sceneId, duplicated.sceneId);
  assert.notEqual(duplicatedLayer.animationActions[0].id, text.animationActions[0].id);

  let updated = workspace.renameScene(duplicated.project, duplicated.sceneId, "Social variation");
  updated = workspace.updateScene(updated, duplicated.sceneId, {
    width: 1080,
    height: 1920,
    duration: 8,
    fps: 60,
    background: { type: "transparent" },
  });
  updated = workspace.moveScene(updated, duplicated.sceneId, { x: 2500, y: 420 });
  const updatedScene = updated.scenes[duplicated.sceneId];
  assert.equal(updatedScene.name, "Social variation");
  assert.equal(updatedScene.height, 1920);
  assert.equal(updatedScene.duration, 8);
  assert.equal(updatedScene.fps, 60);
  assert.equal(updatedScene.background.type, "transparent");
  assert.deepEqual(workspace.getSceneWorkspacePosition(updatedScene), { x: 2500, y: 420 });

  const removed = workspace.removeScene(updated, duplicated.sceneId);
  assert.equal(Object.keys(removed.project.scenes).length, 2);
  assert.equal(removed.project.scenes[duplicated.sceneId], undefined);
  assert.equal(removed.project.layers[duplicatedLayer.id], undefined);
  const firstRemaining = Object.keys(removed.project.scenes)[0];
  const secondRemoval = workspace.removeScene(removed.project, firstRemaining);
  assert.equal(Object.keys(secondRemoval.project.scenes).length, 1);
  const lastSceneId = Object.keys(secondRemoval.project.scenes)[0];
  const protectedLast = workspace.removeScene(secondRemoval.project, lastSceneId);
  assert.equal(protectedLast.project, secondRemoval.project, "The final scene must not be deletable.");

  const sceneChange = workspace.createScene(project).project;
  const patch = patchCore.createProjectPatch(project, sceneChange);
  const undone = patchCore.applyProjectPatch(sceneChange, patch, "before");
  assert.equal(Object.keys(undone.scenes).length, 1, "Undo must restore the previous scene set.");
  const redone = patchCore.applyProjectPatch(undone, patch, "after");
  assert.equal(Object.keys(redone.scenes).length, 2, "Redo must restore the added scene.");

  const editorSource = await readFile(new URL("../src/app/Editor.tsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const stageSource = await readFile(new URL("../src/editor/MultiSceneCanvasStage.tsx", import.meta.url), "utf8");
  const mainSource = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(editorSource, /MultiSceneCanvasStage/);
  assert.match(editorSource, /onCreateScene=/);
  assert.match(editorSource, /onCopyLayerToScene=/);
  assert.match(appSource, /ensureSceneWorkspace/);
  assert.match(stageSource, /scenes\.map/);
  assert.match(stageSource, /fitAllScenes/);
  assert.match(stageSource, /beginSceneMove/);
  assert.match(stageSource, /spacePressedRef/);
  assert.match(mainSource, /multiscene\.css/);

  console.log("Multi-scene audit passed: CRUD, active switching, infinite workspace, copy, history, migration, and editor wiring are valid.");
} finally {
  await server.close();
}
