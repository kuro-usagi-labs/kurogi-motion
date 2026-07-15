import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import packageMetadata from "../../package.json";
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
import { createAudioClip, duplicateAudioClip, removeAudioClip, updateAudioClip } from "../core/audio";
import {
  copyLayersToScene,
  createScene as createWorkspaceScene,
  duplicateScene as duplicateWorkspaceScene,
  ensureSceneWorkspace,
  moveScene as moveWorkspaceScene,
  reorderScene as reorderWorkspaceScene,
  removeScene as removeWorkspaceScene,
  renameScene as renameWorkspaceScene,
  setActiveScene,
  setSceneTransition,
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
import { PanelResizeHandle } from "../editor/PanelResizeHandle";
import { MultiSceneCanvasStage, type WorkspaceCommand } from "../editor/MultiSceneCanvasStage";
import { DesignToolsPanel } from "../editor/DesignToolsPanel";
import { EditorMenuBar } from "../editor/EditorMenuBar";
import { McpIntegrationDialog } from "../editor/McpIntegrationDialog";
import { LayerContextMenu, type LayerContextMenuState } from "../editor/LayerContextMenu";
import { executeMcpProjectCommand, type McpBridgeRequest } from "../core/mcpCommands";
import { estimateAutoFitFontSize } from "../core/projectValidation";
import { EDITOR_PANEL_LIMITS, fitEditorPanelWidths, loadEditorUiPreferences, saveEditorUiPreferences, type EditorUiPreferences } from "../core/editorUiPreferences";
import { cutTimelineSelection, trimTimelineSelection, type TrimEdge } from "../core/timelineEditing";
import { getNudgeableLayerIds, isCanvasArrowKey, nudgeCanvasLayers, resolveCanvasArrowAction, type CanvasArrowKey } from "../core/canvasNudge";
import { Icon, type IconName } from "../ui/Icon";
import { ShapeIcon } from "../ui/ShapeIcon";
import { SHAPE_DEFINITIONS, type ShapeGroup } from "../core/shapeLibrary";
import { Timeline, type TimelineActionPatch } from "../editor/TimelineV3";
import { LayerThumbnail } from "./LayerThumbnail";
import { CommandPalette, type CommandPaletteAction } from "../editor/CommandPalette";
import { ExportDialog, ExportToast, type ExportNotice } from "../editor/ExportDialog";
import { useAppFeedback } from "../ui/AppFeedback";
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
  onProjectSnapshot: (project: KurogiProject) => void;
  onMcpReady: () => void;
  onExit: (project: KurogiProject) => void;
}

type SidebarTab = "layers" | "assets" | "text" | "shapes" | "templates";
type EditorInfoDialogKind = "shortcuts" | "about";
type LayerReorderGesture = {
  pointerId: number;
  layerId: string;
  startX: number;
  startY: number;
  dragging: boolean;
};
type CanvasNudgeGesture = {
  layerIds: string[];
  selectionKey: string;
  pressedKeys: Set<CanvasArrowKey>;
};

const SIDEBAR_TABS: Array<{ id: SidebarTab; icon: IconName; label: string }> = [
  { id: "layers", icon: "layers", label: "Layers" },
  { id: "assets", icon: "assets", label: "Assets" },
  { id: "text", icon: "text", label: "Text" },
  { id: "shapes", icon: "shapes", label: "Shapes" },
  { id: "templates", icon: "templates", label: "Templates" },
];

export function Editor({ initialProject, onProjectSnapshot, onMcpReady, onExit }: EditorProps) {
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
  const [assetQuery, setAssetQuery] = useState("");
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [infoDialog, setInfoDialog] = useState<EditorInfoDialogKind | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<LayerContextMenuState | null>(null);
  const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [timelineEditNotice, setTimelineEditNotice] = useState<{ id: number; message: string } | null>(null);
  const feedback = useAppFeedback();
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "mp4",
    fps: scene.fps as 24 | 30 | 60,
    scale: 1,
    quality: "high",
    transparent: false,
    gifLoops: null,
    allScenes: false,
  });
  const playerRef = useRef<PlayerRef>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const layerReorderRef = useRef<LayerReorderGesture | null>(null);
  const canvasNudgeGestureRef = useRef<CanvasNudgeGesture | null>(null);
  const mcpCheckpointsRef = useRef(new Map<string, { id: string; name: string; createdAt: string; project: KurogiProject }>());

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

  function finishCanvasNudgeGesture() {
    if (!canvasNudgeGestureRef.current) return false;
    canvasNudgeGestureRef.current = null;
    return history.finishGesture();
  }

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
    if (inspectorTab !== "Design") return;
    playerRef.current?.pause();
    setPlaying(false);
  }, [inspectorTab]);

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
    onProjectSnapshot(project);
  }, [onProjectSnapshot, project]);

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
      if (canvasNudgeGestureRef.current && !isCanvasArrowKey(event.key)) finishCanvasNudgeGesture();
      const nudgeableLayerIds = getNudgeableLayerIds(history.projectRef.current, selectedLayerIds);
      const arrowAction = resolveCanvasArrowAction({
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shortcutBlocked: editable || event.defaultPrevented || isCanvasArrowControlTarget(event.target) || Boolean(document.querySelector('[aria-modal="true"]')),
        editableLayerCount: nudgeableLayerIds.length,
      });
      if (arrowAction.type === "nudge") {
        event.preventDefault();
        const selectionKey = nudgeableLayerIds.join("\u0000");
        let gesture = canvasNudgeGestureRef.current;
        if (!gesture || gesture.selectionKey !== selectionKey) {
          if (gesture) finishCanvasNudgeGesture();
          history.beginGesture();
          gesture = { layerIds: nudgeableLayerIds, selectionKey, pressedKeys: new Set<CanvasArrowKey>() };
          canvasNudgeGestureRef.current = gesture;
        }
        gesture.pressedKeys.add(arrowAction.key);
        history.preview((current) => nudgeCanvasLayers(current, gesture.layerIds, arrowAction.delta));
      } else if (arrowAction.type === "seek") {
        event.preventDefault();
        const current = playerRef.current?.getCurrentFrame() ?? 0;
        const lastFrame = Math.max(0, scene.duration * scene.fps - 1);
        playerRef.current?.seekTo(Math.min(lastFrame, Math.max(0, current + arrowAction.frames)));
      }
      if (!editable && event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (!editable && modifier && event.key.toLowerCase() === "n") { event.preventDefault(); void leaveEditor(); }
      if (!editable && modifier && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandPaletteOpen(true); }
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
      if (!editable && !modifier && !event.altKey && event.code === "KeyQ") { event.preventDefault(); trimSelectionAtPlayhead("start"); }
      if (!editable && !modifier && !event.altKey && event.code === "KeyW") { event.preventDefault(); trimSelectionAtPlayhead("end"); }
      if (!editable && modifier && !event.shiftKey && event.code === "KeyB") { event.preventDefault(); cutSelectionAtPlayhead(); }
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
    const onKeyUp = (event: KeyboardEvent) => {
      if (!isCanvasArrowKey(event.key)) return;
      const gesture = canvasNudgeGestureRef.current;
      if (!gesture) return;
      gesture.pressedKeys.delete(event.key);
      if (!gesture.pressedKeys.size) finishCanvasNudgeGesture();
    };
    const onWindowBlur = () => finishCanvasNudgeGesture();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  });

  useEffect(() => () => { finishCanvasNudgeGesture(); }, [history.finishGesture]);

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
    const fitPanels = () => setUiPreferences((current) => fitEditorPanelWidths(current, window.innerWidth));
    fitPanels();
    window.addEventListener("resize", fitPanels);
    return () => window.removeEventListener("resize", fitPanels);
  }, []);

  useEffect(() => {
    const unsubscribe = window.kurogi?.onMcpRequest?.((request) => { void handleMcpRequest(request); });
    onMcpReady();
    return () => unsubscribe?.();
  });

  async function handleMcpRequest(request: McpBridgeRequest) {
    if (request.method.startsWith("library.") || request.method.startsWith("render.")) return;
    const respond = window.kurogi?.respondMcpRequest;
    if (!respond) return;
    try {
      if (request.method === "history.undo" || request.method === "history.redo") {
        const changed = request.method === "history.undo" ? history.undo() : history.redo();
        const current = history.projectRef.current;
        window.queueMicrotask(() => {
          const active = current.scenes[current.activeSceneId];
          selectOnly(active?.layerIds.at(-1) ?? "");
          setOnlyAction("");
        });
        respond({ id: request.id, ok: true, result: { changed, ...history.getHistoryState(), projectId: current.id, updatedAt: current.updatedAt } });
        return;
      }
      if (request.method === "history.create_checkpoint") {
        const params = request.params ?? {};
        const checkpoint = {
          id: createId("checkpoint"),
          name: typeof params.name === "string" && params.name.trim() ? params.name.trim().slice(0, 120) : `Checkpoint ${mcpCheckpointsRef.current.size + 1}`,
          createdAt: new Date().toISOString(),
          project: cloneProject(history.projectRef.current),
        };
        mcpCheckpointsRef.current.set(checkpoint.id, checkpoint);
        while (mcpCheckpointsRef.current.size > 20) mcpCheckpointsRef.current.delete(mcpCheckpointsRef.current.keys().next().value as string);
        respond({ id: request.id, ok: true, result: { checkpoint: { id: checkpoint.id, name: checkpoint.name, createdAt: checkpoint.createdAt }, count: mcpCheckpointsRef.current.size } });
        return;
      }
      if (request.method === "history.list_checkpoints") {
        const checkpoints = [...mcpCheckpointsRef.current.values()].map(({ project: _project, ...checkpoint }) => checkpoint);
        respond({ id: request.id, ok: true, result: { checkpoints, count: checkpoints.length } });
        return;
      }
      if (request.method === "history.restore_checkpoint") {
        const checkpointId = String(request.params?.checkpointId ?? "").trim();
        const checkpoint = mcpCheckpointsRef.current.get(checkpointId);
        if (!checkpoint) throw new Error(`Checkpoint ${checkpointId || "(missing)"} does not exist.`);
        const restored = cloneProject(checkpoint.project);
        history.commit(() => restored);
        window.queueMicrotask(() => selectOnly(restored.scenes[restored.activeSceneId]?.layerIds.at(-1) ?? ""));
        respond({ id: request.id, ok: true, result: { restored: true, checkpoint: { id: checkpoint.id, name: checkpoint.name, createdAt: checkpoint.createdAt }, projectId: restored.id } });
        return;
      }
      if (request.method === "project.preview_frame") {
        if (!window.kurogi) throw new Error("Desktop preview rendering is unavailable.");
        const params = request.params ?? {};
        const snapshot = await prepareProjectForExport(cloneProject(history.projectRef.current));
        const result = await window.kurogi.renderPreviewFrame(snapshot, { time: Number(params.time) || 0, scale: Number(params.scale) || .5 });
        respond({ id: request.id, ok: true, result: result });
        return;
      }
      if (request.method === "project.start_render") {
        if (!window.kurogi) throw new Error("Desktop rendering is unavailable.");
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
          allScenes: Boolean(params.allScenes),
        };
        const snapshot = await prepareProjectForExport(cloneProject(history.projectRef.current));
        const outputPath = typeof params.outputPath === "string" && params.outputPath.trim() ? params.outputPath.trim() : undefined;
        const result = await window.kurogi.startRenderJob(snapshot, { ...options, outputPath, automatic: params.automatic !== false });
        respond({ id: request.id, ok: true, result });
        return;
      }
      if (request.method === "asset.import_file") {
        const params = request.params ?? {};
        const filePath = String(params.path ?? "");
        if (!filePath) throw new Error("path is required.");
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
          allScenes: Boolean(params.allScenes),
        };
        const snapshot = await prepareProjectForExport(cloneProject(history.projectRef.current));
        const outputPath = typeof params.outputPath === "string" && params.outputPath.trim() ? params.outputPath.trim() : undefined;
        const result = await window.kurogi.exportVideo(snapshot, { ...options, outputPath, automatic: Boolean(params.automatic) || !outputPath });
        respond({ id: request.id, ok: true, result: result.canceled ? { canceled: true } : { exported: true, path: result.path } });
        return;
      }
      const params = request.params ?? {};
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

  function selectLayersByMarquee(layerIds: string[], additive = false) {
    const valid = [...new Set(layerIds)].filter((id) => project.layers[id]?.sceneId === project.activeSceneId);
    setSelectedAudioClipId("");
    setOnlyAction("");
    setSelectedLayerIds((current) => {
      const next = additive ? [...new Set([...current, ...valid])] : valid;
      setPrimaryLayerId(next.at(-1) ?? "");
      return next;
    });
  }

  function selectTimelineMarquee(layerIds: string[], actionRefs: Array<{ layerId: string; actionId: string }>, additive = false) {
    const actionIds = [...new Set(actionRefs.map((ref) => ref.actionId))];
    const ownerIds = actionRefs.map((ref) => ref.layerId);
    const validLayerIds = [...new Set([...layerIds, ...ownerIds])].filter((id) => project.layers[id]?.sceneId === project.activeSceneId);
    setSelectedAudioClipId("");
    setSelectedActionIds((current) => {
      const next = additive ? [...new Set([...current, ...actionIds])] : actionIds;
      setPrimaryActionId(next.at(-1) ?? "");
      return next;
    });
    setSelectedLayerIds((current) => {
      const next = additive ? [...new Set([...current, ...validLayerIds])] : validLayerIds;
      setPrimaryLayerId(next.at(-1) ?? "");
      return next;
    });
    if (actionIds.length) setInspectorTab("Animation");
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
      feedback.notify({
        tone: "error",
        title: "Unsupported media format",
        message: "Use PNG, JPG, WebP, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio files.",
      });
      return { imported: false };
    }
    const isAudio = mimeType.startsWith("audio/");
    const maximum = isAudio ? 120 : mimeType === "image/svg+xml" ? 10 : 20;
    if (file.size > maximum * 1024 * 1024) {
      feedback.notify({
        tone: "error",
        title: "Media file is too large",
        message: `Choose a file no larger than ${maximum} MB.`,
        detail: file.name,
      });
      return { imported: false };
    }

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
      feedback.notify({
        tone: "error",
        title: "Asset import failed",
        message: error instanceof Error ? error.message : "The asset could not be imported.",
        detail: file.name,
      });
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
  function updateLayerTiming(layerId: string, startTime: number, duration: number) {
    commitProject((current) => updateLayer(current, layerId, (layer) => ({ ...layer, startTime, duration })));
  }

  function beginLayerReorder(event: React.PointerEvent<HTMLButtonElement>, layerId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    layerReorderRef.current = {
      pointerId: event.pointerId,
      layerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  }

  function updateLayerReorder(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = layerReorderRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.dragging && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 5) return;
    gesture.dragging = true;
    setDraggedLayerId(gesture.layerId);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-layer-id]");
    setDragOverLayerId(target?.dataset.layerId && target.dataset.layerId !== gesture.layerId ? target.dataset.layerId : "");
  }

  function finishLayerReorder(event: React.PointerEvent<HTMLButtonElement>) {
    const gesture = layerReorderRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.dragging && dragOverLayerId) moveLayerByDrop(gesture.layerId, dragOverLayerId);
    layerReorderRef.current = null;
    setDraggedLayerId("");
    setDragOverLayerId("");
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function trimSelectionAtPlayhead(edge: TrimEdge) {
    const playhead = (playerRef.current?.getCurrentFrame() ?? 0) / scene.fps;
    const outcome = trimTimelineSelection(history.projectRef.current, selectedLayerIds, selectedAudioClipId, playhead, edge);
    if (!outcome.changed) {
      announceTimelineEdit("Place the playhead inside a selected clip to trim");
      return;
    }
    history.commit(() => outcome.project);
    announceTimelineEdit(edge === "start" ? `Trimmed in point to ${formatTimelineTime(playhead)}` : `Trimmed out point to ${formatTimelineTime(playhead)}`);
  }
  function cutSelectionAtPlayhead() {
    const playhead = (playerRef.current?.getCurrentFrame() ?? 0) / scene.fps;
    const outcome = cutTimelineSelection(history.projectRef.current, selectedLayerIds, selectedAudioClipId, playhead);
    if (!outcome.changed) {
      announceTimelineEdit("Place the playhead inside an editable selected clip to cut");
      return;
    }
    history.commit(() => outcome.project);
    if (outcome.createdLayerIds.length) {
      const ids = [...new Set([...outcome.affectedLayerIds, ...outcome.createdLayerIds])];
      setSelectedLayerIds(ids);
      setPrimaryLayerId(outcome.createdLayerIds.at(-1) ?? ids.at(-1) ?? "");
      setOnlyAction("");
    }
    if (outcome.createdAudioClipIds.length) selectAudioClip(outcome.createdAudioClipIds.at(-1) ?? "");
    announceTimelineEdit(`Cut at ${formatTimelineTime(playhead)}`);
  }
  function announceTimelineEdit(message: string) {
    const id = Date.now();
    setTimelineEditNotice({ id, message });
    window.setTimeout(() => setTimelineEditNotice((current) => current?.id === id ? null : current), 1800);
  }
  function deleteUnusedAssets() { commitProject((current) => executeMcpProjectCommand(current, "asset.delete_unused", {}).project); }
  function reorderWorkspaceSceneById(sceneId: string, targetIndex: number) { commitProject((current) => reorderWorkspaceScene(current, sceneId, targetIndex)); }
  function updateWorkspaceSceneTransition(sceneId: string, transition: NonNullable<KurogiProject["scenes"][string]["transition"]>) { commitProject((current) => setSceneTransition(current, sceneId, transition)); }

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
  async function groupSelectedActions() {
    const name = await feedback.requestText({
      title: "Group animation actions",
      message: "Name this action group so it stays recognizable on the timeline.",
      label: "Group name",
      initialValue: "Animation group",
      confirmLabel: "Create group",
      validate: (value) => value.trim() ? null : "Enter an animation group name.",
    });
    if (name === null) return;
    commitProject((current) => createAnimationGroup(current, refsFromActionIds(current, selectedActionIds), name.trim()).project);
  }
  function ungroupSelectedActions() { commitProject((current) => ungroupAnimationActions(current, refsFromActionIds(current, selectedActionIds))); }
  async function saveSelectedAnimationPreset() {
    if (!selectedActionIds.length) return;
    const name = await feedback.requestText({
      title: "Save custom motion preset",
      message: "Save the selected actions as a reusable motion preset.",
      label: "Preset name",
      initialValue: "Custom motion",
      confirmLabel: "Save preset",
      validate: (value) => value.trim() ? null : "Enter a preset name.",
    });
    if (name === null) return;
    commitProject((current) => saveCustomAnimationPreset(current, name.trim(), refsFromActionIds(current, selectedActionIds)).project);
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
    commitLayer(layerId, (layer) => {
      const next = { ...layer, ...patch } as Layer;
      if (next.type === "text" && next.style.autoFit) next.style = { ...next.style, fontSize: estimateAutoFitFontSize(next) };
      return next;
    });
  }

  function commitText(layerId: string, text: string) {
    commitLayer(layerId, (layer) => {
      if (layer.type !== "text") return layer;
      const next = { ...layer, text };
      return next.style.autoFit ? { ...next, style: { ...next.style, fontSize: estimateAutoFitFontSize(next) } } : next;
    });
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

  async function deleteWorkspaceScene(sceneId: string) {
    const target = project.scenes[sceneId];
    if (!target || Object.keys(project.scenes).length <= 1) return;
    const confirmed = await feedback.confirmAction({
      tone: "danger",
      title: `Delete scene “${target.name}”?`,
      message: "Every layer and animation in this scene will be removed.",
      detail: "This action can be reversed with Undo while the project remains open.",
      confirmLabel: "Delete scene",
    });
    if (!confirmed) return;
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
  function toggleSidebar() {
    setUiPreferences((current) => fitEditorPanelWidths({ ...current, sidebarVisible: !current.sidebarVisible }, window.innerWidth));
  }
  function toggleInspector() {
    setUiPreferences((current) => fitEditorPanelWidths({ ...current, inspectorVisible: !current.inspectorVisible }, window.innerWidth));
  }
  function toggleTimeline() {
    setUiPreferences((current) => ({ ...current, timelineVisible: !current.timelineVisible }));
  }
  async function importFont(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["woff", "woff2", "ttf", "otf"].includes(extension) || file.size > 12 * 1024 * 1024) {
      feedback.notify({
        tone: "error",
        title: "Unsupported font file",
        message: "Use a WOFF, WOFF2, TTF, or OTF font up to 12 MB.",
        detail: file.name,
      });
      return;
    }
    try {
      const assetId = createId("asset");
      const stored = await storeAssetBlob(project.id, assetId, file);
      const family = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Custom font";
      const asset: ProjectAsset = { id: assetId, projectId: project.id, name: family, type: "font", mimeType: file.type || `font/${extension}`, sourceUrl: stored.sourceUrl, storage: "blob", blobId: stored.blobId, byteSize: stored.byteSize, fontFamily: family, fontWeight: 400, fontStyle: "normal" };
      commitProject((current) => { const next = cloneProject(current); next.assets[assetId] = asset; return touchProject(next); });
      if (selectedLayers.some((layer) => layer.type === "text")) commitProject((current) => setFontFamily(current, selectedLayerIds, family));
    } catch {
      feedback.notify({
        tone: "error",
        title: "Font import failed",
        message: "The font could not be imported. Check the file and try again.",
        detail: file.name,
      });
    }
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

  async function staggerFromMenu() {
    if (!selectedActionIds.length) return;
    const value = await feedback.requestText({
      title: "Stagger animation actions",
      message: "Offset each selected action by a consistent time interval.",
      label: "Interval in seconds",
      initialValue: "0.08",
      helperText: "Enter zero or a positive decimal value.",
      inputMode: "decimal",
      confirmLabel: "Apply stagger",
      validate: (candidate) => {
        const step = Number(candidate.trim());
        return candidate.trim() && Number.isFinite(step) && step >= 0 ? null : "Enter a valid non-negative interval.";
      },
    });
    if (value === null) return;
    const step = Number(value.trim());
    staggerSelectedActions(step, "normal");
  }

  function showKeyboardShortcuts() {
    setInfoDialog("shortcuts");
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
      feedback.notify({
        tone: "error",
        title: "Copy failed",
        message: "Project data could not be copied to the clipboard.",
        detail: "Check clipboard permissions and try again.",
      });
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
      const exportScenes = effectiveOptions.allScenes ? Object.values(snapshot.scenes) : [getActiveScene(snapshot)];
      for (const snapshotScene of exportScenes) {
        snapshotScene.fps = effectiveOptions.fps;
        snapshotScene.background = effectiveOptions.transparent
          ? { type: "transparent" }
          : cloneProject(snapshotScene.background.type === "transparent" ? { type: "solid", color: "#000000" } : snapshotScene.background);
      }
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

  const commandPaletteActions: CommandPaletteAction[] = [
    { id: "add-heading", label: "Add heading text", section: "Create", keywords: "text title", run: () => addText("heading") },
    { id: "add-shape", label: "Add rectangle", section: "Create", keywords: "shape box", run: () => addShape("rectangle") },
    { id: "import-media", label: "Import media", section: "Create", keywords: "asset image audio", run: () => assetInputRef.current?.click() },
    { id: "new-scene", label: "Create scene", section: "Scene", run: addWorkspaceScene },
    { id: "focus-scene", label: "Focus active scene", section: "View", run: () => issueWorkspaceCommand("focus-scene") },
    { id: "fit-all", label: "Fit all scenes", section: "View", run: () => issueWorkspaceCommand("fit-all") },
    { id: "duplicate", label: "Duplicate selection", section: "Edit", hint: "Ctrl D", disabled: !selectedLayerId && !selectedActionIds.length, run: () => selectedActionIds.length ? duplicateActions(selectedActionIds) : duplicateSelectedLayer() },
    { id: "trim-in", label: "Trim start to playhead", section: "Timeline", hint: "Q", disabled: !selectedLayerIds.length && !selectedAudioClipId, run: () => trimSelectionAtPlayhead("start") },
    { id: "trim-out", label: "Trim end to playhead", section: "Timeline", hint: "W", disabled: !selectedLayerIds.length && !selectedAudioClipId, run: () => trimSelectionAtPlayhead("end") },
    { id: "cut-playhead", label: "Cut at playhead", section: "Timeline", hint: "Ctrl B", disabled: !selectedLayerIds.length && !selectedAudioClipId, run: cutSelectionAtPlayhead },
    { id: "group", label: "Group selected layers", section: "Arrange", hint: "Ctrl G", disabled: selectedLayerIds.length < 2, run: groupSelected },
    { id: "toggle-snap", label: project.settings.snapEnabled ? "Disable smart snap" : "Enable smart snap", section: "View", run: toggleSmartSnap },
    { id: "toggle-safe", label: showSafeArea ? "Hide safe area" : "Show safe area", section: "View", run: () => setShowSafeArea((value) => !value) },
    { id: "toggle-sidebar", label: uiPreferences.sidebarVisible ? "Hide layer panel" : "Show layer panel", section: "View", run: toggleSidebar },
    { id: "toggle-inspector", label: uiPreferences.inspectorVisible ? "Hide inspector" : "Show inspector", section: "View", run: toggleInspector },
    { id: "toggle-timeline", label: uiPreferences.timelineVisible ? "Hide timeline" : "Show timeline", section: "View", run: toggleTimeline },
    { id: "save", label: "Save project", section: "Project", hint: "Ctrl S", run: () => void saveNow() },
    { id: "export", label: "Export video", section: "Project", hint: "Ctrl E", run: () => { setExportProgress(null); setExportDialogOpen(true); } },
    { id: "mcp", label: "Open MCP integration", section: "Automation", run: () => setMcpDialogOpen(true) },
  ];

  return (
    <main
      className={`app editor-app workspace-mode-${inspectorTab.toLowerCase()} ${uiPreferences.sidebarVisible ? "" : "is-sidebar-hidden"} ${uiPreferences.inspectorVisible ? "" : "is-inspector-hidden"} ${inspectorTab === "Animation" && !uiPreferences.timelineVisible ? "is-timeline-hidden" : ""}`}
      style={{
        "--editor-sidebar-width": `${uiPreferences.sidebarWidth}px`,
        "--editor-inspector-width": `${uiPreferences.inspectorWidth}px`,
      } as React.CSSProperties}
    >
      {feedback.host}
      <CommandPalette open={commandPaletteOpen} actions={commandPaletteActions} onClose={() => setCommandPaletteOpen(false)} />
      <McpIntegrationDialog open={mcpDialogOpen} onClose={() => setMcpDialogOpen(false)} />
      <EditorInfoDialog kind={infoDialog} onClose={() => setInfoDialog(null)} />
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
          sidebarVisible={uiPreferences.sidebarVisible}
          inspectorVisible={uiPreferences.inspectorVisible}
          timelineVisible={uiPreferences.timelineVisible}
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
          onToggleSidebar={toggleSidebar}
          onToggleInspector={toggleInspector}
          onToggleTimeline={toggleTimeline}
          onCreateScene={addWorkspaceScene}
          onDuplicateScene={() => duplicateActiveWorkspaceScene(scene.id)}
          onDeleteScene={() => void deleteWorkspaceScene(scene.id)}
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
          onShowAbout={() => setInfoDialog("about")}
        />
        <div className="project-name">
          <strong>{project.name}</strong>
          <span className={`save-dot status-${saveStatus.toLowerCase().replace(/\W/g, "-")}`}><Icon name="status" size={9} />{saveStatus}</span>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="preview" onClick={togglePlay}>{playing ? <><Icon name="pause" size={15} />Pause</> : <><Icon name="play" size={15} />Preview</>}</button>
          <button type="button" className="export" onClick={() => { setExportProgress(null); setExportDialogOpen(true); }}>Export <Icon name="export" size={15} /></button>
        </div>
      </header>

      <section className="editor-context-ribbon" aria-label="Editor context">
        <div className="context-breadcrumbs">
          <span className="context-kicker">Scene</span><strong>{scene.name}</strong>
          {selectedLayer ? <><i><Icon name="chevronRight" size={12} /></i><b>{selectedLayer.name}</b></> : <><i><Icon name="chevronRight" size={12} /></i><span>Canvas</span></>}
        </div>
        <div className="context-readout">
          <span>{scene.width} × {scene.height}</span><span>{scene.fps} fps</span><span>{scene.duration.toFixed(2)} sec</span>
          {selectedLayers.length > 1 ? <strong>{selectedLayers.length} layers selected</strong> : selectedLayer ? <strong>{(selectedLayer.startTime ?? 0).toFixed(2)}s — {((selectedLayer.startTime ?? 0) + (selectedLayer.duration ?? scene.duration)).toFixed(2)}s</strong> : <strong>No selection</strong>}
        </div>
        <div className="context-actions">
          <button type="button" className="command-palette-trigger" onClick={() => setCommandPaletteOpen(true)} title="Open command palette">Commands <kbd>Ctrl K</kbd></button>
          <button type="button" className={project.settings.snapEnabled ? "is-active" : ""} onClick={toggleSmartSnap} title="Toggle smart snap">Snap</button>
          <button type="button" className={showSafeArea ? "is-active" : ""} onClick={() => setShowSafeArea((value) => !value)} title="Toggle safe area">Safe area</button>
          <button type="button" className="mcp-ready-badge" onClick={() => setMcpDialogOpen(true)} title="Open MCP integration"><i />MCP ready</button>
        </div>
      </section>

      <section className="workspace editor-workspace">
        <aside className="rail">
          {SIDEBAR_TABS.map((item) => (
            <button type="button" key={item.id} className={sidebarTab === item.id ? "rail-active" : ""} onClick={() => setSidebarTab(item.id)}>
              <b><Icon name={item.icon} size={18} /></b><span>{item.label}</span>
            </button>
          ))}
          <div className="rail-bottom"><button type="button" onClick={showKeyboardShortcuts}><b><Icon name="help" size={18} /></b><span>Help</span></button></div>
        </aside>

        <aside className="sidebar editor-sidebar" aria-hidden={!uiPreferences.sidebarVisible || undefined}>
          <div className="panel-title">
            <span>{SIDEBAR_TABS.find((item) => item.id === sidebarTab)?.label}</span>
            <div className="panel-title-actions">
              {sidebarTab === "assets" ? <button type="button" onClick={() => assetInputRef.current?.click()} aria-label="Import asset"><Icon name="plus" size={16} /></button> : null}
              <button type="button" className="panel-collapse-button sidebar-collapse-button" onClick={toggleSidebar} title="Hide layer panel" aria-label="Hide layer panel"><Icon name="chevronRight" className="panel-collapse-icon is-left" size={14} /></button>
            </div>
          </div>
          {sidebarTab === "layers" ? (
            <div className="sidebar-scroll">
              <div className="scene-row"><span><Icon name="chevronDown" size={13} /></span><b>{scene.name}</b><small>{scene.width} × {scene.height}</small></div>
              <div className="layer-quick-add">
                <button type="button" onClick={() => addText("heading")}><Icon name="text" size={13} />Text</button>
                <button type="button" onClick={() => addShape("rectangle")}><Icon name="shapes" size={13} />Shape</button>
                <button type="button" onClick={() => assetInputRef.current?.click()}><Icon name="upload" size={13} />Media</button>
              </div>
              <div className="layer-list" role="listbox" aria-label="Scene layers" aria-multiselectable="true">
                {[...layers].reverse().map((layer) => (
                  <div
                    key={layer.id}
                    data-layer-id={layer.id}
                    tabIndex={0}
                    role="option"
                    aria-selected={selectedLayerIds.includes(layer.id)}
                    className={`layer-row ${selectedLayerIds.includes(layer.id) ? "selected" : ""} ${layer.maskSource ? "is-mask-source" : ""} ${layer.mask?.clipping ? "is-clipped" : ""} ${clippingSourceIds.has(layer.id) ? "is-clipping-source" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}
                    onClick={(event) => selectLayer(layer.id, event.shiftKey)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                      event.preventDefault();
                      selectLayer(layer.id, event.shiftKey);
                    }}
                    onContextMenu={(event) => { event.preventDefault(); openLayerContextMenu(layer.id, event.clientX, event.clientY); }}
                  >
                    <button
                      type="button"
                      className="layer-drag-grip"
                      title="Drag to reorder"
                      aria-label={`Reorder ${layer.name}`}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => beginLayerReorder(event, layer.id)}
                      onPointerMove={updateLayerReorder}
                      onPointerUp={finishLayerReorder}
                      onPointerCancel={finishLayerReorder}
                    ><Icon name="grip" size={15} /></button>
                    <LayerThumbnail project={project} layer={layer} size={28} decorative />
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
                    <button type="button" className="layer-state" onClick={(event) => { event.stopPropagation(); commitLayer(layer.id, (candidate) => ({ ...candidate, visible: !candidate.visible })); }} title={layer.visible ? "Hide" : "Show"} aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}>{layer.visible ? <Icon name="eye" size={14} /> : <Icon name="eyeOff" size={14} />}</button>
                    <button type="button" className="layer-state" onClick={(event) => { event.stopPropagation(); commitLayer(layer.id, (candidate) => ({ ...candidate, locked: !candidate.locked })); }} title={layer.locked ? "Unlock" : "Lock"} aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}>{layer.locked ? <Icon name="lock" size={13} /> : <Icon name="unlock" size={13} />}</button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {sidebarTab === "text" ? (
            <div className="add-grid text-presets">
              <button type="button" onClick={() => addText("heading")}><strong>H</strong><span>Heading</span></button>
              <button type="button" onClick={() => addText("subheading")}><strong>Aa</strong><span>Subheading</span></button>
              <button type="button" onClick={() => addText("body")}><strong><Icon name="paragraph" size={22} /></strong><span>Body text</span></button>
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
              <div className="asset-library-tools"><input type="search" value={assetQuery} placeholder="Search assets…" onChange={(event) => setAssetQuery(event.currentTarget.value)} /><button type="button" onClick={deleteUnusedAssets} title="Delete unused assets">Clean up</button></div>
              <button type="button" className="asset-dropzone" onClick={() => assetInputRef.current?.click()}><span><Icon name="upload" size={24} /></span><strong>Import an asset</strong><small>Images, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio</small></button>
              <div className="asset-grid">
                {Object.values(project.assets).filter((asset) => !assetQuery.trim() || `${asset.name} ${asset.type} ${asset.mimeType}`.toLowerCase().includes(assetQuery.trim().toLowerCase())).map((asset) => asset.type === "font" ? (
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

        {uiPreferences.sidebarVisible ? <PanelResizeHandle edge="sidebar" value={uiPreferences.sidebarWidth} minimum={EDITOR_PANEL_LIMITS.sidebar.minimum} maximum={EDITOR_PANEL_LIMITS.sidebar.maximum} defaultValue={EDITOR_PANEL_LIMITS.sidebar.defaultValue} onChange={(sidebarWidth) => setUiPreferences((current) => fitEditorPanelWidths({ ...current, sidebarWidth }, window.innerWidth))} /> : null}

        {!uiPreferences.sidebarVisible ? <button type="button" className="workspace-panel-restore is-sidebar" onClick={toggleSidebar} title="Show layer panel"><Icon name="chevronRight" size={14} /><span>Layers</span></button> : null}
        {!uiPreferences.inspectorVisible ? <button type="button" className="workspace-panel-restore is-inspector" onClick={toggleInspector} title="Show inspector"><span>Inspector</span><Icon name="chevronRight" className="panel-collapse-icon is-left" size={14} /></button> : null}
        {inspectorTab === "Animation" && !uiPreferences.timelineVisible ? <button type="button" className="workspace-panel-restore is-timeline" onClick={toggleTimeline} title="Show timeline"><Icon name="chevronUp" size={14} /><span>Timeline</span></button> : null}

        {inspectorTab === "Design" && uiPreferences.showDesignToolbar ? (
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
          focusActiveScene={inspectorTab === "Design"}
          command={workspaceCommand}
          onSelect={selectLayer}
          onMarqueeSelect={selectLayersByMarquee}
          onTransformCommit={commitTransform}
          onTextCommit={commitText}
          onActionCommit={commitMotionPath}
          onLayerContextMenu={openLayerContextMenu}
          onZoomChange={setZoom}
          onActivateScene={activateWorkspaceScene}
          onRenameScene={renameWorkspaceSceneById}
          onUpdateScene={updateWorkspaceSceneById}
          onMoveScene={moveWorkspaceSceneById}
          onReorderScene={reorderWorkspaceSceneById}
          onSetSceneTransition={updateWorkspaceSceneTransition}
          onCopyLayerToScene={copyLayerIntoWorkspaceScene}
        />

        <Inspector
          project={project}
          selectedLayer={selectedLayer}
          selectedAction={selectedAction}
          tab={inspectorTab}
          onTabChange={(tab) => {
            setInspectorTab(tab);
            if (tab === "Design") {
              playerRef.current?.pause();
              setPlaying(false);
            }
          }}
          onCollapse={toggleInspector}
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
          onUpdateScene={updateWorkspaceSceneById}
          exportOptions={exportOptions}
          onExportOptionsChange={setExportOptions}
          exporting={exporting}
          exportProgress={exportProgress}
          onExport={() => void exportVideo()}
        />

        {uiPreferences.inspectorVisible ? <PanelResizeHandle edge="inspector" value={uiPreferences.inspectorWidth} minimum={EDITOR_PANEL_LIMITS.inspector.minimum} maximum={EDITOR_PANEL_LIMITS.inspector.maximum} defaultValue={EDITOR_PANEL_LIMITS.inspector.defaultValue} onChange={(inspectorWidth) => setUiPreferences((current) => fitEditorPanelWidths({ ...current, inspectorWidth }, window.innerWidth))} /> : null}
      </section>

      {inspectorTab === "Animation" && uiPreferences.timelineVisible ? <Timeline
        project={project}
        playerRef={playerRef}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        selectedActionIds={selectedActionIds}
        selectedAudioClipId={selectedAudioClipId}
        onSelectLayer={selectLayer}
        onSelectAction={selectAction}
        onMarqueeSelect={selectTimelineMarquee}
        onCommitActions={commitTimelineActions}
        onUpdateLayerTiming={updateLayerTiming}
        onTrimStart={() => trimSelectionAtPlayhead("start")}
        onTrimEnd={() => trimSelectionAtPlayhead("end")}
        onCut={cutSelectionAtPlayhead}
        editNotice={timelineEditNotice?.message ?? ""}
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
        onCollapse={toggleTimeline}
      /> : null}
    </main>
  );
}

function findActionOwner(project: KurogiProject, actionId: string) {
  return Object.values(project.layers).find((layer) =>
    layer.animationActions.some((action) => action.id === actionId),
  );
}

function EditorInfoDialog({ kind, onClose }: { kind: EditorInfoDialogKind | null; onClose: () => void }) {
  useEffect(() => {
    if (!kind) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [kind, onClose]);

  if (!kind) return null;
  const shortcuts = [
    ["Q / W", "Trim start / end to playhead"],
    ["Ctrl B", "Cut selection at playhead"],
    ["Ctrl + wheel", "Zoom timeline or canvas"],
    ["Space", "Play or pause"],
    ["Arrow keys", "Nudge selected layers by 1 px · seek frames when none are editable"],
    ["Shift + Arrow", "Nudge selected layers by 10 px"],
    ["Shift + drag", "Add to marquee selection"],
    ["Ctrl S", "Save project"],
    ["Ctrl Z / Ctrl Shift Z", "Undo / redo"],
    ["Ctrl D", "Duplicate selection"],
    ["Ctrl G / Ctrl Shift G", "Group / ungroup"],
    ["Delete", "Remove selection"],
  ];

  return <div className="editor-info-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="editor-info-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-info-title">
      <header>
        <div><span>{kind === "shortcuts" ? "Workflow" : "Kurogi Motion"}</span><h2 id="editor-info-title">{kind === "shortcuts" ? "Keyboard shortcuts" : "Motion design, without the handoff"}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close dialog"><Icon name="close" size={16} /></button>
      </header>
      {kind === "shortcuts" ? <div className="shortcut-reference">
        {shortcuts.map(([keys, description]) => <div key={keys}><kbd>{keys}</kbd><span>{description}</span></div>)}
      </div> : <div className="about-kurogi">
        <div className="about-kurogi-mark">K</div>
        <p>Kurogi Motion is a local-first desktop studio for designing, animating, and exporting production-ready motion graphics.</p>
        <dl><div><dt>Version</dt><dd>{packageMetadata.version}</dd></div><div><dt>Engine</dt><dd>Remotion</dd></div><div><dt>Automation</dt><dd>Autonomous MCP</dd></div></dl>
      </div>}
      <footer><span>Press Esc to close</span><button type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function isCanvasArrowControlTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('button, a, [role="separator"], [role="slider"], [role="button"], [role="menuitem"], [role="option"]'));
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

function formatTimelineTime(seconds: number) {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
