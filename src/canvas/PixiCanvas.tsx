import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  FederatedPointerEvent,
  Graphics,
  Rectangle,
  Text,
  TextStyle,
} from "pixi.js";
import type {
  EvaluatedLayer,
  KurogiProject,
  LayerDocument,
  LayerId,
  TransformDocument,
} from "../domain/project";
import { evaluateSceneAtTime } from "../engine/evaluator";
import { commandManager } from "../core/history/CommandManager";
import { createLayerPatchCommand } from "../core/history/projectCommands";
import { useDocumentStore } from "../stores/documentStore";
import { useEditorStore } from "../stores/editorStore";
import { usePlaybackStore } from "../stores/playbackStore";

interface DisplayEntry {
  type: LayerDocument["type"];
  container: Container;
  visual: Graphics | Text;
}

type TransformMode = "move" | "resize" | "rotate";

interface TransformSession {
  mode: TransformMode;
  layerId: LayerId;
  before: TransformDocument;
  pointerStart: { x: number; y: number };
  positionStart: { x: number; y: number };
  sizeStart: { width: number; height: number };
  rotationStart: number;
  pointerAngleStart: number;
}

interface PanSession {
  pointerStart: { x: number; y: number };
  panStart: { x: number; y: number };
}

const cloneTransform = (transform: TransformDocument): TransformDocument =>
  structuredClone(transform);

const createVisual = (layer: LayerDocument): Graphics | Text => {
  if (layer.type === "text") {
    return new Text({
      text: layer.content,
      style: new TextStyle({
        fontFamily: layer.textStyle.fontFamily,
        fontSize: layer.textStyle.fontSize,
        fontWeight: String(layer.textStyle.fontWeight),
        fontStyle: layer.textStyle.fontStyle,
        fill: layer.textStyle.color,
        align: layer.textStyle.horizontalAlign,
        lineHeight: layer.textStyle.fontSize * layer.textStyle.lineHeight,
        letterSpacing: layer.textStyle.letterSpacing,
        wordWrap: layer.textStyle.wrapping === "fixed-width",
        wordWrapWidth: layer.transform.size.width,
      }),
    });
  }
  return new Graphics();
};

const redrawVisual = (entry: DisplayEntry, evaluated: EvaluatedLayer): void => {
  const layer = evaluated.source;
  if (entry.visual instanceof Text && layer.type === "text") {
    entry.visual.text = layer.content;
    entry.visual.style = new TextStyle({
      fontFamily: layer.textStyle.fontFamily,
      fontSize: layer.textStyle.fontSize,
      fontWeight: String(layer.textStyle.fontWeight),
      fontStyle: layer.textStyle.fontStyle,
      fill: layer.textStyle.color,
      align: layer.textStyle.horizontalAlign,
      lineHeight: layer.textStyle.fontSize * layer.textStyle.lineHeight,
      letterSpacing: layer.textStyle.letterSpacing,
      wordWrap: layer.textStyle.wrapping === "fixed-width",
      wordWrapWidth: evaluated.transform.width,
    });
    return;
  }

  if (!(entry.visual instanceof Graphics)) return;
  const graphics = entry.visual;
  const width = evaluated.transform.width;
  const height = evaluated.transform.height;
  const fill = evaluated.appearance.fillColor ?? "#7c5cff";
  graphics.clear();

  if (layer.type === "ellipse") {
    graphics.ellipse(width / 2, height / 2, width / 2, height / 2).fill(fill);
  } else if (layer.type === "image" || layer.type === "svg") {
    graphics.roundRect(0, 0, width, height, 18).fill("#242737");
    graphics.roundRect(1, 1, width - 2, height - 2, 17).stroke({
      width: 2,
      color: "#6f6687",
    });
  } else if (layer.type === "group") {
    graphics.rect(0, 0, width, height).stroke({ width: 2, color: "#9d8cff" });
  } else {
    graphics
      .roundRect(0, 0, width, height, evaluated.appearance.borderRadius ?? 0)
      .fill(fill);
  }

  if (evaluated.appearance.strokeColor && evaluated.appearance.strokeWidth) {
    if (layer.type === "ellipse") {
      graphics
        .ellipse(width / 2, height / 2, width / 2, height / 2)
        .stroke({
          width: evaluated.appearance.strokeWidth,
          color: evaluated.appearance.strokeColor,
        });
    } else {
      graphics
        .roundRect(0, 0, width, height, evaluated.appearance.borderRadius ?? 0)
        .stroke({
          width: evaluated.appearance.strokeWidth,
          color: evaluated.appearance.strokeColor,
        });
    }
  }
};

export function PixiCanvas(): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const applicationRef = useRef<Application | null>(null);
  const sceneRootRef = useRef<Container | null>(null);
  const contentRef = useRef<Container | null>(null);
  const overlayRef = useRef<Container | null>(null);
  const entriesRef = useRef(new Map<LayerId, DisplayEntry>());
  const transformSessionRef = useRef<TransformSession | null>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const renderRef = useRef<() => void>(() => undefined);

  const project = useDocumentStore((state) => state.project);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const zoom = useEditorStore((state) => state.zoom);
  const pan = useEditorStore((state) => state.pan);
  const activeTool = useEditorStore((state) => state.activeTool);

  const projectRef = useRef<KurogiProject>(project);
  const selectedRef = useRef(selectedLayerIds);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const activeToolRef = useRef(activeTool);

  useEffect(() => {
    projectRef.current = project;
    selectedRef.current = selectedLayerIds;
    zoomRef.current = zoom;
    panRef.current = pan;
    activeToolRef.current = activeTool;
    renderRef.current();
  }, [activeTool, pan, project, selectedLayerIds, zoom]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = (): void => undefined;
    const app = new Application();

    const initialize = async (): Promise<void> => {
      await app.init({
        resizeTo: host,
        antialias: true,
        backgroundAlpha: 0,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }

      applicationRef.current = app;
      host.appendChild(app.canvas);
      app.canvas.className = "pixi-canvas-element";
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      const sceneRoot = new Container();
      const content = new Container();
      const overlay = new Container();
      sceneRoot.addChild(content, overlay);
      app.stage.addChild(sceneRoot);
      sceneRootRef.current = sceneRoot;
      contentRef.current = content;
      overlayRef.current = overlay;

      const startTransform = (
        event: FederatedPointerEvent,
        layerId: LayerId,
        mode: TransformMode,
      ): void => {
        event.stopPropagation();
        const currentProject = projectRef.current;
        const layer = currentProject.layers[layerId];
        if (!layer || layer.locked || !sceneRootRef.current) return;
        const point = event.getLocalPosition(sceneRootRef.current);
        const centerX = layer.transform.position.x + layer.transform.size.width / 2;
        const centerY = layer.transform.position.y + layer.transform.size.height / 2;
        transformSessionRef.current = {
          mode,
          layerId,
          before: cloneTransform(layer.transform),
          pointerStart: { x: point.x, y: point.y },
          positionStart: { ...layer.transform.position },
          sizeStart: { ...layer.transform.size },
          rotationStart: layer.transform.rotation,
          pointerAngleStart: Math.atan2(point.y - centerY, point.x - centerX),
        };
        useEditorStore.getState().selectLayer(layerId, event.shiftKey);
      };

      const renderSelection = (evaluatedLayers: EvaluatedLayer[]): void => {
        const overlayContainer = overlayRef.current;
        if (!overlayContainer) return;
        for (const child of overlayContainer.removeChildren()) child.destroy({ children: true });
        const selectedId = selectedRef.current.at(-1);
        const evaluated = evaluatedLayers.find((layer) => layer.id === selectedId);
        if (!evaluated) return;

        const layer = evaluated.source;
        const box = new Container();
        box.position.set(
          evaluated.transform.x + evaluated.transform.width * evaluated.transform.anchorX,
          evaluated.transform.y + evaluated.transform.height * evaluated.transform.anchorY,
        );
        box.pivot.set(
          evaluated.transform.width * evaluated.transform.anchorX,
          evaluated.transform.height * evaluated.transform.anchorY,
        );
        box.scale.set(evaluated.transform.scaleX, evaluated.transform.scaleY);
        box.rotation = (evaluated.transform.rotation * Math.PI) / 180;

        const outline = new Graphics()
          .rect(0, 0, evaluated.transform.width, evaluated.transform.height)
          .stroke({ width: 3 / Math.max(zoomRef.current, 0.1), color: "#9f86ff" });
        outline.eventMode = "none";
        box.addChild(outline);

        const handleSize = 16 / Math.max(zoomRef.current, 0.1);
        const resizeHandle = new Graphics()
          .roundRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize, 3)
          .fill("#ffffff")
          .stroke({ width: 3 / Math.max(zoomRef.current, 0.1), color: "#7c5cff" });
        resizeHandle.position.set(evaluated.transform.width, evaluated.transform.height);
        resizeHandle.eventMode = "static";
        resizeHandle.cursor = "nwse-resize";
        resizeHandle.on("pointerdown", (event) => startTransform(event, layer.id, "resize"));
        box.addChild(resizeHandle);

        const rotationHandle = new Graphics()
          .circle(0, 0, handleSize / 2)
          .fill("#a78bfa")
          .stroke({ width: 2 / Math.max(zoomRef.current, 0.1), color: "#ffffff" });
        rotationHandle.position.set(evaluated.transform.width / 2, -34 / zoomRef.current);
        rotationHandle.eventMode = "static";
        rotationHandle.cursor = "grab";
        rotationHandle.on("pointerdown", (event) => startTransform(event, layer.id, "rotate"));
        box.addChild(rotationHandle);
        overlayContainer.addChild(box);
      };

      const syncScene = (): void => {
        const currentProject = projectRef.current;
        const scene = currentProject.scenes[currentProject.activeSceneId];
        const sceneRootContainer = sceneRootRef.current;
        const contentContainer = contentRef.current;
        if (!scene || !sceneRootContainer || !contentContainer) return;

        const evaluated = evaluateSceneAtTime(
          currentProject,
          scene.id,
          usePlaybackStore.getState().currentTimeMs,
        );

        sceneRootContainer.scale.set(zoomRef.current);
        sceneRootContainer.position.set(
          (app.screen.width - scene.width * zoomRef.current) / 2 + panRef.current.x,
          (app.screen.height - scene.height * zoomRef.current) / 2 + panRef.current.y,
        );

        const activeIds = new Set(evaluated.layers.map((layer) => layer.id));
        for (const [layerId, entry] of entriesRef.current) {
          if (!activeIds.has(layerId)) {
            contentContainer.removeChild(entry.container);
            entry.container.destroy({ children: true });
            entriesRef.current.delete(layerId);
          }
        }

        const backgroundId = "__scene-background";
        let background = contentContainer.getChildByLabel(backgroundId) as Graphics | null;
        if (!background) {
          background = new Graphics();
          background.label = backgroundId;
          contentContainer.addChildAt(background, 0);
        }
        background.clear();
        if (scene.background.type === "solid") {
          background.rect(0, 0, scene.width, scene.height).fill(scene.background.color);
        }
        background.eventMode = "static";
        background.removeAllListeners("pointerdown");
        background.on("pointerdown", (event: FederatedPointerEvent) => {
          if (event.button === 0 && activeToolRef.current !== "hand") {
            useEditorStore.getState().selectLayer(null);
          }
        });

        evaluated.layers.forEach((evaluatedLayer, index) => {
          const source = evaluatedLayer.source;
          let entry = entriesRef.current.get(source.id);
          if (!entry || entry.type !== source.type) {
            if (entry) {
              contentContainer.removeChild(entry.container);
              entry.container.destroy({ children: true });
            }
            const container = new Container();
            const visual = createVisual(source);
            container.addChild(visual);
            container.eventMode = "static";
            container.cursor = source.locked ? "not-allowed" : "move";
            container.on("pointerdown", (event: FederatedPointerEvent) =>
              startTransform(event, source.id, "move"),
            );
            entry = { type: source.type, container, visual };
            entriesRef.current.set(source.id, entry);
            contentContainer.addChild(entry.container);
          }

          redrawVisual(entry, evaluatedLayer);
          entry.container.visible = evaluatedLayer.visible;
          entry.container.alpha = evaluatedLayer.appearance.opacity;
          entry.container.position.set(
            evaluatedLayer.transform.x +
              evaluatedLayer.transform.width * evaluatedLayer.transform.anchorX,
            evaluatedLayer.transform.y +
              evaluatedLayer.transform.height * evaluatedLayer.transform.anchorY,
          );
          entry.container.pivot.set(
            evaluatedLayer.transform.width * evaluatedLayer.transform.anchorX,
            evaluatedLayer.transform.height * evaluatedLayer.transform.anchorY,
          );
          entry.container.scale.set(
            evaluatedLayer.transform.scaleX,
            evaluatedLayer.transform.scaleY,
          );
          entry.container.rotation = (evaluatedLayer.transform.rotation * Math.PI) / 180;
          entry.container.hitArea = new Rectangle(
            0,
            0,
            evaluatedLayer.transform.width,
            evaluatedLayer.transform.height,
          );
          entry.container.cursor = source.locked ? "not-allowed" : "move";
          contentContainer.setChildIndex(entry.container, index + 1);
        });

        renderSelection(evaluated.layers);
      };

      renderRef.current = syncScene;

      const onPointerDown = (event: FederatedPointerEvent): void => {
        const targetLabel = (event.target as Container).label;
        if (
          event.target !== app.stage &&
          event.target !== content &&
          targetLabel !== "__scene-background"
        )
          return;
        if (event.button === 1 || activeToolRef.current === "hand") {
          panSessionRef.current = {
            pointerStart: { x: event.global.x, y: event.global.y },
            panStart: { ...panRef.current },
          };
        }
      };

      const onPointerMove = (event: FederatedPointerEvent): void => {
        const panSession = panSessionRef.current;
        if (panSession) {
          useEditorStore.getState().setPan({
            x: panSession.panStart.x + event.global.x - panSession.pointerStart.x,
            y: panSession.panStart.y + event.global.y - panSession.pointerStart.y,
          });
          return;
        }

        const session = transformSessionRef.current;
        if (!session || !sceneRootRef.current) return;
        const currentProject = useDocumentStore.getState().project;
        const layer = currentProject.layers[session.layerId];
        if (!layer) return;
        const point = event.getLocalPosition(sceneRootRef.current);
        const snapEnabled = currentProject.settings.snapEnabled;
        const snap = (value: number): number =>
          snapEnabled ? Math.round(value / 10) * 10 : value;

        if (session.mode === "move") {
          const nextX = snap(session.positionStart.x + point.x - session.pointerStart.x);
          const nextY = snap(session.positionStart.y + point.y - session.pointerStart.y);
          useDocumentStore.getState().patchLayer(session.layerId, {
            transform: {
              ...layer.transform,
              position: { x: nextX, y: nextY },
            },
          } as Partial<LayerDocument>);
        } else if (session.mode === "resize") {
          const width = Math.max(20, snap(session.sizeStart.width + point.x - session.pointerStart.x));
          const height = Math.max(20, snap(session.sizeStart.height + point.y - session.pointerStart.y));
          useDocumentStore.getState().patchLayer(session.layerId, {
            transform: {
              ...layer.transform,
              size: { width, height },
            },
          } as Partial<LayerDocument>);
        } else {
          const centerX = session.positionStart.x + session.sizeStart.width / 2;
          const centerY = session.positionStart.y + session.sizeStart.height / 2;
          const angle = Math.atan2(point.y - centerY, point.x - centerX);
          let rotation =
            session.rotationStart + ((angle - session.pointerAngleStart) * 180) / Math.PI;
          if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
          useDocumentStore.getState().patchLayer(session.layerId, {
            transform: { ...layer.transform, rotation },
          } as Partial<LayerDocument>);
        }
      };

      const finishPointerSession = (): void => {
        panSessionRef.current = null;
        const session = transformSessionRef.current;
        transformSessionRef.current = null;
        if (!session) return;
        const layer = useDocumentStore.getState().project.layers[session.layerId];
        if (!layer) return;
        const after = cloneTransform(layer.transform);
        if (JSON.stringify(session.before) === JSON.stringify(after)) return;
        commandManager.commitExecuted(
          createLayerPatchCommand(
            session.layerId,
            { transform: session.before } as Partial<LayerDocument>,
            { transform: after } as Partial<LayerDocument>,
            session.mode === "move"
              ? "Move layer"
              : session.mode === "resize"
                ? "Resize layer"
                : "Rotate layer",
          ),
        );
      };

      app.stage.on("pointerdown", onPointerDown);
      app.stage.on("pointermove", onPointerMove);
      app.stage.on("pointerup", finishPointerSession);
      app.stage.on("pointerupoutside", finishPointerSession);

      const onWheel = (event: WheelEvent): void => {
        event.preventDefault();
        const current = useEditorStore.getState().zoom;
        const factor = event.deltaY > 0 ? 0.9 : 1.1;
        useEditorStore.getState().setZoom(current * factor);
      };
      host.addEventListener("wheel", onWheel, { passive: false });
      syncScene();

      const unsubscribePlayback = usePlaybackStore.subscribe(() => syncScene());
      const resizeObserver = new ResizeObserver(() => syncScene());
      resizeObserver.observe(host);

      cleanup = () => {
        unsubscribePlayback();
        resizeObserver.disconnect();
        host.removeEventListener("wheel", onWheel);
      };
    };

    void initialize();

    return () => {
      disposed = true;
      cleanup();
      renderRef.current = () => undefined;
      entriesRef.current.clear();
      if (applicationRef.current) {
        applicationRef.current.destroy(true, { children: true });
        applicationRef.current = null;
      }
      sceneRootRef.current = null;
      contentRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  return <div ref={hostRef} className="pixi-canvas-host" aria-label="Motion canvas" />;
}
