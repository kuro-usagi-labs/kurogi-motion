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
import { clearDraft, listProjectSummaries, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";
import { createAudioClip, duplicateAudioClip, removeAudioClip, updateAudioClip } from "../core/audio";
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
  canCreateClippingMask,
  clearMask,
  createClippingMask,
  distributeLayers,
  groupLayers,
  releaseClippingMask,
  setBackgroundBlur,
  setBlendMode,
  setFontFamily,
  setGradient,
  ungroupLayer,
  type AlignMode,
  type DistributeMode,
} from "../core/designTools";
import {
  applyCustomAnimationPreset,
  copyAnimationActions,
  createAnimationGroup,
  deleteAnimationActions,
  deleteCustomAnimationPreset,
  duplicateAnimationActions,
  expandActionSelection,
  pasteAnimationActions,
  refsFromActionIds,
  saveCustomAnimationPreset,
  staggerAnimationActions,
  ungroupAnimationActions,
  updateAnimationActions,
} from "../core/animationWorkflow";
import { useProjectHistory } from "../core/useProjectHistory";
import { Inspector, type InspectorTab } from "../editor/InspectorV2";
import { MultiSceneCanvasStage, type WorkspaceCommand } from "../editor/MultiSceneCanvasStage";
import { DesignToolsPanel } from "../editor/DesignToolsPanel";
import { EditorMenuBar } from "../editor/EditorMenuBar";
import { McpIntegrationDialog } from "../editor/McpIntegrationDialog";
import { LayerContextMenu, type LayerContextMenuState } from "../editor/LayerContextMenu";
import { describeMcpMutation, executeMcpProjectCommand, isMcpMutationMethod, type McpBridgeRequest } from "../core/mcpCommands";
import { loadEditorUiPreferences, saveEditorUiPreferences, type EditorUiPreferences } from "../core/editorUiPreferences";
import { Icon, type IconName } from "../ui/Icon";
import { ShapeIcon } from "../ui/ShapeIcon";
import { SHAPE_DEFINITIONS, type ShapeGroup } from "../core/shapeLibrary";
import { Timeline, type TimelineActionPatch } from "../editor/TimelineV3";
import { ExportDialog, ExportToast, type ExportNotice } from "../editor/ExportDialog";
import type {
  AnimationAction,
  AnimationCategory,
  AudioClip,
  AnimationClipboard,
  AnimationType,
  ExportOptions,
  ExportProgress,
  GradientFill,
  KurogiProject,
  Layer,
  MotionPathDefinition,
  ProjectAsset,
  ShapeType,
  StaggerOrder,
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
  const [selectedActionId, setPrimaryActionId] = useState("");
  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
  const [selectedAudioClipId, setSelectedAudioClipId] = useState("");
  const [animationClipboard, setAnimationClipboard] = useState<AnimationClipboard | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("layers");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("Design");
  const [zoom, setZoom] = useState(64);
  const [playing, setPlaying] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [uiPreferences, setUiPreferences] = useState<EditorUiPreferences>(() => loadEditorUiPreferences());
  const [workspaceCommand, setWorkspaceCommand] = useState<WorkspaceCommand | null>(null);
  const [draggedLayerId, setDraggedLayerId] = useState("");
  const [dragOverLayerId, setDragOverLayerId] = useState("");
  const [saveStatus, setSaveStatus] = useState<"Saving draft…" | "Draft saved" | "Saving…" | "Saved" | "Save failed" | "Copied">("Saved");
  const [exporting, setExporting] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [layerContextMenu, setLayerContextMenu] = useState<LayerContextMenuState | null>(null);
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
  const clippingSourceIds = useMemo(() => new Set(Object.values(project.layers).filter((layer) => layer.mask?.clipping).map((layer) => layer.mask!.sourceLayerId)), [project.layers]);
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
      setOnlyAction("");
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
      if (!editable && modifier && event.key.toLowerCase() === "n") { event.preventDefault(); void leaveEditor(); }
      if (!editable && modifier && event.key.toLowerCase() === "o") { event.preventDefault(); void leaveEditor(); }
      if (!editable && modifier && event.key.toLowerCase() === "e") { event.preventDefault(); setExportProgress(null); setExportDialogOpen(true); }
      if (!editable && modifier && event.key.toLowerCase() === "a") { event.preventDefault(); selectAllLayers(); }
      if (!editable && event.key === "Escape") { deselectAllLayers(); }
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
        if (selectedActionIds.length) duplicateActions(selectedActionIds);
        else duplicateSelectedLayer();
      }
      if (!editable && modifier && event.key.toLowerCase() === "c" && selectedActionIds.length) { event.preventDefault(); copySelectedActions(selectedActionIds); }
      if (!editable && modifier && event.key.toLowerCase() === "v" && animationClipboard && selectedLayerIds.length) { event.preventDefault(); pasteSelectedActions(); }
      if (!editable && modifier && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (event.shiftKey) ungroupSelected();
        else groupSelected();
      }
      if (!editable && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        if (selectedActionIds.length) deleteActions(selectedActionIds);
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

  useEffect(() => {
    saveEditorUiPreferences(uiPreferences);
  }, [uiPreferences]);

  useEffect(() => {
    const unsubscribe = window.kurogi?.onMcpRequest?.((request) => { void handleMcpRequest(request); });
    return () => unsubscribe?.();
  });

  async function handleMcpRequest(request: McpBridgeRequest) {
    const respond = window.kurogi?.respondMcpRequest;
    if (!respond) return;
    try {
      if (request.method === "library.list_projects") {
        respond({ id: request.id, ok: true, result: { projects: await listProjectSummaries() } });
        return;
      }
      if (request.method === "asset.import_file") {
        const params = request.params ?? {};
        const filePath = String(params.path ?? "");
        if (!filePath) throw new Error("path is required.");
        const allowed = window.confirm("An MCP client wants to import media from:\n" + filePath + "\n\nAllow this file to be read and added to the project?");
        if (!allowed) throw new Error("The user denied the MCP media import.");
        const payload = await window.kurogi?.readMcpMediaFile(filePath);
        if (!payload) throw new Error("Desktop media import is unavailable.");
        const mediaBytes = new Uint8Array(payload.bytes);
        const file = new File([mediaBytes.buffer as ArrayBuffer], payload.name, { type: payload.mimeType });
        const imported = await importAsset(file, { sceneId: typeof params.sceneId === "string" ? params.sceneId : undefined, addToTimeline: params.addToTimeline !== false });
        respond({ id: request.id, ok: true, result: imported });
        return;
      }
      if (request.method === "project.save") {
        const current = history.projectRef.current;
        await saveProject(current);
        await clearDraft(current.id);
        setSaveStatus("Saved");
        respond({ id: request.id, ok: true, result: { saved: true, projectId: current.id, updatedAt: current.updatedAt } });
        return;
      }
      if (request.method === "project.export") {
        if (!window.kurogi) throw new Error("Desktop export is unavailable.");
        const params = request.params ?? {};
        const format = ["mp4", "webm", "mov", "gif", "png-sequence"].includes(String(params.format)) ? String(params.format) as ExportOptions["format"] : "mp4";
        const requestedFps = Number(params.fps);
        const options: ExportOptions = {
          format,
          fps: ([24, 30, 60].includes(requestedFps) ? requestedFps : scene.fps) as 24 | 30 | 60,
          scale: Math.min(2, Math.max(.1, Number(params.scale) || 1)),
          quality: (["low", "medium", "high"].includes(String(params.quality)) ? String(params.quality) : "high") as ExportOptions["quality"],
          transparent: Boolean(params.transparent),
          gifLoops: null,
        };
        const snapshot = await prepareProjectForExport(cloneProject(history.projectRef.current));
        const outputPath = typeof params.outputPath === "string" && params.outputPath.trim() ? params.outputPath.trim() : undefined;
        if (outputPath && !window.confirm(`An MCP client wants to export the active project to:\n${outputPath}\n\nAllow this export?`)) throw new Error("The user denied the MCP export.");
        const result = await window.kurogi.exportVideo(snapshot, { ...options, outputPath });
        respond({ id: request.id, ok: true, result: result.canceled ? { canceled: true } : { exported: true, path: result.path } });
        return;
      }
      const params = request.params ?? {};
      if (isMcpMutationMethod(request.method)) {
        const allowed = window.confirm(`An MCP client wants to ${describeMcpMutation(request.method, params)}.\n\nAllow this project change?`);
        if (!allowed) throw new Error("The user denied the MCP project change.");
      }
      const outcome = executeMcpProjectCommand(history.projectRef.current, request.method, params);
      if (outcome.changed) {
        history.commit(() => outcome.project);
        window.queueMicrotask(() => {
          if (outcome.selectedAudioClipId) selectAudioClip(outcome.selectedAudioClipId);
          else if (outcome.selectedLayerId) selectOnly(outcome.selectedLayerId);
          else if (outcome.activeSceneId) selectOnly(outcome.project.scenes[outcome.activeSceneId]?.layerIds.at(-1) ?? "");
          setOnlyAction("");
        });
      }
      respond({ id: request.id, ok: true, result: outcome.result });
    } catch (error) {
      respond({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  function setOnlyAction(actionId: string) { setPrimaryActionId(actionId); setSelectedActionIds(actionId ? [actionId] : []); }

  function selectOnly(layerId: string) {
    setSelectedAudioClipId("");
    setPrimaryLayerId(layerId);
    setSelectedLayerIds(layerId ? [layerId] : []);
  }

  function selectAudioClip(clipId: string) {
    setPrimaryLayerId("");
    setSelectedLayerIds([]);
    setOnlyAction("");
    setSelectedAudioClipId(clipId);
  }

  function updateAudioClipById(clipId: string, patch: Partial<AudioClip>) { commitProject((current) => updateAudioClip(current, clipId, patch)); }
  function deleteAudioClipById(clipId: string) { commitProject((current) => removeAudioClip(current, clipId)); setSelectedAudioClipId((current) => current === clipId ? "" : current); }
  function duplicateAudioClipById(clipId: string) {
    commitProject((current) => { const result = duplicateAudioClip(current, clipId); window.queueMicrotask(() => selectAudioClip(result.clipId)); return result.project; });
  }

  function selectLayer(layerId: string, additive = false) {
    if (!layerId) {
      selectOnly("");
      setOnlyAction("");
      return;
    }
    if (additive) {
      setSelectedLayerIds((current) => {
        const next = current.includes(layerId) ? current.filter((id) => id !== layerId) : [...current, layerId];
        setPrimaryLayerId(next.at(-1) ?? "");
        return next;
      });
    } else selectOnly(layerId);
    if (project.layers[layerId]?.animationActions.every((action) => action.id !== selectedActionId)) setOnlyAction("");
  }

  function selectAction(layerId: string, actionId: string, additive = false) {
    const expanded = expandActionSelection(project, [{ layerId, actionId }]);
    const ids = expanded.map((ref) => ref.actionId);
    const ownerIds = [...new Set(expanded.map((ref) => ref.layerId))];
    if (additive) {
      setSelectedActionIds((current) => {
        const allSelected = ids.every((id) => current.includes(id));
        const next = allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])];
        setPrimaryActionId(next.at(-1) ?? "");
        return next;
      });
      setSelectedLayerIds((current) => [...new Set([...current, ...ownerIds])]);
      setPrimaryLayerId(layerId);
    } else {
      setSelectedActionIds(ids);
      setPrimaryActionId(ids.at(-1) ?? actionId);
      setSelectedLayerIds(ownerIds.length ? ownerIds : [layerId]);
      setPrimaryLayerId(layerId);
    }
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
    setOnlyAction(layer.animationActions[0]?.id ?? "");
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
    setOnlyAction(layer.animationActions[0]?.id ?? "");
    setSidebarTab("layers");
    setInspectorTab("Design");
  }

  async function importAsset(file?: File, options: { sceneId?: string; addToTimeline?: boolean } = {}) {
    if (!file) return { imported: false };
    const mimeType = normalizeMediaMime(file.name, file.type);
    const accepted = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "audio/mpeg", "audio/wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm"];
    if (!accepted.includes(mimeType)) {
      window.alert("Use PNG, JPG, WebP, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio files.");
      return { imported: false };
    }
    const isAudio = mimeType.startsWith("audio/");
    const maximum = isAudio ? 120 : mimeType === "image/svg+xml" ? 10 : 20;
    if (file.size > maximum * 1024 * 1024) { window.alert("This file is larger than " + maximum + " MB."); return { imported: false }; }

    let temporaryUrl = "";
    try {
      const blob = mimeType === "image/svg+xml" ? new Blob([sanitizeSvg(await file.text())], { type: mimeType }) : new Blob([file], { type: mimeType });
      temporaryUrl = URL.createObjectURL(blob);
      const audioDuration = isAudio ? await readAudioDuration(temporaryUrl) : undefined;
      const imageDimensions = isAudio ? undefined : await readImageDimensions(temporaryUrl);
      URL.revokeObjectURL(temporaryUrl); temporaryUrl = "";
      const current = cloneProject(history.projectRef.current);
      const targetSceneId = options.sceneId && current.scenes[options.sceneId] ? options.sceneId : current.activeSceneId;
      const assetId = createId("asset");
      const stored = await storeAssetBlob(current.id, assetId, blob);
      const asset: ProjectAsset = {
        id: assetId, projectId: current.id, name: file.name.replace(/\.[^.]+$/, ""),
        type: isAudio ? "audio" : mimeType === "image/svg+xml" ? "svg" : "image", mimeType,
        ...(isAudio ? { duration: audioDuration } : { width: imageDimensions!.width, height: imageDimensions!.height }),
        sourceUrl: stored.sourceUrl, storage: "blob", blobId: stored.blobId, byteSize: stored.byteSize,
      };
      current.assets[asset.id] = asset;
      if (isAudio) {
        if (options.addToTimeline === false) { history.commit(() => touchProject(current)); setSidebarTab("assets"); return { imported: true, assetId }; }
        const result = createAudioClip(current, targetSceneId, assetId);
        history.commit(() => result.project);
        window.queueMicrotask(() => selectAudioClip(result.clipId));
        setSidebarTab("assets");
        return { imported: true, assetId, audioClipId: result.clipId, sceneId: targetSceneId };
      }
      const layer = createAssetLayer(current.scenes[targetSceneId], asset);
      layer.animationActions.push(createAnimationAction(layer.id, "in", "scaleIn", { duration: .65, easing: "backOut" }));
      const next = addLayers(current, [layer]);
      history.commit(() => next);
      window.queueMicrotask(() => selectOnly(layer.id));
      setSidebarTab("layers");
      return { imported: true, assetId, layerId: layer.id, sceneId: targetSceneId };
    } catch (error) {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
      window.alert(error instanceof Error ? error.message : "The asset could not be imported.");
      return { imported: false };
    }
  }

  function addExistingAsset(assetId: string) {
    const asset = project.assets[assetId];
    if (!asset || asset.type === "font") return;
    if (asset.type === "audio") {
      commitProject((current) => { const result = createAudioClip(current, scene.id, asset.id); window.queueMicrotask(() => selectAudioClip(result.clipId)); return result.project; });
      return;
    }
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
    setOnlyAction("");
  }

  function deleteSelectedLayer() {
    if (selectedLayerIds.length <= 1) { deleteLayerById(selectedLayerId); return; }
    const ids = [...selectedLayerIds];
    commitProject((current) => ids.reduce((next, id) => removeLayer(next, id), current));
    selectOnly("");
    setOnlyAction("");
  }

  function duplicateLayerById(layerId: string) {
    if (!layerId) return;
    commitProject((current) => {
      const result = duplicateLayer(current, layerId);
      window.queueMicrotask(() => selectOnly(result.layerId));
      return result.project;
    });
    setOnlyAction("");
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
      duration: type === "counter" ? 1.2 : type === "motionPath" ? 1.4 : category === "loop" ? Math.min(1.5, scene.duration) : 0.65,
      motionPath: type === "motionPath" ? { enabled: true, start: { x: 0, y: 0 }, control1: { x: 100, y: -120 }, control2: { x: 220, y: 120 }, end: { x: 320, y: 0 }, orientToPath: false } : undefined,
    });
    commitLayer(selectedLayer.id, (layer) => ({
      ...layer,
      animationActions: [...layer.animationActions, action],
    }));
    setOnlyAction(action.id);
    setInspectorTab("Animation");
  }

  function deleteActions(actionIds: string[]) {
    const refs = refsFromActionIds(project, actionIds);
    commitProject((current) => deleteAnimationActions(current, refs));
    setOnlyAction("");
  }

  function deleteAction(actionId: string) {
    const owner = findActionOwner(project, actionId);
    if (!owner) return;
    commitLayer(owner.id, (layer) => ({
      ...layer,
      animationActions: layer.animationActions.filter((action) => action.id !== actionId),
    }));
    setOnlyAction("");
  }

  function duplicateActions(actionIds: string[]) {
    const refs = refsFromActionIds(project, actionIds);
    commitProject((current) => {
      const result = duplicateAnimationActions(current, refs);
      window.queueMicrotask(() => { setSelectedActionIds(result.refs.map((ref) => ref.actionId)); setPrimaryActionId(result.refs.at(-1)?.actionId ?? ""); });
      return result.project;
    });
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
    setOnlyAction(copy.id);
  }

  function commitTimelineActions(patches: TimelineActionPatch[]) { commitProject((current) => updateAnimationActions(current, patches)); }

  function copySelectedActions(actionIds = selectedActionIds) {
    const clipboard = copyAnimationActions(project, refsFromActionIds(project, actionIds));
    if (clipboard) setAnimationClipboard(clipboard);
  }

  function pasteSelectedActions() {
    if (!animationClipboard || !selectedLayerIds.length) return;
    const start = (playerRef.current?.getCurrentFrame() ?? 0) / scene.fps;
    commitProject((current) => {
      const result = pasteAnimationActions(current, selectedLayerIds, animationClipboard, start);
      window.queueMicrotask(() => { setSelectedActionIds(result.refs.map((ref) => ref.actionId)); setPrimaryActionId(result.refs.at(-1)?.actionId ?? ""); setInspectorTab("Animation"); });
      return result.project;
    });
  }

  function staggerSelectedActions(step: number, order: StaggerOrder) { commitProject((current) => staggerAnimationActions(current, refsFromActionIds(current, selectedActionIds), step, order)); }
  function groupSelectedActions() {
    const name = window.prompt("Animation group name", "Animation group") ?? "";
    if (!name.trim()) return;
    commitProject((current) => createAnimationGroup(current, refsFromActionIds(current, selectedActionIds), name).project);
  }
  function ungroupSelectedActions() { commitProject((current) => ungroupAnimationActions(current, refsFromActionIds(current, selectedActionIds))); }
  function saveSelectedAnimationPreset() {
    if (!selectedActionIds.length) return;
    const name = window.prompt("Preset name", "Custom motion") ?? "";
    if (!name.trim()) return;
    commitProject((current) => saveCustomAnimationPreset(current, name, refsFromActionIds(current, selectedActionIds)).project);
  }
  function applyAnimationPreset(presetId: string) {
    if (!selectedLayerIds.length) return;
    const start = (playerRef.current?.getCurrentFrame() ?? 0) / scene.fps;
    commitProject((current) => {
      const result = applyCustomAnimationPreset(current, presetId, selectedLayerIds, start);
      window.queueMicrotask(() => { setSelectedActionIds(result.refs.map((ref) => ref.actionId)); setPrimaryActionId(result.refs.at(-1)?.actionId ?? ""); });
      return result.project;
    });
  }
  function removeAnimationPreset(presetId: string) { commitProject((current) => deleteCustomAnimationPreset(current, presetId)); }
  function commitMotionPath(layerId: string, actionId: string, motionPath: MotionPathDefinition) { commitAction(layerId, actionId, (action) => ({ ...action, motionPath })); }

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
        setOnlyAction("");
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
        setOnlyAction("");
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
        setOnlyAction("");
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
        setOnlyAction("");
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
        setOnlyAction("");
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
  function createLayerClippingMask(layerId: string) {
    if (!canCreateClippingMask(project, layerId)) return;
    commitProject((current) => createClippingMask(current, layerId).project);
    selectOnly(layerId);
  }
  function releaseLayerClippingMask(layerId: string) {
    commitProject((current) => releaseClippingMask(current, layerId));
    selectOnly(layerId);
  }
  function openLayerContextMenu(layerId: string, clientX: number, clientY: number) {
    selectOnly(layerId);
    setLayerContextMenu({ layerId, x: clientX, y: clientY });
  }
  function toggleSmartSnap() {
    commitProject((current) => touchProject({ ...cloneProject(current), settings: { ...current.settings, snapEnabled: !current.settings.snapEnabled } }));
  }
  function toggleDesignToolbar() {
    setUiPreferences((current) => ({ ...current, showDesignToolbar: !current.showDesignToolbar }));
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

  function issueWorkspaceCommand(type: WorkspaceCommand["type"]) {
    setWorkspaceCommand((current) => ({ type, nonce: (current?.nonce ?? 0) + 1 }));
  }

  function selectAllLayers() {
    setSelectedLayerIds([...scene.layerIds]);
    setPrimaryLayerId(scene.layerIds.at(-1) ?? "");
    setOnlyAction("");
  }

  function deselectAllLayers() {
    selectOnly("");
    setOnlyAction("");
  }

  function bringLayerForwardById(layerId: string) { if (layerId) commitProject((current) => reorderLayer(current, layerId, "up")); }
  function sendLayerBackwardById(layerId: string) { if (layerId) commitProject((current) => reorderLayer(current, layerId, "down")); }
  function bringSelectedForward() { bringLayerForwardById(selectedLayerId); }
  function sendSelectedBackward() { sendLayerBackwardById(selectedLayerId); }

  function toggleLayerVisibilityById(layerId: string) { if (layerId) commitLayer(layerId, (layer) => ({ ...layer, visible: !layer.visible })); }
  function toggleLayerLockById(layerId: string) { if (layerId) commitLayer(layerId, (layer) => ({ ...layer, locked: !layer.locked })); }

  function toggleSelectedVisibility() {
    if (!selectedLayerIds.length) return;
    commitProject((current) => selectedLayerIds.reduce((next, id) => updateLayer(next, id, (layer) => ({ ...layer, visible: !layer.visible })), current));
  }

  function toggleSelectedLock() {
    if (!selectedLayerIds.length) return;
    commitProject((current) => selectedLayerIds.reduce((next, id) => updateLayer(next, id, (layer) => ({ ...layer, locked: !layer.locked })), current));
  }

  function openAnimationCategory(category: AnimationCategory) {
    setInspectorTab("Animation");
    const action = selectedLayer?.animationActions.find((candidate) => candidate.category === category);
    setOnlyAction(action?.id ?? "");
  }

  function staggerFromMenu() {
    if (!selectedActionIds.length) return;
    const value = window.prompt("Stagger interval in seconds", "0.08");
    if (value === null) return;
    const step = Number(value);
    if (!Number.isFinite(step) || step < 0) { window.alert("Enter a valid stagger interval."); return; }
    staggerSelectedActions(step, "normal");
  }

  function showKeyboardShortcuts() {
    window.alert("Space: Play/Pause\nCtrl+S: Save\nCtrl+Z: Undo\nCtrl+Shift+Z: Redo\nCtrl+D: Duplicate\nCtrl+G: Group\nCtrl+Shift+G: Ungroup\nDelete: Remove selection");
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
      <McpIntegrationDialog open={mcpDialogOpen} onClose={() => setMcpDialogOpen(false)} />
      <LayerContextMenu
        project={project}
        state={layerContextMenu}
        onClose={() => setLayerContextMenu(null)}
        onCreateClippingMask={createLayerClippingMask}
        onReleaseClippingMask={releaseLayerClippingMask}
        onDuplicate={duplicateLayerById}
        onDelete={deleteLayerById}
        onBringForward={bringLayerForwardById}
        onSendBackward={sendLayerBackwardById}
        onToggleVisibility={toggleLayerVisibilityById}
        onToggleLock={toggleLayerLockById}
        onSetImageFit={(layerId, fit) => commitLayer(layerId, (layer) => layer.type === "image" ? { ...layer, fit } : layer)}
      />
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
        accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.oga"
        onChange={(event) => {
          void importAsset(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <header className="toolbar editor-toolbar editor-command-toolbar">
        <button type="button" className="toolbar-brand-button" onClick={() => void leaveEditor()} title="Back to projects">
          <div className="brand"><span className="brand-mark">K</span><span>kurogi<span className="muted">motion</span></span></div>
        </button>
        <EditorMenuBar
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          canDuplicate={Boolean(selectedLayerId)}
          canDelete={Boolean(selectedLayerId || selectedActionIds.length)}
          canGroup={selectedLayerIds.length >= 2}
          canDistribute={selectedLayerIds.length >= 3}
          canUngroup={selectedLayer?.type === "group"}
          canDeleteScene={Object.keys(project.scenes).length > 1}
          canCopyAnimation={selectedActionIds.length > 0}
          canPasteAnimation={Boolean(animationClipboard && selectedLayerIds.length)}
          canGroupAnimation={selectedActionIds.length >= 2}
          safeAreaEnabled={showSafeArea}
          snapEnabled={project.settings.snapEnabled}
          designToolbarVisible={uiPreferences.showDesignToolbar}
          onNewProject={() => void leaveEditor()}
          onOpenProject={() => void leaveEditor()}
          onSave={() => void saveNow()}
          onImportAsset={() => assetInputRef.current?.click()}
          onCopyProject={() => void copyProjectSnapshot()}
          onExport={() => { setExportProgress(null); setExportDialogOpen(true); }}
          onUndo={history.undo}
          onRedo={history.redo}
          onDuplicate={() => selectedActionIds.length ? duplicateActions(selectedActionIds) : duplicateSelectedLayer()}
          onDelete={() => selectedActionIds.length ? deleteActions(selectedActionIds) : deleteSelectedLayer()}
          onSelectAll={selectAllLayers}
          onDeselectAll={deselectAllLayers}
          onAlign={alignSelection}
          onDistribute={distributeSelection}
          onZoomIn={() => setZoom((value) => Math.min(250, value + 10))}
          onZoomOut={() => setZoom((value) => Math.max(5, value - 10))}
          onResetZoom={() => setZoom(100)}
          onFitAll={() => issueWorkspaceCommand("fit-all")}
          onFocusScene={() => issueWorkspaceCommand("focus-scene")}
          onToggleSafeArea={() => setShowSafeArea((value) => !value)}
          onToggleSnap={toggleSmartSnap}
          onToggleDesignToolbar={toggleDesignToolbar}
          onCreateScene={addWorkspaceScene}
          onDuplicateScene={() => duplicateActiveWorkspaceScene(scene.id)}
          onDeleteScene={() => deleteWorkspaceScene(scene.id)}
          onSceneSettings={() => issueWorkspaceCommand("scene-settings")}
          onBringForward={bringSelectedForward}
          onSendBackward={sendSelectedBackward}
          onGroup={groupSelected}
          onUngroup={ungroupSelected}
          onToggleVisibility={toggleSelectedVisibility}
          onToggleLock={toggleSelectedLock}
          onOpenAnimationCategory={openAnimationCategory}
          onCopyAnimation={() => copySelectedActions()}
          onPasteAnimation={pasteSelectedActions}
          onStaggerAnimation={staggerFromMenu}
          onGroupAnimation={groupSelectedActions}
          onUngroupAnimation={ungroupSelectedActions}
          onSaveAnimationPreset={saveSelectedAnimationPreset}
          onShowShortcuts={showKeyboardShortcuts}
          onShowMcpIntegration={() => setMcpDialogOpen(true)}
          onShowAbout={() => window.alert("Kurogi Motion\nLocal-first motion design editor powered by Remotion.")}
        />
        <div className="project-name">
          <strong>{project.name}</strong>
          <span className={`save-dot status-${saveStatus.toLowerCase().replace(/\W/g, "-")}`}>● {saveStatus}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="preview" onClick={togglePlay}>{playing ? <><Icon name="pause" size={15} />Pause</> : <><Icon name="play" size={15} />Preview</>}</button>
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
                    className={`layer-row ${selectedLayerIds.includes(layer.id) ? "selected" : ""} ${layer.maskSource ? "is-mask-source" : ""} ${layer.mask?.clipping ? "is-clipped" : ""} ${clippingSourceIds.has(layer.id) ? "is-clipping-source" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}
                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}
                    onContextMenu={(event) => { event.preventDefault(); openLayerContextMenu(layer.id, event.clientX, event.clientY); }}
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
              <button type="button" className="asset-dropzone" onClick={() => assetInputRef.current?.click()}><span><Icon name="upload" size={24} /></span><strong>Import an asset</strong><small>Images, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio</small></button>
              <div className="asset-grid">
                {Object.values(project.assets).map((asset) => asset.type === "font" ? (
                  <button type="button" className="font-asset-card" key={asset.id} onClick={() => selectedLayers.some((layer) => layer.type === "text") && commitProject((current) => setFontFamily(current, selectedLayerIds, asset.fontFamily ?? asset.name))}><strong>Aa</strong><span>{asset.fontFamily ?? asset.name}</span></button>
                ) : asset.type === "audio" ? (
                  <button type="button" className="asset-audio-card" key={asset.id} onClick={() => addExistingAsset(asset.id)}><strong><Icon name="audio" size={20} /></strong><span>{asset.name}</span><small>{asset.duration ? `${asset.duration.toFixed(2)}s` : "Audio"}</small></button>
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

        {uiPreferences.showDesignToolbar ? (
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
        ) : null}

        <MultiSceneCanvasStage
          project={project}
          playerRef={playerRef}
          selectedLayerId={selectedLayerId}
          selectedLayerIds={selectedLayerIds}
          selectedActionId={selectedActionId}
          zoom={zoom}
          playing={playing}
          showSafeArea={showSafeArea}
          command={workspaceCommand}
          onSelect={selectLayer}
          onTransformCommit={commitTransform}
          onTextCommit={commitText}
          onActionCommit={commitMotionPath}
          onLayerContextMenu={openLayerContextMenu}
          onZoomChange={setZoom}
          onActivateScene={activateWorkspaceScene}
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
          onSelectAction={(actionId) => { const owner = findActionOwner(project, actionId); if (owner) selectAction(owner.id, actionId); }}
          onDeleteAction={deleteAction}
          onDuplicateAction={duplicateAction}
          onSavePreset={saveSelectedAnimationPreset}
          onApplyCustomPreset={applyAnimationPreset}
          onDeleteCustomPreset={removeAnimationPreset}
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
        selectedLayerIds={selectedLayerIds}
        selectedActionIds={selectedActionIds}
        selectedAudioClipId={selectedAudioClipId}
        onSelectLayer={selectLayer}
        onSelectAction={selectAction}
        onCommitActions={commitTimelineActions}
        onDeleteActions={deleteActions}
        onDuplicateActions={duplicateActions}
        onCopyActions={copySelectedActions}
        onPasteActions={pasteSelectedActions}
        onStaggerActions={staggerSelectedActions}
        onGroupActions={groupSelectedActions}
        onUngroupActions={ungroupSelectedActions}
        onSavePreset={saveSelectedAnimationPreset}
        onSelectAudioClip={selectAudioClip}
        onUpdateAudioClip={updateAudioClipById}
        onDeleteAudioClip={deleteAudioClipById}
        onDuplicateAudioClip={duplicateAudioClipById}
        canPaste={Boolean(animationClipboard)}
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

function readAudioDuration(sourceUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1);
    audio.onerror = () => reject(new Error("Audio metadata could not be read."));
    audio.src = sourceUrl;
  });
}

function normalizeMediaMime(name: string, supplied: string) {
  if (supplied && supplied !== "application/octet-stream") return supplied;
  const extension = name.split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", webm: "audio/webm" } as Record<string, string>)[extension ?? ""] ?? supplied;
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
