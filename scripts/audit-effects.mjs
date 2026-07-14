import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  envFile: false,
  logLevel: "silent",
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  server: {
    middlewareMode: true,
    hmr: false,
    watch: null,
  },
});

try {
  const core = await server.ssrLoadModule("/src/core/effects.ts");
  const renderer = await server.ssrLoadModule("/src/renderer/LayerEffects.tsx");
  const issues = [...core.auditEffectDefinitions()];
  const defined = new Set(core.EFFECT_DEFINITIONS.map((definition) => definition.type));
  const rendered = new Set(renderer.RENDERED_EFFECT_TYPES);

  for (const type of defined) {
    if (!rendered.has(type)) issues.push(`${type}: defined but not registered by the renderer`);
  }
  for (const type of rendered) {
    if (!defined.has(type)) issues.push(`${type}: renderer registration has no effect definition`);
  }

  const plainShapeOpacity = renderer.resolveGlassContentOpacity("shape", []);
  if (plainShapeOpacity !== 1) {
    issues.push(`plain shape: expected full content opacity, received ${plainShapeOpacity}`);
  }
  const glassShapeOpacity = renderer.resolveGlassContentOpacity("shape", [{ intensity: 60 }]);
  if (!(glassShapeOpacity < 1 && glassShapeOpacity >= 0.38)) {
    issues.push(`glass shape: expected reduced content opacity, received ${glassShapeOpacity}`);
  }
  const nonShapeOpacity = renderer.resolveGlassContentOpacity("text", [{ intensity: 60 }]);
  if (nonShapeOpacity !== 1) {
    issues.push(`non-shape layer: glass content opacity leaked into text, received ${nonShapeOpacity}`);
  }

  for (const definition of core.EFFECT_DEFINITIONS) {
    const controls = [definition.intensityLabel, definition.radiusLabel, definition.speedLabel, definition.colorLabel].filter(Boolean).join(", ");
    console.log(`${definition.type.padEnd(12)} ${definition.rendererStage.padEnd(14)} ${definition.animated ? "animated" : "static  "} · ${controls}`);
  }

  if (issues.length) {
    console.error("\nEffect audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`\nEffect audit passed: ${defined.size} definitions, ${rendered.size} renderer registrations, 0 contract errors.`);
  }
} finally {
  await server.close();
}
