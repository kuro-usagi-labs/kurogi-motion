import { z } from "zod";

const pointSchema = z.object({ x: z.number(), y: z.number() });
const transformSchema = z.object({
  position: pointSchema,
  size: z.object({ width: z.number().positive(), height: z.number().positive() }),
  scale: pointSchema,
  rotation: z.number(),
  anchor: pointSchema,
  skew: pointSchema,
});

const appearanceSchema = z.object({
  opacity: z.number().min(0).max(1),
  fill: z.object({ color: z.string() }).optional(),
  stroke: z.object({ color: z.string(), width: z.number().min(0) }).optional(),
  borderRadius: z.number().min(0).optional(),
  shadow: z
    .object({
      color: z.string(),
      blur: z.number().min(0),
      offsetX: z.number(),
      offsetY: z.number(),
      opacity: z.number().min(0).max(1),
    })
    .optional(),
  blur: z.number().min(0),
});

const baseLayerSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  parentId: z.string().nullable(),
  type: z.enum(["text", "rectangle", "ellipse", "image", "svg", "group"]),
  name: z.string().min(1),
  visible: z.boolean(),
  locked: z.boolean(),
  transform: transformSchema,
  appearance: appearanceSchema,
  animationActionIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const kurogiProjectSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  activeSceneId: z.string().min(1),
  sceneOrder: z.array(z.string()).min(1),
  scenes: z.record(
    z.object({
      id: z.string(),
      name: z.string(),
      width: z.number().positive(),
      height: z.number().positive(),
      durationMs: z.number().positive(),
      fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
      background: z.union([
        z.object({ type: z.literal("solid"), color: z.string() }),
        z.object({ type: z.literal("transparent") }),
      ]),
      rootLayerIds: z.array(z.string()),
    }),
  ),
  layers: z.record(baseLayerSchema.passthrough()),
  animationActions: z.record(
    z.object({
      id: z.string(),
      sceneId: z.string(),
      layerId: z.string(),
      category: z.enum(["in", "loop", "out"]),
      type: z.enum(["fade", "move", "scale", "rotate", "blur", "pulse", "float"]),
      startTimeMs: z.number().min(0),
      durationMs: z.number().positive(),
      easing: z.enum([
        "linear",
        "easeIn",
        "easeOut",
        "easeInOut",
        "backIn",
        "backOut",
        "overshoot",
        "bounce",
        "elastic",
      ]),
      parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
      enabled: z.boolean(),
    }).passthrough(),
  ),
  assets: z.record(z.unknown()),
  settings: z.object({
    defaultFps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    autoSave: z.boolean(),
    snapEnabled: z.boolean(),
    gridEnabled: z.boolean(),
    guidesEnabled: z.boolean(),
  }),
});
