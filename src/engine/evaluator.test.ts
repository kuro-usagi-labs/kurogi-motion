import { describe, expect, it } from "vitest";
import { createBlankProject } from "../domain/project";
import { evaluateSceneAtTime } from "./evaluator";

describe("frame evaluator", () => {
  it("is deterministic for the same project and time", () => {
    const project = createBlankProject("Deterministic");
    const first = evaluateSceneAtTime(project, project.activeSceneId, 1234);
    const second = evaluateSceneAtTime(project, project.activeSceneId, 1234);
    expect(second).toEqual(first);
  });

  it("does not mutate the project document", () => {
    const project = createBlankProject("Immutable");
    const snapshot = structuredClone(project);
    evaluateSceneAtTime(project, project.activeSceneId, 500);
    expect(project).toEqual(snapshot);
  });

  it("evaluates a move-in action from offset to base position", () => {
    const project = createBlankProject("Move in");
    const scene = project.scenes[project.activeSceneId];
    const headlineId = scene.rootLayerIds[0];
    const headline = project.layers[headlineId];
    const start = evaluateSceneAtTime(project, scene.id, 0).layers.find(
      (layer) => layer.id === headlineId,
    );
    const end = evaluateSceneAtTime(project, scene.id, 650).layers.find(
      (layer) => layer.id === headlineId,
    );

    expect(start?.transform.y).toBe(headline.transform.position.y - 90);
    expect(end?.transform.y).toBeCloseTo(headline.transform.position.y, 6);
  });

  it("clamps requested time to the scene duration", () => {
    const project = createBlankProject("Clamp");
    const scene = project.scenes[project.activeSceneId];
    const evaluated = evaluateSceneAtTime(project, scene.id, scene.durationMs + 5000);
    expect(evaluated.timeMs).toBe(scene.durationMs);
  });
});
