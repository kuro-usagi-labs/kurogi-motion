import { describe, expect, it } from "vitest";
import { createBlankProject } from "../domain/project";
import {
  buildProjectFileName,
  KUROGI_PROJECT_FORMAT,
  parseProjectFile,
  serializeProjectFile,
} from "./projectFile";

describe("Kurogi project files", () => {
  it("round-trips a validated project envelope", () => {
    const project = createBlankProject("Launch Story");
    const restored = parseProjectFile(serializeProjectFile(project));

    expect(restored).toEqual(project);
    expect(restored).not.toBe(project);
  });

  it("imports legacy raw project JSON", () => {
    const project = createBlankProject("Legacy Motion");

    expect(parseProjectFile(JSON.stringify(project))).toEqual(project);
  });

  it("rejects unsupported envelope versions", () => {
    const project = createBlankProject("Future Motion");
    const payload = JSON.stringify({
      format: KUROGI_PROJECT_FORMAT,
      formatVersion: 999,
      exportedAt: new Date().toISOString(),
      project,
    });

    expect(() => parseProjectFile(payload)).toThrow(/unsupported kurogi project file version/i);
  });

  it("rejects broken scene and layer references", () => {
    const project = createBlankProject("Broken Motion");
    const scene = project.scenes[project.activeSceneId];
    scene.rootLayerIds.push("missing-layer");

    expect(() => serializeProjectFile(project)).toThrow(/references missing layer/i);
  });

  it("rejects actions that are not attached to their layer", () => {
    const project = createBlankProject("Detached Action");
    const action = Object.values(project.animationActions)[0];
    const layer = project.layers[action.layerId];
    layer.animationActionIds = layer.animationActionIds.filter((id) => id !== action.id);

    expect(() => serializeProjectFile(project)).toThrow(/missing from its layer action list/i);
  });

  it("creates filesystem-safe backup names", () => {
    expect(buildProjectFileName("  Launch / Story: 01  ")).toBe(
      "launch-story-01.kurogi.json",
    );
    expect(buildProjectFileName("***")).toBe("untitled-motion.kurogi.json");
  });
});
