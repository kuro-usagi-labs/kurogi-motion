import type { KurogiProject, Layer, TextLayer } from "../types";

export type CanvasResizeHandle = "east" | "south" | "south-east";

const DEFAULT_MINIMUM_SIZE = 8;
const LINE_MINIMUM_LENGTH = 4;
const LINE_MINIMUM_THICKNESS = 1;

/**
 * Calculates the live layer shown while a canvas resize gesture is active.
 * Keeping this pure makes pointer previews and the final committed value use
 * exactly the same geometry.
 */
export function resizeLayerOnCanvas<T extends Layer>(
  initial: T,
  handle: CanvasResizeHandle,
  delta: { x: number; y: number },
  preserveAspectRatio = false,
): T {
  if (initial.type === "text" && handle === "south-east") {
    return resizeTextProportionally(initial, delta) as T;
  }

  const minimum = canvasLayerMinimumSize(initial);
  let width = initial.size.width;
  let height = initial.size.height;

  if (handle === "east" || handle === "south-east") {
    width = Math.max(minimum.width, initial.size.width + delta.x);
  }
  if (handle === "south" || handle === "south-east") {
    height = Math.max(minimum.height, initial.size.height + delta.y);
  }

  if (handle === "south-east" && preserveAspectRatio) {
    const factor = proportionalResizeFactor(initial.size, delta);
    const minimumFactor = Math.max(
      minimum.width / Math.max(0.001, initial.size.width),
      minimum.height / Math.max(0.001, initial.size.height),
    );
    const safeFactor = Math.max(minimumFactor, factor);
    width = initial.size.width * safeFactor;
    height = initial.size.height * safeFactor;
  }

  return {
    ...initial,
    size: { width, height },
  } as T;
}

export function canvasLayerMinimumSize(layer: Layer) {
  if (layer.type !== "shape" || layer.shape !== "line") {
    return { width: DEFAULT_MINIMUM_SIZE, height: DEFAULT_MINIMUM_SIZE };
  }

  // Kurogi's line primitive uses its shortest local axis as its thickness.
  // Preserve a usable length while still allowing a true one-pixel hairline.
  return layer.size.width >= layer.size.height
    ? { width: LINE_MINIMUM_LENGTH, height: LINE_MINIMUM_THICKNESS }
    : { width: LINE_MINIMUM_THICKNESS, height: LINE_MINIMUM_LENGTH };
}

/** Makes clipping-mask dependants consume the same draft geometry as the source. */
export function projectWithCanvasDraft(project: KurogiProject, draft: Layer | null): KurogiProject {
  if (!draft || project.layers[draft.id] === draft) return project;
  return {
    ...project,
    layers: {
      ...project.layers,
      [draft.id]: draft,
    },
  };
}

/**
 * A 2D transform avoids eagerly rasterising the complete artboard subtree.
 * That keeps text, SVG and masks sharp after infinite-canvas zoom changes.
 */
export function crispWorkspaceTransform(pan: { x: number; y: number }, zoomPercent: number) {
  const scale = Math.min(2.5, Math.max(0.05, zoomPercent / 100));
  return `translate(${finite(pan.x)}px, ${finite(pan.y)}px) scale(${finite(scale)})`;
}

function resizeTextProportionally(initial: TextLayer, delta: { x: number; y: number }): TextLayer {
  const factor = proportionalResizeFactor(initial.size, delta);
  const minimumFactor = Math.max(
    1 / Math.max(1, initial.style.fontSize),
    4 / Math.max(0.001, initial.size.width),
    4 / Math.max(0.001, initial.size.height),
  );
  const safeFactor = Math.max(minimumFactor, factor);

  return {
    ...initial,
    size: {
      width: initial.size.width * safeFactor,
      height: initial.size.height * safeFactor,
    },
    style: {
      ...initial.style,
      fontSize: Math.max(1, initial.style.fontSize * safeFactor),
      letterSpacing: initial.style.letterSpacing * safeFactor,
      strokeWidth: initial.style.strokeWidth === undefined
        ? undefined
        : initial.style.strokeWidth * safeFactor,
    },
  };
}

function proportionalResizeFactor(size: { width: number; height: number }, delta: { x: number; y: number }) {
  const width = Math.max(0.001, size.width);
  const height = Math.max(0.001, size.height);
  // Project the pointer delta onto the original diagonal. This is the closest
  // proportional corner to the pointer and avoids the handle jumping when one
  // axis moves more than the other.
  return 1 + (delta.x * width + delta.y * height) / (width * width + height * height);
}

function finite(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
}
