import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const STANDARD_TIMEOUT_MS = 120_000;
const PREVIEW_TIMEOUT_MS = 5 * 60_000;
const EXPORT_TIMEOUT_MS = 30 * 60_000;
const TEMPLATE_IDS = [
  "chatbox", "comment", "notification", "product", "quote", "logo", "announcement", "lower-third", "app-promo", "countdown",
  "testimonial", "stat-card", "gradient-orbit", "card-stack", "kinetic-type", "liquid-title", "gallery-swipe", "sale-poster", "button-micro", "chart-reveal",
];

const textId = z.string().trim().min(1).max(240);
const fpsSchema = z.union([z.literal(24), z.literal(30), z.literal(60)]);
const sceneFields = {
  sceneId: textId.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  width: z.number().min(64).max(7680).optional(),
  height: z.number().min(64).max(7680).optional(),
  duration: z.number().min(.1).max(3600).optional(),
  fps: fpsSchema.optional(),
  background: z.string().describe("Hex color such as #ffffff.").optional(),
  transparent: z.boolean().optional(),
};

const layerFields = {
  layerId: textId.optional(),
  type: z.enum(["text", "shape", "asset"]).optional(),
  assetId: textId.optional(),
  sceneId: textId.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  text: z.string().max(20_000).optional(),
  shape: z.string().trim().min(1).max(80).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  color: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().min(0).optional(),
  borderRadius: z.number().min(0).optional(),
  fontSize: z.number().min(1).optional(),
  fontFamily: z.string().trim().min(1).max(160).optional(),
  fontWeight: z.number().min(100).max(900).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  lineHeight: z.number().min(.1).max(10).optional(),
  letterSpacing: z.number().min(-500).max(500).optional(),
  textStroke: z.string().optional(),
  textStrokeWidth: z.number().min(0).max(200).optional(),
  autoFit: z.boolean().optional(),
  startTime: z.number().min(0).optional(),
  duration: z.number().min(.01).optional(),
};

const animationFields = {
  actionId: textId.optional(),
  layerId: textId.optional(),
  category: z.enum(["in", "loop", "out"]).optional(),
  type: z.string().trim().min(1).max(80).describe("Kurogi action type such as fadeIn, moveIn, scaleIn, counter, motionPath, pulse, or fadeOut.").optional(),
  startTime: z.number().min(0).optional(),
  duration: z.number().min(.05).optional(),
  delay: z.number().min(0).optional(),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "backIn", "backOut", "overshoot", "bounce", "elastic", "custom"]).optional(),
  easingCurve: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  parameters: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
  repeatCount: z.union([z.number().min(1), z.literal("infinite")]).optional(),
  repeatDelay: z.number().min(0).optional(),
  motionPath: z.record(z.string(), z.unknown()).optional(),
};

const audioFields = {
  clipId: textId.optional(),
  assetId: textId.optional(),
  sceneId: textId.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  startTime: z.number().min(0).optional(),
  trimStart: z.number().min(0).optional(),
  duration: z.number().min(.05).optional(),
  volume: z.number().min(0).max(2).optional(),
  muted: z.boolean().optional(),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  playbackRate: z.number().min(.25).max(4).optional(),
};

const exportFields = {
  format: z.enum(["mp4", "webm", "mov", "gif", "png-sequence"]).default("mp4"),
  fps: fpsSchema.default(30),
  scale: z.number().min(.1).max(2).default(1),
  quality: z.enum(["low", "medium", "high"]).default("high"),
  transparent: z.boolean().default(false),
  allScenes: z.boolean().default(true).describe("Render all scenes in project order and apply scene transitions."),
};

const projectCreationSchema = z.object({
  name: z.string().trim().min(1).max(160).default("AI video"),
  format: z.enum(["square", "vertical", "landscape", "portrait", "custom"]).default("square"),
  width: z.number().min(64).max(7680).optional(),
  height: z.number().min(64).max(7680).optional(),
  duration: z.number().min(.1).max(3600).default(5),
  fps: fpsSchema.default(30),
  background: z.string().default("#ffffff"),
  transparent: z.boolean().default(false),
  templateId: z.enum(TEMPLATE_IDS).optional(),
}).strict();

const editOperationSchema = z.object({
  method: z.string().trim().min(1),
  params: z.record(z.string(), z.unknown()).default({}),
}).strict();

const workflowStepSchema = z.object({
  method: z.string().trim().min(1).describe("A supported project or asset authoring method."),
  params: z.record(z.string(), z.unknown()).default({}).describe("Step parameters. Use {\"$ref\":\"alias.path\"} to reference an earlier assigned result."),
  assign: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/).optional().describe("Optional alias for this result, used by later $ref objects."),
}).strict();

const gradientSchema = z.object({
  type: z.enum(["linear", "radial"]),
  startColor: z.string(),
  endColor: z.string(),
  angle: z.number().default(0),
}).strict();

const effectFields = {
  layerId: textId,
  effectId: textId.optional(),
  type: z.enum(["blur", "dropShadow", "glow", "glass", "waterDrop", "ripple", "chromatic", "grain", "hueShift", "vignette"]).optional(),
  enabled: z.boolean().optional(),
  intensity: z.number().optional(),
  radius: z.number().min(0).optional(),
  speed: z.number().min(0).optional(),
  color: z.string().optional(),
  seed: z.number().min(0).optional(),
};

const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const ADDITIVE = Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
const STATE_CHANGE = Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const MUTATING = Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });
const DELETING = Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
const LOCAL_FILE_READ = Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
const DIRECT_EXPORT = Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
const AUTONOMOUS_VIDEO = Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });

const TOOL_DEFINITIONS = [
  bridgeTool("kurogi_status", "Kurogi Status", "Check whether the Kurogi Motion desktop app and local MCP bridge are running.", z.object({}).strict(), "bridge.status", READ_ONLY),
  bridgeTool("kurogi_list_projects", "List Kurogi Projects", "List projects saved locally in Kurogi Motion.", z.object({}).strict(), "library.list_projects", READ_ONLY),
  bridgeTool("kurogi_get_project_context", "Get Kurogi Project Context", "Read the active project, scenes, visual layers, animation actions, audio clips, assets, and optionally a sanitized project document.", z.object({ includeDocument: z.boolean().default(false) }).strict(), "project.get_context", READ_ONLY),
  bridgeTool("kurogi_validate_project", "Validate Kurogi Project", "Audit the active project for blank scenes, invisible or off-canvas layers, timing overruns, text overflow, missing assets, and unverified fonts before rendering.", z.object({}).strict(), "project.validate", READ_ONLY),
  {
    ...bridgeTool("kurogi_render_preview_frame", "Render Kurogi Preview Frame", "Render one PNG preview frame from the active project and return it as MCP image content for visual inspection before a full render.", z.object({ time: z.number().min(0).default(0), scale: z.number().min(.1).max(2).default(.5) }).strict(), "project.preview_frame", READ_ONLY),
    formatResult: previewFrameResult,
  },
  bridgeTool("kurogi_create_project", "Create Kurogi Project", "Create, save, and open a new project immediately without a Kurogi confirmation dialog.", projectCreationSchema, "library.create_project", ADDITIVE),
  bridgeTool("kurogi_open_project", "Open Kurogi Project", "Open an existing saved project by ID without a Kurogi confirmation dialog.", z.object({ projectId: textId }).strict(), "library.open_project", STATE_CHANGE),
  bridgeTool("kurogi_rename_project", "Rename Kurogi Project", "Rename the active project immediately.", z.object({ name: z.string().trim().min(1).max(160) }).strict(), "project.rename", MUTATING),

  bridgeTool("kurogi_create_scene", "Create Kurogi Scene", "Create a scene immediately.", z.object(sceneFields).strict(), "project.create_scene", ADDITIVE),
  bridgeTool("kurogi_update_scene", "Update Kurogi Scene", "Update scene dimensions, duration, fps, name, or background immediately.", z.object(sceneFields).strict(), "project.update_scene", MUTATING),
  bridgeTool("kurogi_duplicate_scene", "Duplicate Kurogi Scene", "Duplicate a scene including layers, animations, and audio clips.", z.object({ sceneId: textId.optional() }).strict(), "project.duplicate_scene", ADDITIVE),
  bridgeTool("kurogi_delete_scene", "Delete Kurogi Scene", "Delete a scene immediately. At least one scene must remain.", z.object({ sceneId: textId }).strict(), "project.delete_scene", DELETING),
  bridgeTool("kurogi_set_active_scene", "Set Active Kurogi Scene", "Switch the active scene by ID.", z.object({ sceneId: textId }).strict(), "project.set_active_scene", STATE_CHANGE),
  bridgeTool("kurogi_reorder_scene", "Reorder Kurogi Scene", "Move a scene to an exact zero-based position in the project sequence.", z.object({ sceneId: textId, targetIndex: z.number().int().min(0) }).strict(), "project.reorder_scene", MUTATING),
  bridgeTool("kurogi_set_scene_transition", "Set Kurogi Scene Transition", "Set the transition entering a scene.", z.object({ sceneId: textId.optional(), type: z.enum(["cut", "fade", "slide-left", "slide-right", "zoom"]), duration: z.number().min(0).max(10).default(.4) }).strict(), "project.set_scene_transition", MUTATING),

  bridgeTool("kurogi_create_layer", "Create Kurogi Layer", "Create a text, shape, or existing-asset visual layer immediately.", z.object({ ...layerFields, type: z.enum(["text", "shape", "asset"]) }).strict(), "project.create_layer", ADDITIVE),
  bridgeTool("kurogi_update_layer", "Update Kurogi Layer", "Update common and type-specific layer properties immediately.", z.object({ ...layerFields, layerId: textId }).strict(), "project.update_layer", MUTATING),
  bridgeTool("kurogi_update_layers", "Update Multiple Kurogi Layers", "Move or update multiple layers together in one undoable operation.", z.object({ ...layerFields, layerIds: z.array(textId).min(1).max(200), deltaX: z.number().optional(), deltaY: z.number().optional() }).omit({ layerId: true }).strict(), "project.update_layers", MUTATING),
  bridgeTool("kurogi_set_layer_timing", "Set Kurogi Layer Timing", "Trim or reposition a layer lifespan on its scene timeline.", z.object({ layerId: textId, startTime: z.number().min(0).optional(), duration: z.number().min(.01).optional() }).strict(), "project.set_layer_timing", MUTATING),
  bridgeTool("kurogi_group_layers", "Group Kurogi Layers", "Group at least two layers from the same scene.", z.object({ layerIds: z.array(textId).min(2).max(200), name: z.string().trim().min(1).max(160).optional() }).strict(), "project.group_layers", ADDITIVE),
  bridgeTool("kurogi_ungroup_layer", "Ungroup Kurogi Layer", "Release all children from a group layer.", z.object({ groupId: textId }).strict(), "project.ungroup_layer", MUTATING),
  bridgeTool("kurogi_align_layers", "Align Kurogi Layers", "Align multiple layers to a shared edge or center.", z.object({ layerIds: z.array(textId).min(2).max(200), mode: z.enum(["left", "center", "right", "top", "middle", "bottom"]) }).strict(), "project.align_layers", MUTATING),
  bridgeTool("kurogi_distribute_layers", "Distribute Kurogi Layers", "Distribute three or more layers evenly.", z.object({ layerIds: z.array(textId).min(3).max(200), mode: z.enum(["horizontal", "vertical"]) }).strict(), "project.distribute_layers", MUTATING),
  bridgeTool("kurogi_set_gradient", "Set Kurogi Gradient", "Apply or clear a linear or radial gradient across selected text or shape layers.", z.object({ layerIds: z.array(textId).min(1).max(200), gradient: gradientSchema.nullable() }).strict(), "project.set_gradient", MUTATING),
  bridgeTool("kurogi_set_blend_mode", "Set Kurogi Blend Mode", "Set the CSS-compatible compositing blend mode for selected layers.", z.object({ layerIds: z.array(textId).min(1).max(200), blendMode: z.enum(["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]) }).strict(), "project.set_blend_mode", MUTATING),
  bridgeTool("kurogi_create_clipping_mask", "Create Kurogi Clipping Mask", "Use the eligible layer directly below a target as its clipping mask.", z.object({ targetLayerId: textId }).strict(), "project.create_clipping_mask", MUTATING),
  bridgeTool("kurogi_release_clipping_mask", "Release Kurogi Clipping Mask", "Remove a clipping mask while preserving both layers.", z.object({ targetLayerId: textId }).strict(), "project.release_clipping_mask", MUTATING),
  bridgeTool("kurogi_add_effect", "Add Kurogi Layer Effect", "Add blur, shadow, glow, glass, distortion, chromatic, grain, hue, or vignette effects.", z.object({ ...effectFields, type: effectFields.type.unwrap() }).omit({ effectId: true }).strict(), "project.add_effect", ADDITIVE),
  bridgeTool("kurogi_update_effect", "Update Kurogi Layer Effect", "Update an existing layer effect.", z.object({ ...effectFields, effectId: textId }).omit({ type: true }).strict(), "project.update_effect", MUTATING),
  bridgeTool("kurogi_delete_effect", "Delete Kurogi Layer Effect", "Delete an effect from a layer.", z.object({ layerId: textId, effectId: textId }).strict(), "project.delete_effect", DELETING),
  bridgeTool("kurogi_duplicate_layer", "Duplicate Kurogi Layer", "Duplicate a layer and its animation actions.", z.object({ layerId: textId }).strict(), "project.duplicate_layer", ADDITIVE),
  bridgeTool("kurogi_delete_layer", "Delete Kurogi Layer", "Delete a layer immediately.", z.object({ layerId: textId }).strict(), "project.delete_layer", DELETING),
  bridgeTool("kurogi_reorder_layer", "Reorder Kurogi Layer", "Move a layer one position forward or backward.", z.object({ layerId: textId, direction: z.enum(["up", "down"]) }).strict(), "project.reorder_layer", MUTATING),

  bridgeTool("kurogi_add_animation", "Add Kurogi Animation", "Add an action-based animation to a layer.", z.object({ ...animationFields, layerId: textId, category: z.enum(["in", "loop", "out"]), type: z.string().trim().min(1).max(80) }).strict(), "project.add_animation", ADDITIVE),
  bridgeTool("kurogi_update_animation", "Update Kurogi Animation", "Update timing, easing, parameters, repeat behavior, or motion path of an animation action.", z.object({ ...animationFields, actionId: textId }).strict(), "project.update_animation", MUTATING),
  bridgeTool("kurogi_delete_animation", "Delete Kurogi Animation", "Delete an animation action immediately.", z.object({ actionId: textId }).strict(), "project.delete_animation", DELETING),

  bridgeTool("kurogi_import_asset", "Import Kurogi Asset", "Read and import an image or audio file from an absolute local path immediately. Audio can be placed on the active timeline automatically.", z.object({
    path: z.string().min(1).describe("Absolute path accessible to the local Kurogi Motion desktop app."),
    sceneId: textId.optional(),
    addToTimeline: z.boolean().default(true),
  }).strict(), "asset.import_file", LOCAL_FILE_READ),
  bridgeTool("kurogi_search_assets", "Search Kurogi Assets", "Search reusable assets in the active project by name, MIME type, font family, or asset type.", z.object({ query: z.string().max(240).default(""), type: z.enum(["image", "svg", "audio", "font"]).optional(), limit: z.number().int().min(1).max(100).default(20), offset: z.number().int().min(0).default(0) }).strict(), "asset.search", READ_ONLY),
  bridgeTool("kurogi_get_asset_metadata", "Get Kurogi Asset Metadata", "Read asset dimensions, duration, storage, availability, and all layer or audio usages.", z.object({ assetId: textId }).strict(), "asset.get", READ_ONLY),
  bridgeTool("kurogi_replace_layer_asset", "Replace Kurogi Layer Asset", "Replace the reusable image or SVG backing a visual layer while preserving layout and animation.", z.object({ layerId: textId, assetId: textId }).strict(), "asset.replace_layer", MUTATING),
  bridgeTool("kurogi_delete_unused_assets", "Delete Unused Kurogi Assets", "Delete assets not referenced by visual layers, audio clips, or fonts.", z.object({}).strict(), "asset.delete_unused", DELETING),
  bridgeTool("kurogi_create_audio_clip", "Create Kurogi Audio Clip", "Place an existing audio asset on a scene timeline.", z.object({ ...audioFields, assetId: textId }).strict(), "project.create_audio_clip", ADDITIVE),
  bridgeTool("kurogi_update_audio_clip", "Update Kurogi Audio Clip", "Update audio timing, trim, volume, fades, mute, or playback rate.", z.object({ ...audioFields, clipId: textId }).strict(), "project.update_audio_clip", MUTATING),
  bridgeTool("kurogi_duplicate_audio_clip", "Duplicate Kurogi Audio Clip", "Duplicate an audio clip.", z.object({ clipId: textId }).strict(), "project.duplicate_audio_clip", ADDITIVE),
  bridgeTool("kurogi_delete_audio_clip", "Delete Kurogi Audio Clip", "Delete an audio clip from the timeline without deleting its reusable asset.", z.object({ clipId: textId }).strict(), "project.delete_audio_clip", DELETING),

  bridgeTool("kurogi_apply_edit_plan", "Apply Kurogi Edit Plan", "Apply up to 200 scene, layer, animation, and audio operations immediately as one transactional undo step.", z.object({ operations: z.array(editOperationSchema).min(1).max(200) }).strict(), "project.apply_edit_plan", MUTATING),
  bridgeTool("kurogi_apply_workflow", "Apply Atomic Kurogi Workflow", "Apply up to 200 referenced steps to the active project as one atomic undo step. Supports assign aliases and {$ref:'alias.path'}; if any step fails, no step is committed.", z.object({ steps: z.array(workflowStepSchema).min(1).max(200) }).strict(), "project.apply_workflow", MUTATING),
  bridgeTool("kurogi_undo", "Undo Kurogi Edit", "Undo the latest committed project edit.", z.object({}).strict(), "history.undo", MUTATING),
  bridgeTool("kurogi_redo", "Redo Kurogi Edit", "Redo the latest undone project edit.", z.object({}).strict(), "history.redo", MUTATING),
  bridgeTool("kurogi_create_checkpoint", "Create Kurogi Checkpoint", "Create an in-memory recovery snapshot of the active project. Kurogi retains the latest 20 checkpoints for the open editor session.", z.object({ name: z.string().trim().min(1).max(120).optional() }).strict(), "history.create_checkpoint", ADDITIVE),
  bridgeTool("kurogi_list_checkpoints", "List Kurogi Checkpoints", "List recovery checkpoints for the current editor session.", z.object({}).strict(), "history.list_checkpoints", READ_ONLY),
  bridgeTool("kurogi_restore_checkpoint", "Restore Kurogi Checkpoint", "Restore a checkpoint as a new undoable edit.", z.object({ checkpointId: textId }).strict(), "history.restore_checkpoint", MUTATING),
  bridgeTool("kurogi_save_project", "Save Kurogi Project", "Save the active project to the local project library immediately.", z.object({}).strict(), "project.save", { ...MUTATING, idempotentHint: true }),
  bridgeTool("kurogi_export_active_project", "Export Kurogi Video", "Export the active scene immediately without a Kurogi confirmation. If outputPath is omitted, Kurogi creates a unique destination automatically in the user's Videos folder; no native destination dialog is opened.", z.object({
    ...exportFields,
    outputPath: z.string().min(1).optional().describe("Optional absolute destination path. For PNG sequence, provide a directory. Existing files may be overwritten."),
  }).strict(), "project.export", DIRECT_EXPORT),
  bridgeTool("kurogi_start_render", "Start Kurogi Render", "Start a non-blocking render job and immediately return its job ID. The destination is chosen automatically unless outputPath is supplied.", z.object({ ...exportFields, outputPath: z.string().min(1).optional(), automatic: z.boolean().default(true) }).strict(), "project.start_render", AUTONOMOUS_VIDEO),
  bridgeTool("kurogi_get_render_progress", "Get Kurogi Render Progress", "Poll a render job for phase, frame progress, output path, completion, or failure.", z.object({ jobId: textId }).strict(), "render.get_job", READ_ONLY),
  bridgeTool("kurogi_cancel_render", "Cancel Kurogi Render", "Cancel a queued or running render job.", z.object({ jobId: textId }).strict(), "render.cancel_job", MUTATING),
  {
    name: "kurogi_create_video",
    title: "Create Complete Kurogi Video",
    description: `Create a brand-new project, run up to 200 ordered authoring steps, save it, and render a uniquely named video in one autonomous call. Kurogi never shows a confirmation or destination dialog for this workflow.

Use project.templateId for a ready-made design, steps for custom edits, or both. A step can assign its result to an alias. Later params can reference a result with an object such as {"$ref":"heading.layer.id"}. The reserved alias "project" contains the new project result, including projectId and activeSceneId. Authoring steps are rolled back if one fails.

Example steps: create a text layer with assign="heading", then add an animation with params.layerId={"$ref":"heading.layer.id"}. Output is always a new path under the Videos/Kurogi Motion folder, so this workflow does not overwrite an existing video.`,
    inputSchema: z.object({
      project: projectCreationSchema,
      steps: z.array(workflowStepSchema).max(200).default([]),
      export: z.object(exportFields).strict().default({}),
    }).strict(),
    annotations: AUTONOMOUS_VIDEO,
    run: runAutonomousVideoWorkflow,
  },
];

const WORKFLOW_METHODS = new Set(TOOL_DEFINITIONS
  .filter((definition) => definition.method?.startsWith("project.") || definition.method === "asset.import_file")
  .map((definition) => definition.method)
  .filter((method) => method && !["project.get_context", "project.validate", "project.preview_frame", "project.start_render", "project.save", "project.export", "project.apply_edit_plan", "project.apply_workflow", "asset.search", "asset.get"].includes(method)));

const CAPABILITIES = {
  version: 4,
  model: "autonomous action-based motion design",
  templates: TEMPLATE_IDS,
  authoring: ["project creation", "multi-scene", "scene ordering and transitions", "text", "vector shapes", "image assets", "groups", "alignment and distribution", "gradients", "blend modes", "clipping masks", "layer effects", "animation actions", "layer timing", "audio assets", "audio timeline", "atomic referenced workflows"],
  audio: ["import", "reuse", "trim", "move", "duration", "volume", "mute", "fade-in", "fade-out", "playback-rate", "preview", "export mixing"],
  delivery: ["preview frame", "automatic save", "mp4", "webm", "mov", "gif", "png-sequence", "async render jobs", "progress polling", "render cancellation", "unique automatic output path", "direct output path"],
  automation: ["no in-app confirmation", "no destination dialog", "single-call create-save-render", "atomic assign/$ref workflow", "30-minute export bridge timeout", "structured tool results"],
  safety: ["project validation", "undo and redo", "workflow rollback", "session checkpoints", "authenticated loopback bridge", "sanitized project resources", "accurate MCP risk annotations", "unique non-overwriting autonomous exports"],
};

export async function startKurogiMcpServer(options = {}) {
  const bridgeFile = options.bridgeFile || process.env.KUROGI_MCP_BRIDGE_FILE || findBridgeFileArgument();
  if (!bridgeFile) throw new Error("Kurogi MCP needs a bridge file. Launch the Kurogi Motion executable with --mcp.");

  const server = new McpServer(
    { name: "kurogi-motion-mcp-server", version: "4.0.0" },
    {
      instructions: "Prefer kurogi_create_video for a complete autonomous create-save-render workflow. It creates a new project and a unique output file without Kurogi dialogs. Use atomic tools when editing an existing project. Kurogi itself never requests confirmation for MCP actions; any remaining approval prompt is controlled by the MCP client or host, not this server.",
    },
  );

  for (const definition of TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
        annotations: definition.annotations,
      },
      async (params) => {
        try {
          const result = definition.run
            ? await definition.run(bridgeFile, params)
            : await callBridge(bridgeFile, definition.method, params);
          return definition.formatResult ? await definition.formatResult(result) : toolResult(result);
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    );
  }

  registerJsonResource(server, "kurogi-projects", "kurogi://projects", "Kurogi Motion projects", "Saved projects in the local project library.", async () => callBridge(bridgeFile, "library.list_projects", {}));
  registerJsonResource(server, "kurogi-active-project", "kurogi://active-project", "Active Kurogi Motion project", "Current scenes, layers, animation actions, audio clips, and assets.", async () => callBridge(bridgeFile, "project.get_context", { includeDocument: false }));
  registerJsonResource(server, "kurogi-capabilities", "kurogi://capabilities", "Kurogi Motion MCP capabilities", "Supported autonomous authoring, audio, export, and safety features.", async () => CAPABILITIES);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}

async function runAutonomousVideoWorkflow(bridgeFile, params) {
  if (!params.project.templateId && params.steps.length === 0) {
    throw new Error("kurogi_create_video needs project.templateId, at least one authoring step, or both so it does not render an empty video.");
  }
  const created = await callBridge(bridgeFile, "library.create_project", params.project);
  await waitForActiveProject(bridgeFile, created.projectId);

  for (let index = 0; index < params.steps.length; index += 1) {
    if (!WORKFLOW_METHODS.has(params.steps[index].method)) throw new Error(`Workflow step ${index + 1} uses unsupported method ${params.steps[index].method}.`);
  }

  let steps = [];
  let aliases = ["project"];
  const containsImport = params.steps.some((step) => step.method === "asset.import_file");
  if (params.steps.length && !containsImport) {
    const workflow = await callBridge(bridgeFile, "project.apply_workflow", { steps: params.steps });
    steps = workflow.steps ?? [];
    aliases = Object.keys(workflow.aliases ?? { project: created });
  } else if (params.steps.length) {
    const checkpoint = await callBridge(bridgeFile, "history.create_checkpoint", { name: "Autonomous workflow rollback" });
    const checkpointId = checkpoint?.checkpoint?.id;
    const references = new Map([["project", created]]);
    try {
      for (let index = 0; index < params.steps.length; index += 1) {
        const step = params.steps[index];
        if (step.assign && references.has(step.assign)) throw new Error(`Workflow alias ${step.assign} is already assigned.`);
        const resolvedParams = resolveReferences(step.params, references);
        const result = await callBridge(bridgeFile, step.method, resolvedParams);
        if (step.assign) references.set(step.assign, result);
        steps.push({ index, method: step.method, ...(step.assign ? { assign: step.assign } : {}), result });
      }
      aliases = [...references.keys()];
    } catch (error) {
      if (checkpointId) await callBridge(bridgeFile, "history.restore_checkpoint", { checkpointId }).catch(() => undefined);
      throw new Error(`Autonomous authoring failed and the project was rolled back. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const saved = await callBridge(bridgeFile, "project.save", {});
  const context = await callBridge(bridgeFile, "project.get_context", { includeDocument: false });
  const exported = await callBridge(bridgeFile, "project.export", { ...params.export, automatic: true });
  return {
    created: true,
    project: context.project,
    steps,
    aliases,
    saved,
    export: exported,
  };
}

async function waitForActiveProject(bridgeFile, projectId) {
  await sleep(150);
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const context = await callBridge(bridgeFile, "project.get_context", { includeDocument: false });
      if (!projectId || context?.project?.id === projectId) return context;
      lastError = new Error(`Kurogi opened project ${context?.project?.id ?? "unknown"} instead of ${projectId}.`);
    } catch (error) {
      lastError = error;
    }
    await sleep(150);
  }
  throw new Error(`The new project did not become ready for MCP automation. ${lastError instanceof Error ? lastError.message : ""}`.trim());
}

function resolveReferences(value, references) {
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, references));
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value);
  if (entries.length === 1 && entries[0][0] === "$ref" && typeof entries[0][1] === "string") {
    return readReference(entries[0][1], references);
  }
  return Object.fromEntries(entries.map(([key, item]) => [key, resolveReferences(item, references)]));
}

function readReference(reference, references) {
  const [alias, ...segments] = reference.split(".");
  if (!alias || !references.has(alias)) throw new Error(`Unknown workflow reference alias: ${alias || reference}.`);
  let value = references.get(alias);
  for (const segment of segments) {
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, segment)) {
      throw new Error(`Workflow reference ${reference} does not exist.`);
    }
    value = value[segment];
  }
  return value;
}

function bridgeTool(name, title, description, inputSchema, method, annotations) {
  return { name, title, description, inputSchema, method, annotations };
}

function registerJsonResource(server, name, uri, title, description, load) {
  server.registerResource(name, uri, { title, description, mimeType: "application/json" }, async () => ({
    contents: [{ uri, mimeType: "application/json", text: JSON.stringify(await load(), null, 2) }],
  }));
}

async function callBridge(bridgeFile, method, params) {
  const bridge = await readBridgeInfo(bridgeFile);
  const controller = new AbortController();
  const timeout = method === "project.export" ? EXPORT_TIMEOUT_MS : method === "project.preview_frame" ? PREVIEW_TIMEOUT_MS : STANDARD_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`http://${bridge.host}:${bridge.port}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bridge.token}` },
      body: JSON.stringify({ method, params }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Kurogi MCP bridge returned HTTP ${response.status}.`);
    return payload.result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(method === "project.export" ? "Kurogi Motion did not finish the export within 30 minutes." : method === "project.preview_frame" ? "Kurogi Motion did not render the preview within 5 minutes." : "Kurogi Motion did not answer the MCP request in time.");
    if (error instanceof TypeError) throw new Error("Kurogi Motion is not running or its MCP bridge is unavailable.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readBridgeInfo(bridgeFile) {
  let raw;
  try { raw = await fs.promises.readFile(bridgeFile, "utf8"); }
  catch { throw new Error("Kurogi Motion is not running. Open the desktop app before using its MCP tools."); }
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("Kurogi Motion MCP bridge metadata is invalid."); }
  if (value?.version !== 1 || value.host !== "127.0.0.1" || !Number.isInteger(value.port) || typeof value.token !== "string") throw new Error("Kurogi Motion MCP bridge metadata is incomplete.");
  return value;
}

function toolResult(result) {
  const structuredContent = result && typeof result === "object" && !Array.isArray(result) ? result : { value: result };
  return { content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
}

async function previewFrameResult(result) {
  if (!result?.path || !path.isAbsolute(result.path) || result.mimeType !== "image/png") throw new Error("Kurogi Motion returned an invalid preview frame result.");
  const bytes = await fs.promises.readFile(result.path);
  const structuredContent = { ...result, byteSize: bytes.length };
  return {
    content: [
      { type: "image", data: bytes.toString("base64"), mimeType: "image/png" },
      { type: "text", text: JSON.stringify(structuredContent, null, 2) },
    ],
    structuredContent,
  };
}

function toolError(message) { return { isError: true, content: [{ type: "text", text: message }] }; }
function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function findBridgeFileArgument() { const argument = process.argv.find((value) => value.startsWith("--bridge-file=")); return argument ? path.resolve(argument.slice("--bridge-file=".length)) : ""; }

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && pathToFileURL(invokedFile).href === pathToFileURL(currentFile).href) {
  startKurogiMcpServer().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
