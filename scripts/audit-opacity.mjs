import assert from "node:assert/strict";
import { createServer } from "vite";

const vite = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true, watch: null },
});

try {
  const projectCore = await vite.ssrLoadModule("/src/core/project.ts");
  const evaluator = await vite.ssrLoadModule("/src/core/evaluator.ts");

  const project = projectCore.createProject({ name: "Opacity audit", format: "square", duration: 5, fps: 30 });
  const scene = projectCore.getActiveScene(project);

  const evaluate = (type, category = "in", time = 0.3) => {
    const layer = projectCore.createShapeLayer(scene, "rectangle");
    layer.opacity = 1;
    layer.animationActions.push(projectCore.createAnimationAction(layer.id, category, type, {
      startTime: 0,
      duration: 0.6,
      easing: "linear",
    }));
    return evaluator.evaluateLayer(layer, scene, time).opacity;
  };

  const staticLayer = projectCore.createShapeLayer(scene, "rectangle");
  staticLayer.opacity = 1;
  assert.equal(evaluator.evaluateLayer(staticLayer, scene, 0).opacity, 1, "100% static opacity must render as exactly 1.");

  staticLayer.opacity = 0.9995;
  assert.equal(evaluator.evaluateLayer(staticLayer, scene, 0).opacity, 1, "Near-100% floating point values must snap to exactly 1.");

  for (const type of ["moveIn", "scaleIn", "rotateIn", "blurIn", "maskReveal", "popIn", "slideIn"]) {
    assert.equal(evaluate(type), 1, `${type} must not silently reduce opacity.`);
  }

  assert.equal(evaluate("fadeIn"), 0.5, "fadeIn must continue to animate opacity explicitly.");
  assert.equal(evaluate("fadeOut", "out"), 0.5, "fadeOut must continue to animate opacity explicitly.");

  const dissolve = evaluate("dissolveOut", "out");
  assert.ok(dissolve > 0.39 && dissolve < 0.43, `dissolveOut should apply one fade pass, received ${dissolve}.`);
} finally {
  await vite.close();
}

console.log("True opacity regression audit passed.");
