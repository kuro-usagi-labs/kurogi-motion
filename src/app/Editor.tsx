import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import {
  addLayers,
  cloneProject,
  createAnimationAction,
  createAssetLayer,
  createId,
  createShapeLayer,
  createTextLayer,
  duplicateLayer,
  getActiveScene,
  getSceneLayers,
  removeLayer,
  reorderLayer,
  setSceneLayerOrder,
  touchProject,
  updateAction,
  updateLayer,
} from "../core/project";
import { clearDraft, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";
import {
  copyLayersToScene,
  createScene as createWorkspaceScene,
  duplicateScene as duplicateWorkspaceScene,
  ensureSceneWorkspace,
  moveScene as moveWorkspaceScene,
  removeScene as removeWorkspaceScene,
  renameScene as renameWorkspaceScene,
  setActiveScene,
  updateScene as updateWorkspaceScene,
  type SceneUpdatePatch,
  type SceneWorkspacePosition,
} from "../core/sceneWorkspace";
import {
  alignLayers,
  applyMask,
  clearMask,
  distributeLayers,
  groupLayers,
  setBackgroundBlur,
  setBlendMode,
  setFontFamily,
  setGradient,
  ungroupLayer,
  type AlignMode,
  type DistributeMode,
} from "../core/designTools";
import { useProjectHistory } from "../core/useProjectHistory";
import { Inspector, type InspectorTab } from "../editor/InspectorV2";
import { MultiSceneCanvasStage } from "../editor/MultiSceneCanvasStage";
import { DesignToolsPanel } from "../editor/DesignToolsPanel";
import { Icon, type IconName } from "../ui/Icon";
import { ShapeIcon } from "../ui/ShapeIcon";
import { SHAPE_DEFINITIONS, type ShapeGroup } from "../core/shapeLibrary";
import { Timeline } from "../editor/TimelineV3";
import { ExportDialog, ExportToast, type ExportNotice } from "../editor/ExportDialog";
import type {
  AnimationAction,
  AnimationCategory,
  AnimationType,
  ExportOptions,
  ExportProgress,
  GradientFill,
  KurogiProject,
  Layer,
  ProjectAsset,
  ShapeType,
} from "../types";

interface EditorProps {
  initialProject: KurogiProject;
  onExit: (project: KurogiProject) => void;
}

type SidebarTab = "layers" | "assets" | "text" | "shapes" | "templates";

const SIDEBAR_TABS: Array<{ id: SidebarTab; icon: IconName; label: string }> = [
  { id: "layers", icon: "layers", label: "Layers" },
  { id: "assets", icon: "assets", label: "Assets" },
  { id: "text", icon: "text", label: "Text" },
  { id: "shapes", icon: "shapes", label: "Shapes" },
  { id: "templates", icon: "templates", label: "Templates" },
];

export function Editor({ initialProject, onExit }: EditorProps) {
  const preparedInitialProject = useMemo(() => ensureSceneWorkspace(initialProject), [initialProject]);
  const history = useProjectHistory(preparedInitialProject);
  const { project } = history;
  const scene = getActiveScene(project);
  const layers = getSceneLayers(project);
  const [selectedLayerId, setPrimaryLayerId] = useState(scene.layerIds.at(-1) ?? "");
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>(() => selectedLayerId ? [selectedLayerId] : []);
  const [selectedActionId, setSelectedActionId] = useState("");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("layers");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Design");
  const [zoom, setZoom] = useState(64);
  const [playing, setPlaying] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [draggedLayerId, setDraggedLayerId] = useState("");
  const [dragOverLayerId, setDragOverLayerId] = useState("");
  const [saveStatus, setSaveStatus] = useState<"Saving draft…" | "Draft saved" | "Saving…" | "Saved" | "Save failed" | "Copied">("Saved");
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "mp4",
    fps: scene.fps as 24 | 30 | 60,
    scale: 1,
    quality: "high",
    transparent: false,
    gifLoops: null,
  });
  const playerRef = useRef<PlayerRef>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);

  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;
  const selectedLayers = useMemo(() => selectedLayerIds.map((id) => project.layers[id]).filter((layer): layer is Layer => Boolean(layer)), [project.layers, selectedLayerIds]);
  const selectedAction = useMemo(() => {
    if (!selectedActionId) return null;
    for (const layer of Object.values(project.layers)) {
      const action = layer.animationActions.find((candidate) => candidate.id === selectedActionId);
      if (action) return action;
    }
    return null;
  }, [project.layers, selectedActionId]);

  useEffect(() => {
    const active = project.scenes[project.activeSceneId];
    const selected = selectedLayerId ? project.layers[selectedLayerId] : null;
    if (!active) return;
    if (!selected || selected.sceneId !== active.id) {
      selectOnly(active.layerIds.at(-1) ?? "");
      setSelectedActionId("");
    }
    setPlaying(false);
  }, [project.activeSceneId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [project.id]);

  useEffect(() => {
    if (!project.settings.autoSave || project.updatedAt === initialProject.updatedAt) return;
    setSaveStatus("Saving draft…");
    const timer = window.setTimeout(async () => {
      try {
        await saveDraft(history.projectRef.current);
        setSaveStatus("Draft saved");
      } catch {
        setSaveStatus("Save failed");
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [history.projectRef, initialProject.updatedAt, project, project.settings.autoSave]);

  useEffect(() => {
    const flushRecovery = () => {
      const current = history.projectRef.current;
      if (document.visibilityState === "hidden" && current.updatedAt !== initialProject.updatedAt) void saveDraft(current);
    };
    document.addEventListener("visibilitychange", flushRecovery);
    return () => document.removeEventListener("visibilitychange", flushRecovery);
  }, [history.projectRef, initialProject.updatedAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);
      const modifier = event.ctrlKey || event.metaKey;
      if (!editable && event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (!editable && event.key === "ArrowLeft") {
        event.preventDefault();
        const current = playerRef.current?.getCurrentFrame() ?? 0;
        playerRef.current?.seekTo(Math.max(0, current - 1));
      }
      if (!editable && event.key === "ArrowRight") {
        event.preventDefault();
        const current = playerRef.current?.getCurrentFrame() ?? 0;
        playerRef.current?.seekTo(Math.min(scene.duration * scene.fps - 1, current + 1));
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveNow();
      }
      if (!editable && modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      }
      if (!editable && modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
      }
      if (!editable && modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        if (selectedActionId) duplicateAction(selectedActionId);
        else duplicateSelectedLayer();
      }
      if (!editable && modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelected();
        else groupSelected();
      }
      if (!editable && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        if (selectedActionId) deleteAction(selectedActionId);
        else deleteSelectedLayer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const unsubscribe = window.kurogi?.onExportProgress?.((progress) => setExportProgress(progress));
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    if (!exportNotice) return;
    const timer = window.setTimeout(() => setExportNotice(null), exportNotice.tone === "success" ? 6500 : 9000);
    return () => window.clearTimeout(timer);
  }, [exportNotice]);

  function selectOnly(layerId: string) {
    setPrimaryLayerId(layerId);
    setSelectedLayerIds(layerId ? [layerId] : []);
  }

  function selectLayer(layerId: string, additive = false) {
    if (!layerId) {
      selectOnly("");
      setSelectedActionId("");
      return;
    }
    if (additive) {
      setSelectedLayerIds((current) => {
        const next = current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId];
        setPrimaryLayerId(next.at(-1) ?? "");
        return next;
      });
    } else selectOnly(layerId);
    if (project.layers[layerId]?.animationActions.every((action) => action.id !== selectedActionId)) setSelectedActionId("");
  }

  function selectAction(layerId: string, actionId: string) {
    selectOnly(layerId);
    setSelectedActionId(actionId);
    setInspectorTab("Animation");
  }

  function commitProject(updater: (current: KurogiProject) => KurogiProject) {
    history.commit(updater);
  }

  function previewLayer(layerId: string, updater: (layer: Layer) => Layer) {
    history.preview((current) => updateLayer(current, layerId, updater));
  }

  function commitLayer(layerId: string, updater: (layer: Layer) => Layer) {
    commitProject((current) => updateLayer(current, layerId, updater));
  }

  function previewAction(
    layerId: string,
    actionId: string,
    updater: (action: AnimationAction) => AnimationAction,
  ) {
    history.preview((current) => updateAction(current, layerId, actionId, updater));
  }

  function commitAction(
    layerId: string,
    actionId: string,
    updater: (action: AnimationAction) => AnimationAction,
  ) {
    commitProject((current) => updateAction(current, layerId, actionId, updater));
  }

  function addText(preset: "heading" | "subheading" | "body" = "heading") {
    const currentScene = getActiveScene(project);
    const layer = createTextLayer(currentScene, {
      name: preset === "heading" ? "Heading" : preset === "subheading" ? "Subheading" : "Body text",
      text: preset === "heading" ? "YOUR IDEA" : preset === "subheading" ? "Add a supporting line" : "Write something worth moving.",
      size: preset === "heading" ? { width: 700, height: 150 } : { width: 620, height: 100 },
      fontSize: preset === "heading" ? 82 : preset === "subheading" ? 46 : 30,
    });
    layer.animationActions.push(
      createAnimationAction(layer.id, "in", preset === "heading" ? "moveIn" : "fadeIn", {
        duration: 0.6,
        easing: "easeOut",
      }),
    );
    commitProject((current) => addLayers(current, [layer]));
    selectOnly(layer.id);
    setSelectedActionId(layer.animationActions[0]?.id ?? "");
    setSidebarTab("layers");
    setInspectorTab("Design");
  }

  function addShape(shape: ShapeType) {
    const layer = createShapeLayer(getActiveScene(project), shape);
    layer.animationActions.push(
      createAnimationAction(layer.id, "in", "scaleIn", {
        duration: 0.6,
        easing: "backOut",
      }),
    );
    commitProject((current) => addLayers(current, [layer]));
    selectOnly(layer.id);
    setSelectedActionId(layer.animationActions[0]?.id ?? "");
    setSidebarTab("layers");
    setInspectorTab("Design");
  }

  async function importAsset(file?: File) {
    if (!file) return;
    const accepted = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!accepted.includes(file.type)) {
      window.alert("Use PNG, JPG, WebP, or SVG files.");
      return;
    }
    const maximum = file.type === "image/svg+xml" ? 10 : 20;
    if (file.size > maximum * 1024 * 1024) {
      window.alert(`This file is larger than ${maximum} MB.`);
      return;
    }

    let temporaryUrl = "";
    try {
      const blob = file.type === "image/svg+xml"
        ? new Blob([sanitizeSvg(await file.text())], { type: "image/svg+xml" })
        : file;
      temporaryUrl = URL.createObjectURL(blob);
      const dimensions = await readImageDimensions(temporaryUrl);
      URL.revokeObjectURL(temporaryUrl);
      temporaryUrl = "";
      const assetId = createId("asset");
      const stored = await storeAssetBlob(project.id, assetId, blob);
      const asset: ProjectAsset = {
        id: assetId,
        projectId: project.id,
        name: file.name.replace(/\.[^.]+$/, ""),
        type: file.type === "image/svg+xml" ? "svg" : "image",
        mimeType: file.type,
        width: dimensions.width,
        height: dimensions.height,
        sourceUrl: stored.sourceUrl,
        storage: "blob",
        blobId: stored.blobId,
        byteSize: stored.byteSize,
      };
      const layer = createAssetLayer(getActiveScene(project), asset);
      layer.animationActions.push(createAnimationAction(layer.id, "in", "scaleIn", { duration: 0.65, easing: "backOut" }));
      commitProject((current) => {
        const next = cloneProject(current);
        next.assets[asset.id] = asset;
        return addLayers(next, [layer]);
      });
      selectOnly(layer.id);
      setSelectedActionId(layer.animationActions[0]?.id ?? "");
      setSidebarTab("layers");
    } catch {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
      window.alert("The asset could not be imported.");
    }
  }

  function addExistingAsset(assetId: string) {
    const asset = project.assets[assetId];
    if (!asset || asset.type === "font") return;
    const layer = createAssetLayer(scene, asset);
    commitProject((current) => addLayers(current, [layer]));
    selectOnly(layer.id);
    setSidebarTab("layers");
  }

  function deleteLayerById(layerId: string) {
    if (!layerId) return;
    const ids = scene.layerIds.filter((id) => id !== layerId);
    commitProject((current) => removeLayer(current, layerId));
    selectOnly(ids.at(-1) ?? "");
    setSelectedActionId("");
  }

  function deleteSelectedLayer() {
    if (selectedLayerIds.length <= 1) { deleteLayerById(selectedLayerId); return; }
    const ids = [...selectedLayerIds];
    commitProject((current) => ids.reduce((next, id) => removeLayer(next, id), current));
    selectOnly("");
    setSelectedActionId("");
  }

  function duplicateLayerById(layerId: string) {
    if (!layerId) return;
    commitProject((current) => {
      const result = duplicateLayer(current, layerId);
      window.queueMicrotask(() => selectOnly(result.layerId));
      return result.project;
    });
    setSelectedActionId("");
  }

  function duplicateSelectedLayer() {
    duplicateLayerById(selectedLayerId);
  }

  function moveLayerByDrop(draggedId: string, targetId: string) {
    if (!draggedId || !targetId || draggedId === targetId) return;
    commitProject((current) => {
      const currentScene = getActiveScene(current);
      const displayOrder = [...currentScene.layerIds].reverse();
      const fromIndex = displayOrder.indexOf(draggedId);
      const targetIndex = displayOrder.indexOf(targetId);
      if (fromIndex < 0 || targetIndex < 0) return current;
      displayOrder.splice(fromIndex, 1);
      displayOrder.splice(targetIndex, 0, draggedId);
      return setSceneLayerOrder(current, currentScene.id, displayOrder.reverse());
    });
  }

  function renameLayer(layerId: string, name: string) {
    const clean = name.trim();
    if (!clean) return;
    commitLayer(layerId, (layer) => ({ ...layer, name: clean }));
  }

  function addAction(category: AnimationCategory, type: AnimationType) {
    if (!selectedLayer) return;
    const defaultStart = category === "out"
      ? Math.max(0, scene.duration - 0.65)
      : category === "loop"
        ? Math.min(0.8, scene.duration * 0.2)
        : 0;
    const action = createAnimationAction(selectedLayer.id, category, type, {
      startTime: defaultStart,
      duration: category === "loop" ? Math.min(1.5, scene.duration) : 0.65,
    });
    commitLayer(selectedLayer.id, (layer) => ({
      ...layer,
      animationActions: [...layer.animationActions, action],
    }));
    setSelectedActionId(action.id);
    setInspectorTab("Animation");
  }

  function deleteAction(actionId: string) {
    const owner = findActionOwner(project, actionId);
    if (!owner) return;
    commitLayer(owner.id, (layer) => ({
      ...layer,
      animationActions: layer.animationActions.filter((action) => action.id !== actionId),
    }));
    setSelectedActionId("");
  }

  function duplicateAction(actionId: string) {
    const owner = findActionOwner(project, actionId);
    const action = owner?.animationActions.find((candidate) => candidate.id === actionId);
    if (!owner || !action) return;
    const copy: AnimationAction = {
      ...cloneProject(action),
      id: createId("action"),
      startTime: clamp(action.startTime + 0.12, 0, Math.max(0, scene.duration - action.duration)),
    };
    commitLayer(owner.id, (layer) => ({
      ...layer,
      animationActions: [...layer.animationActions, copy],
    }));
    selectOnly(owner.id);
    setSelectedActionId(copy.id);
  }

  function commitTimelineAction(
    layerId: string,
    actionId: string,
    patch: Partial<Pick<AnimationAction, "startTime" | "duration">>,
  ) {
    commitAction(layerId, actionId, (action) => ({ ...action, ...patch }));
  }

  function commitTransform(layerId: string, patch: Partial<Layer>) {
    commitLayer(layerId, (layer) => ({ ...layer, ...patch } as Layer));
  }

  function commitText(layerId: string, text: string) {
    commitLayer(layerId, (layer) => layer.type === "text" ? { ...layer, text } : layer);
  }

  function activateWorkspaceScene(sceneId: string) {
    commitProject((current) => {
      const next = setActiveScene(current, sceneId);
      const active = next.scenes[sceneId];
      window.queueMicrotask(() => {
        playerRef.current?.pause();
        setPlaying(false);
        selectOnly(active?.layerIds.at(-1) ?? "");
        setSelectedActionId("");
      });
      return next;
    });
  }

  function addWorkspaceScene() {
    commitProject((current) => {
      const result = createWorkspaceScene(current);
      window.queueMicrotask(() => {
        playerRef.current?.pause();
        setPlaying(false);
        selectOnly("");
        setSelectedActionId("");
      });
      return result.project;
    });
  }

  function duplicateActiveWorkspaceScene(sceneId: string) {
    commitProject((current) => {
      const result = duplicateWorkspaceScene(current, sceneId);
      window.queueMicrotask(() => {
        playerRef.current?.pause();
        setPlaying(false);
        selectOnly(result.layerIds.at(-1) ?? "");
        setSelectedActionId("");
      });
      return result.project;
    });
  }

  function deleteWorkspaceScene(sceneId: string) {
    const target = project.scenes[sceneId];
    if (!target || Object.keys(project.scenes).length <= 1) return;
    if (!window.confirm(`Delete scene “${target.name}” and all of its layers?`)) return;
    commitProject((current) => {
      const result = removeWorkspaceScene(current, sceneId);
      window.queueMicrotask(() => {
        playerRef.current?.pause();
        setPlaying(false);
        selectOnly(result.layerIds.at(-1) ?? "");
        setSelectedActionId("");
      });
      return result.project;
    });
  }

  function renameWorkspaceSceneById(sceneId: string, name: string) {
    commitProject((current) => renameWorkspaceScene(current, sceneId, name));
  }

  function updateWorkspaceSceneById(sceneId: string, patch: SceneUpdatePatch) {
    commitProject((current) => updateWorkspaceScene(current, sceneId, patch));
  }

  function moveWorkspaceSceneById(sceneId: string, position: SceneWorkspacePosition) {
    commitProject((current) => moveWorkspaceScene(current, sceneId, position));
  }

  function copyLayerIntoWorkspaceScene(layerId: string, sceneId: string) {
    commitProject((current) => {
      const result = copyLayersToScene(current, [layerId], sceneId);
      window.queueMicrotask(() => {
        playerRef.current?.pause();
        setPlaying(false);
        selectOnly(result.layerIds.at(-1) ?? "");
        setSelectedActionId("");
        setSidebarTab("layers");
      });
      return result.project;
    });
  }

  function alignSelection(mode: AlignMode) { commitProject((current) => alignLayers(current, selectedLayerIds, mode)); }
  function distributeSelection(mode: DistributeMode) { commitProject((current) => distributeLayers(current, selectedLayerIds, mode)); }
  function groupSelected() {
    commitProject((current) => {
      const result = groupLayers(current, selectedLayerIds);
      if (result.groupId) window.queueMicrotask(() => selectOnly(result.groupId ?? ""));
      return result.project;
    });
  }
  function ungroupSelected() {
    if (selectedLayer?.type !== "group") return;
    commitProject((current) => {
      const result = ungroupLayer(current, selectedLayer.id);
      window.queueMicrotask(() => {
        setSelectedLayerIds(result.layerIds);
        setPrimaryLayerId(result.layerIds.at(-1) ?? "");
      });
      return result.project;
    });
  }
  function applySelectionGradient(gradient?: GradientFill) { commitProject((current) => setGradient(current, selectedLayerIds, gradient)); }
  function applySelectionMask(type: "vector" | "alpha") {
    if (selectedLayerIds.length !== 2) return;
    const sourceId = selectedLayerIds[0];
    const targetId = selectedLayerIds[1];
    commitProject((current) => applyMask(current, targetId, sourceId, type));
    window.queueMicrotask(() => selectOnly(targetId));
  }
  function clearSelectionMask() { if (selectedLayerId) commitProject((current) => clearMask(current, selectedLayerId)); }
  function toggleSmartSnap() {
    commitProject((current) => touchProject({ ...cloneProject(current), settings: { ...current.settings, snapEnabled: !current.settings.snapEnabled } }));
  }
  async function importFont(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["woff", "woff2", "ttf", "otf"].includes(extension) || file.size > 12 * 1024 * 1024) {
      window.alert("Use a WOFF, WOFF2, TTF, or OTF font up to 12 MB.");
      return;
    }
    try {
      const assetId = createId("asset");
      const stored = await storeAssetBlob(project.id, assetId, file);
      const family = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Custom font";
      const asset: ProjectAsset = { id: assetId, projectId: project.id, name: family, type: "font", mimeType: file.type || `font/${extension}`, sourceUrl: stored.sourceUrl, storage: "blob", blobId: stored.blobId, byteSize: stored.byteSize, fontFamily: family, fontWeight: 400, fontStyle: "normal" };
      commitProject((current) => { const next = cloneProject(current); next.assets[assetId] = asset; return touchProject(next); });
      if (selectedLayers.some((layer) => layer.type === "text")) commitProject((current) => setFontFamily(current, selectedLayerIds, family));
    } catch { window.alert("The font could not be imported."); }
  }

  function togglePlay() {
    if (playing) playerRef.current?.pause();
    else playerRef.current?.play();
  }

  async function saveNow() {
    setSaveStatus("Saving…");
    const current = history.projectRef.current;
    try {
      await saveProject(current);
      await clearDraft(current.id);
      setSaveStatus("Saved");
      return true;
    } catch {
      setSaveStatus("Save failed");
      return false;
    }
  }

  async function leaveEditor() {
    await saveNow();
    onExit(history.projectRef.current);
  }

  async function copyProjectSnapshot() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(project, null, 2));
      setSaveStatus("Copied");
      window.setTimeout(() => setSaveStatus("Saved"), 1200);
    } catch {
      window.alert("Project data could not be copied.");
    }
  }

  async function exportVideo() {
    if (!window.kurogi) {
      setExportNotice({ tone: "error", title: "Desktop export unavailable", message: "Open Kurogi Motion in Electron to render files." });
      return;
    }
    const alphaSupported = exportOptions.format === "webm" || exportOptions.format === "mov" || exportOptions.format === "png-sequence";
    const effectiveOptions: ExportOptions = { ...exportOptions, transparent: alphaSupported && exportOptions.transparent };
    setExportNotice(null);
    setExporting(true);
    setExportProgress({ phase: "preparing", progress: 0, message: "Preparing export" });
    try {
      const snapshot = await prepareProjectForExport(cloneProject(project));
      const snapshotScene = getActiveScene(snapshot);
      snapshotScene.fps = effectiveOptions.fps;
      snapshotScene.background = effectiveOptions.transparent
        ? { type: "transparent" }
        : cloneProject(scene.background.type === "transparent" ? { type: "solid", color: "#000000" } : scene.background);
      const result = await window.kurogi.exportVideo(snapshot, effectiveOptions);
      if (!result.canceled && result.path) {
        setExportProgress({ phase: "completed", progress: 1, message: result.path });
        setExportNotice({ tone: "success", title: "Export complete", message: `${exportOptions.format.toUpperCase()} saved successfully.`, detail: result.path, path: result.path });
        setExportDialogOpen(false);
      } else setExportProgress(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed";
      setExportProgress({ phase: "failed", progress: 0, message });
      setExportNotice({ tone: "error", title: "Export failed", message });
    } finally {
      setExporting(false);
    }
  }

  async function revealExport(targetPath: string) {
    try {
      await window.kurogi?.showItemInFolder(targetPath);
    } catch (error) {
      setExportNotice({
        tone: "error",
        title: "Could not open export folder",
        message: error instanceof Error ? error.message : "The destination is no longer available.",
      });
    }
  }

  return (
    <main className="app editor-app">
      <ExportDialog
        open={exportDialogOpen}
        project={project}
        options={exportOptions}
        exporting={exporting}
        progress={exportProgress}
        onChange={setExportOptions}
        onClose={() => { if (!exporting) { setExportDialogOpen(false); setExportProgress(null); } }}
        onExport={() => void exportVideo()}
      />
      <ExportToast notice={exportNotice} onClose={() => setExportNotice(null)} onReveal={(targetPath) => void revealExport(targetPath)} />
      <input
        ref={assetInputRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={(event) => {
          void importAsset(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <header className="toolbar editor-toolbar">
        <button type="button" className="toolbar-brand-button" onClick={() => void leaveEditor()} title="Back to projects">
          <div className="brand"><span className="brand-mark">K</span><span>kurogi<span className="muted">motion</span></span></div>
        </button>
        <div className="project-name">
          <strong>{project.name}</strong>
          <span className={`save-dot status-${saveStatus.toLowerCase().replace(/\W/g, "-")}`}>● {saveStatus}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="icon-btn" disabled={!history.canUndo} onClick={history.undo} title="Undo"><Icon name="undo" size={16} /></button>
          <button type="button" className="icon-btn" disabled={!history.canRedo} onClick={history.redo} title="Redo"><Icon name="redo" size={16} /></button>
          <span className="toolbar-divider" />
          <button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.max(25, value - 10))} title="Zoom out"><Icon name="minus" size={15} /></button>
          <span className="zoom">{zoom}%</span>
          <button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.min(150, value + 10))} title="Zoom in"><Icon name="plus" size={15} /></button>
          <button type="button" className={showSafeArea ? "icon-btn active" : "icon-btn"} onClick={() => setShowSafeArea((value) => !value)} title="Toggle safe area"><Icon name="frame" size={16} /></button>
          <button type="button" className="preview" onClick={togglePlay}>{playing ? <><Icon name="pause" size={15} />Pause</> : <><Icon name="play" size={15} />Preview</>}</button>
          <button type="button" className="share-button" onClick={() => void copyProjectSnapshot()}><Icon name="share" size={15} />Share</button>
          <button type="button" className="export" onClick={() => { setExportProgress(null); setExportDialogOpen(true); }}>Export <Icon name="export" size={15} /></button>
        </div>
      </header>

      <section className="workspace editor-workspace">
        <aside className="rail">
          {SIDEBAR_TABS.map((item) => (
            <button type="button" key={item.id} className={sidebarTab === item.id ? "rail-active" : ""} onClick={() => setSidebarTab(item.id)}>
              <b><Icon name={item.icon} size={18} /></b><span>{item.label}</span>
            </button>
          ))}
          <div className="rail-bottom"><button type="button"><b><Icon name="help" size={18} /></b><span>Help</span></button><div className="avatar">KM</div></div>
        </aside>

        <aside className="sidebar editor-sidebar">
          <div className="panel-title"><span>{SIDEBAR_TABS.find((item) => item.id === sidebarTab)?.label}</span>{sidebarTab === "assets" ? <button type="button" onClick={() => assetInputRef.current?.click()} aria-label="Import asset"><Icon name="plus" size={16} /></button> : null}</div>
          {sidebarTab === "layers" ? (
            <div className="sidebar-scroll">
              <div className="scene-row"><span>⌄</span><b>{scene.name}</b><small>{scene.width} × {scene.height}</small></div>
              <div className="layer-list">
                {[...layers].reverse().map((layer) => (
                  <div
                    key={layer.id}
                    draggable
                    className={`layer-row ${selectedLayerIds.includes(layer.id) ? "selected" : ""} ${layer.maskSource ? "is-mask-source" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}
                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}
                    onDragStart={(event) => { setDraggedLayerId(layer.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", layer.id); }}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverLayerId(layer.id); }}
                    onDragLeave={() => setDragOverLayerId((current) => current === layer.id ? "" : current)}
                    onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain") || draggedLayerId; moveLayerByDrop(sourceId, layer.id); setDraggedLayerId(""); setDragOverLayerId(""); }}
                    onDragEnd={() => { setDraggedLayerId(""); setDragOverLayerId(""); }}
                  >
                    <span className="layer-drag-grip" title="Drag to reorder"><Icon name="grip" size={15} /></span>
                    <span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span>
                    <input
                      className="layer-name-editor"
                      value={layer.name}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={() => {
                        selectLayer(layer.id);
                        history.beginGesture();
                      }}
                      onChange={(event) => history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: event.currentTarget.value })))}
                      onBlur={(event) => {
                        const cleanName = event.currentTarget.value.trim();
                        if (!cleanName) {
                          history.cancelGesture();
                          return;
                        }
                        if (cleanName !== event.currentTarget.value) {
                          history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: cleanName })));
                        }
                        history.finishGesture();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          event.preventDefault();
                          history.cancelGesture();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <button type="button" className="layer-state" onClick={(event) => { event.stopPropagation(); commitLayer(layer.id, (candidate) => ({ ...candidate, visible: !candidate.visible })); }} title={layer.visible ? "Hide" : "Show"}>{layer.visible ? <Icon name="eye" size={14} /> : <Icon name="eyeOff" size={14} />}</button>
                    <button type="button" className="layer-state" onClick={(event) => { event.stopPropagation(); commitLayer(layer.id, (candidate) => ({ ...candidate, locked: !candidate.locked })); }} title={layer.locked ? "Unlock" : "Lock"}>{layer.locked ? <Icon name="lock" size={13} /> : <Icon name="unlock" size={13} />}</button>
                  </div>
                ))}
              </div>
              {selectedLayer ? (
                <div className="sidebar-selection-actions">
                  <button type="button" onClick={duplicateSelectedLayer}>Duplicate</button>
                  <button type="button" className="danger-text" onClick={deleteSelectedLayer}>Delete</button>
                </div>
              ) : null}
            </div>
          ) : null}
          {sidebarTab === "text" ? (
            <div className="add-grid text-presets">
              <button type="button" onClick={() => addText("heading")}><strong>H</strong><span>Heading</span></button>
              <button type="button" onClick={() => addText("subheading")}><strong>Aa</strong><span>Subheading</span></button>
              <button type="button" onClick={() => addText("body")}><strong>¶</strong><span>Body text</span></button>
            </div>
          ) : null}
          {sidebarTab === "shapes" ? (
            <div className="shape-library sidebar-scroll">
              {(["Basic", "Geometric", "Symbols", "Decorative"] as ShapeGroup[]).map((group) => (
                <section className="shape-library-section" key={group}>
                  <div className="shape-library-heading"><span>{group}</span><small>{SHAPE_DEFINITIONS.filter((shape) => shape.group === group).length}</small></div>
                  <div className="add-grid shape-presets shape-presets-expanded">
                    {SHAPE_DEFINITIONS.filter((shape) => shape.group === group).map((definition) => (
                      <button type="button" key={definition.type} onClick={() => addShape(definition.type)} title={`Add ${definition.label}`}>
                        <strong><ShapeIcon shape={definition.type} size={28} /></strong>
                        <span>{definition.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
          {sidebarTab === "assets" ? (
            <div className="assets-panel sidebar-scroll">
              <button type="button" className="asset-dropzone" onClick={() => assetInputRef.current?.click()}><span><Icon name="upload" size={24} /></span><strong>Import an asset</strong><small>PNG, JPG, WebP, or sanitized SVG</small></button>
              <div className="asset-grid">
                {Object.values(project.assets).map((asset) => asset.type === "font" ? (
                  <button type="button" className="font-asset-card" key={asset.id} onClick={() => selectedLayers.some((layer) => layer.type === "text") && commitProject((current) => setFontFamily(current, selectedLayerIds, asset.fontFamily ?? asset.name))}><strong>Aa</strong><span>{asset.fontFamily ?? asset.name}</span></button>
                ) : (
                  <button type="button" key={asset.id} onClick={() => addExistingAsset(asset.id)}><img src={asset.thumbnailUrl ?? asset.sourceUrl} alt="" /><span>{asset.name}</span></button>
                ))}
              </div>
            </div>
          ) : null}
          {sidebarTab === "templates" ? (
            <div className="template-sidebar sidebar-scroll">
              <div className="template-card"><div className="mini-canvas">MOVE</div><b>Editable templates</b><span>Create templates from the project dashboard to preserve your current work.</span></div>
            </div>
          ) : null}
        </aside>

        <DesignToolsPanel
          project={project}
          selectedLayers={selectedLayers}
          onAlign={alignSelection}
          onDistribute={distributeSelection}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
          onGradient={applySelectionGradient}
          onBlendMode={(mode) => commitProject((current) => setBlendMode(current, selectedLayerIds, mode))}
          onBackgroundBlur={(radius) => commitProject((current) => setBackgroundBlur(current, selectedLayerIds, radius))}
          onApplyMask={applySelectionMask}
          onClearMask={clearSelectionMask}
          onFontFamily={(family) => commitProject((current) => setFontFamily(current, selectedLayerIds, family))}
          onImportFont={(file) => void importFont(file)}
          onToggleSnap={toggleSmartSnap}
        />

        <MultiSceneCanvasStage
          project={project}
          playerRef={playerRef}
          selectedLayerId={selectedLayerId}
          selectedLayerIds={selectedLayerIds}
          zoom={zoom}
          playing={playing}
          showSafeArea={showSafeArea}
          onSelect={selectLayer}
          onTransformCommit={commitTransform}
          onTextCommit={commitText}
          onZoomChange={setZoom}
          onDuplicateLayer={duplicateLayerById}
          onDeleteLayer={deleteLayerById}
          onActivateScene={activateWorkspaceScene}
          onCreateScene={addWorkspaceScene}
          onDuplicateScene={duplicateActiveWorkspaceScene}
          onDeleteScene={deleteWorkspaceScene}
          onRenameScene={renameWorkspaceSceneById}
          onUpdateScene={updateWorkspaceSceneById}
          onMoveScene={moveWorkspaceSceneById}
          onCopyLayerToScene={copyLayerIntoWorkspaceScene}
        />

        <Inspector
          project={project}
          selectedLayer={selectedLayer}
          selectedAction={selectedAction}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onBeginPropertyEdit={history.beginGesture}
          onFinishPropertyEdit={history.finishGesture}
          onCancelPropertyEdit={history.cancelGesture}
          onPreviewLayer={previewLayer}
          onCommitLayer={commitLayer}
          onPreviewAction={previewAction}
          onCommitAction={commitAction}
          onAddAction={addAction}
          onSelectAction={setSelectedActionId}
          onDeleteAction={deleteAction}
          onDuplicateAction={duplicateAction}
          exportOptions={exportOptions}
          onExportOptionsChange={setExportOptions}
          exporting={exporting}
          exportProgress={exportProgress}
          onExport={() => void exportVideo()}
        />
      </section>

      <Timeline
        project={project}
        playerRef={playerRef}
        selectedLayerId={selectedLayerId}
        selectedActionId={selectedActionId}
        onSelectLayer={selectLayer}
        onSelectAction={selectAction}
        onCommitAction={commitTimelineAction}
        onDeleteAction={deleteAction}
        onDuplicateAction={duplicateAction}
      />
    </main>
  );
}

function findActionOwner(project: KurogiProject, actionId: string) {
  return Object.values(project.layers).find((layer) =>
    layer.animationActions.some((action) => action.id === actionId),
  );
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(sourceUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 600, height: image.naturalHeight || 400 });
    image.onerror = () => reject(new Error("Asset dimensions could not be read."));
    image.src = sourceUrl;
  });
}

function sanitizeSvg(source: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("Invalid SVG file.");
  document.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || value.startsWith("javascript:")) node.removeAttribute(attribute.name);
      if ((name === "href" || name.endsWith(":href")) && /^(https?:|file:)/.test(value)) node.removeAttribute(attribute.name);
    }
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
