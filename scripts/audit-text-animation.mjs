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
  const core = await server.ssrLoadModule("/src/core/project.ts");
  const evaluator = await server.ssrLoadModule("/src/core/evaluator.ts");
  const textMotion = await server.ssrLoadModule("/src/core/textAnimation.ts");
  const mcp = await server.ssrLoadModule("/src/core/mcpCommands.ts");

  const unicode = textMotion.buildTextAnimationLayout("A👨‍👩‍👧‍👦e\u0301🇮🇩");
  assert.equal(unicode.counts.character, 4, "Character motion must use grapheme clusters, not code points.");
  assert.deepEqual(unicode.lines[0].tokens.flatMap((token) => token.graphemes.map((part) => part.text)), ["A", "👨‍👩‍👧‍👦", "é", "🇮🇩"]);

  const separated = textMotion.buildTextAnimationLayout("one   two\nthree");
  assert.equal(separated.counts.word, 3, "Whitespace must not become an invisible animated word.");
  assert.equal(separated.counts.line, 2, "Only explicit text lines should be ranked as lines.");
  assert.equal(textMotion.buildTextAnimationLayout("A \n B").counts.character, 2, "Whitespace and line breaks must not consume letter delay.");

  assert.deepEqual([0, 1, 2, 3].map((index) => textMotion.textAnimationStaggerRank(index, 4, "center", 1)), [1, 0, 0, 1], "Even center-out motion must start at rank zero.");
  const randomA = Array.from({ length: 8 }, (_, index) => textMotion.textAnimationStaggerRank(index, 8, "random", 77));
  const randomB = Array.from({ length: 8 }, (_, index) => textMotion.textAnimationStaggerRank(index, 8, "random", 77));
  assert.deepEqual(randomA, randomB, "Random text order must be deterministic for the saved seed.");

  let project = core.createProject({ name: "Text motion", format: "square", duration: 4 });
  const scene = core.getActiveScene(project);
  const layer = core.createTextLayer(scene, { text: "MOVE FAST" });
  const wordMove = core.createAnimationAction(layer.id, "in", "moveIn", { duration: 1, stagger: { enabled: true, unit: "word", delay: .1, order: "normal", seed: 1 } });
  const letterScale = core.createAnimationAction(layer.id, "in", "scaleIn", { duration: 1, stagger: { enabled: true, unit: "character", delay: .04, order: "normal", seed: 1 } });
  layer.animationActions.push(wordMove, letterScale);
  project = core.addLayers(project, [layer]);

  const wordVisual = evaluator.evaluateTextScope(project.layers[layer.id], scene, .35, "word", 1, 2);
  const letterVisual = evaluator.evaluateTextScope(project.layers[layer.id], scene, .35, "character", 1, 8);
  assert.notEqual(wordVisual.translateY, 0, "Word action must evaluate at word scope.");
  assert.equal(wordVisual.scaleX, 1, "Character scale action must not leak into word scope.");
  assert.equal(letterVisual.translateY, 0, "Word move action must not leak into character scope.");
  assert.ok(letterVisual.scaleX < 1, "Character action must evaluate independently.");

  const fourLetters = core.createAnimationAction(layer.id, "in", "fadeIn", { duration: .5, stagger: { enabled: true, unit: "character", delay: .1, order: "normal", seed: 1 } });
  assert.equal(textMotion.textAnimationVisualDuration(fourLetters, "ABCD"), .8, "Effective duration must include the full letter tail.");

  const malformed = structuredClone(project);
  malformed.layers[layer.id].animationActions[0].stagger = { enabled: true, unit: "bad", delay: Number.NaN, order: "bad" };
  const normalized = core.normalizeProject(malformed);
  const normalizedStagger = normalized.layers[layer.id].animationActions[0].stagger;
  assert.equal(normalizedStagger.unit, "character");
  assert.ok(Number.isFinite(normalizedStagger.delay));
  assert.equal(normalizedStagger.order, "normal");

  const mcpProject = core.createProject({ name: "MCP text motion", format: "square", duration: 3 });
  const mcpScene = core.getActiveScene(mcpProject);
  const mcpText = core.createTextLayer(mcpScene, { text: "AGENT MADE" });
  let mcpState = core.addLayers(mcpProject, [mcpText]);
  const added = mcp.executeMcpProjectCommand(mcpState, "project.add_animation", {
    layerId: mcpText.id,
    category: "in",
    type: "moveIn",
    textUnit: "character",
    staggerDelay: .035,
    staggerOrder: "center",
  });
  mcpState = added.project;
  const actionId = added.result.action.id;
  assert.equal(mcpState.layers[mcpText.id].animationActions[0].stagger.unit, "character", "MCP must author per-letter motion.");
  const updated = mcp.executeMcpProjectCommand(mcpState, "project.update_animation", { actionId, textUnit: "word", staggerDelay: .08 });
  assert.equal(updated.project.layers[mcpText.id].animationActions[0].stagger.unit, "word", "MCP must update text scope.");
  const cleared = mcp.executeMcpProjectCommand(updated.project, "project.update_animation", { actionId, textUnit: "layer" });
  assert.equal(cleared.project.layers[mcpText.id].animationActions[0].stagger, undefined, "Whole text must clear unit staggering.");

  const [renderer, composition, inspector, dialog, timeline, serverSource] = await Promise.all([
    "../src/renderer/AnimatedTextContent.tsx",
    "../src/MotionComposition.tsx",
    "../src/editor/InspectorV2.tsx",
    "../src/editor/AnimationPresetDialog.tsx",
    "../src/editor/TimelineV3.tsx",
    "../mcp/server.mjs",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(renderer, /evaluateTextScope/);
  assert.match(renderer, /clipPath: visual\.clipPath/, "Per-unit wipe/mask must reach the rendered span.");
  assert.match(composition, /AnimatedTextContent/, "Top-level text must use the shared renderer.");
  assert.match(inspector, /Animate text/);
  assert.match(inspector, /Motion \{action\.duration\.toFixed\(2\)\}s · total/);
  assert.match(dialog, /Apply to/);
  assert.match(dialog, /initialTextUnit/);
  assert.match(timeline, /textAnimationStaggerSpread/);
  assert.match(timeline, /timeline-action-stagger-tail/);
  assert.match(serverSource, /textUnit: z\.enum\(\["layer", "line", "word", "character"\]\)/);

  console.log("Text animation audit passed: Unicode graphemes, separator-free ranks, mixed per-action scopes, complete timing tails, safe migration, shared rendering, editor workflow, timeline affordance, and MCP authoring are valid.");
} finally {
  await server.close();
}
