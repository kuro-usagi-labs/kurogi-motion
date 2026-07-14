import React, { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { cloneProject, createAnimationAction, createId } from "../core/project";
import type { AnimationCategory, AnimationPresetAction, AnimationType, CustomAnimationPreset, KurogiProject, Layer } from "../types";
import { Icon, animationIconName } from "../ui/Icon";
import { ANIMATION_PRESETS, presetFor } from "./animationPresets";
import { defaultMotionPath } from "./MotionPathOverlay";

interface AnimationPresetDialogProps {
  project: KurogiProject;
  layer: Layer;
  initialCategory: AnimationCategory;
  onClose: () => void;
  onChoose: (category: AnimationCategory, type: AnimationType) => void;
  onChooseCustom: (presetId: string) => void;
  onDeleteCustom: (presetId: string) => void;
}

export function AnimationPresetDialog({ project, layer, initialCategory, onClose, onChoose, onChooseCustom, onDeleteCustom }: AnimationPresetDialogProps) {
  const [category, setCategory] = useState<AnimationCategory>(initialCategory);
  const [query, setQuery] = useState("");
  const presets = useMemo(() => ANIMATION_PRESETS.filter((preset) =>
    preset.category === category &&
    (preset.type !== "counter" || layer.type === "text") &&
    `${preset.label} ${preset.description}`.toLowerCase().includes(query.toLowerCase()),
  ), [category, layer.type, query]);
  const customPresets = useMemo(() => Object.values(project.animationPresets ?? {}).filter((preset) =>
    preset.name.toLowerCase().includes(query.toLowerCase()) &&
    (layer.type === "text" || preset.actions.every((action) => action.type !== "counter")),
  ), [layer.type, project.animationPresets, query]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <div className="preset-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="preset-dialog" role="dialog" aria-modal="true" aria-label="Choose animation preset">
        <header className="preset-dialog-header">
          <div><span>ANIMATION PRESETS</span><h2>Preview motion on {layer.name}</h2></div>
          <button type="button" className="svg-button" onClick={onClose} aria-label="Close preset browser"><Icon name="close" /></button>
        </header>

        <div className="preset-dialog-toolbar">
          <div className="preset-dialog-categories">
            {(["in", "loop", "out"] as const).map((candidate) => <button type="button" key={candidate} className={category === candidate ? "active" : ""} onClick={() => setCategory(candidate)}>{candidate === "in" ? "In" : candidate === "loop" ? "Loop" : "Out"}</button>)}
          </div>
          <label className="preset-search"><Icon name="search" size={16} /><input autoFocus placeholder="Search presets" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
        </div>

        {customPresets.length ? (
          <section className="custom-preset-section">
            <header><h3>My presets</h3><small>{customPresets.length} reusable</small></header>
            <div className="custom-preset-grid">
              {customPresets.map((preset) => (
                <button type="button" className="custom-preset-card" key={preset.id} onClick={() => onChooseCustom(preset.id)}>
                  <AccuratePresetPreview project={project} layer={layer} customPreset={preset} />
                  <strong>{preset.name}</strong>
                  <small>{preset.actions.length} action{preset.actions.length === 1 ? "" : "s"}</small>
                  <button type="button" className="custom-preset-delete" title="Delete custom preset" onClick={(event) => { event.stopPropagation(); onDeleteCustom(preset.id); }}><Icon name="trash" size={13} /></button>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="preset-browser-grid">
          {presets.map((preset) => (
            <button type="button" className={`preset-browser-card preset-card-${category}`} key={preset.type} onClick={() => onChoose(category, preset.type)}>
              <AccuratePresetPreview project={project} layer={layer} type={preset.type} />
              <span className="preset-browser-copy">
                <span className={`preset-browser-icon preset-${category}`}><Icon name={animationIconName(preset.type)} size={17} /></span>
                <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
                <Icon name="plus" size={15} />
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AccuratePresetPreview({ project, layer, type, customPreset }: { project: KurogiProject; layer: Layer; type?: AnimationType; customPreset?: CustomAnimationPreset }) {
  const preview = useMemo(() => previewProject(project, layer, type, customPreset), [customPreset, layer, project, type]);
  const scene = preview.scenes[preview.activeSceneId];
  return (
    <div className="preset-live-preview contrast-preview">
      <Player
        className="remotion-player"
        component={MotionComposition}
        inputProps={{ project: preview }}
        durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}
        compositionWidth={scene.width}
        compositionHeight={scene.height}
        fps={scene.fps}
        autoPlay
        loop
        controls={false}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

function previewProject(project: KurogiProject, sourceLayer: Layer, type?: AnimationType, customPreset?: CustomAnimationPreset): KurogiProject {
  const next = cloneProject(project);
  const sceneId = createId("preview-scene");
  const layerId = createId("preview-layer");
  const duration = customPreset ? Math.max(2.4, presetSpan(customPreset.actions) + .8) : 2.6;
  const scene = {
    id: sceneId,
    name: "Preset preview",
    width: 360,
    height: 220,
    duration,
    fps: 30,
    background: previewBackground(sourceLayer),
    layerIds: [layerId],
    audioClipIds: [],
  };
  const layer = cloneProject(sourceLayer);
  layer.id = layerId;
  layer.sceneId = sceneId;
  layer.parentId = undefined;
  if (layer.type === "group") layer.childIds = [];
  const ratio = Math.min(1, 220 / Math.max(1, layer.size.width), 110 / Math.max(1, layer.size.height));
  layer.size = { width: Math.max(60, layer.size.width * ratio), height: Math.max(42, layer.size.height * ratio) };
  layer.position = { x: (scene.width - layer.size.width) / 2, y: (scene.height - layer.size.height) / 2 };
  layer.rotation = 0;
  layer.scale = { x: 1, y: 1 };
  layer.visible = true;
  layer.locked = false;
  layer.mask = undefined;
  layer.maskSource = false;
  layer.animationActions = customPreset
    ? customPreset.actions.map((action, index) => presetActionToPreview(layerId, action, index))
    : [builtInPreviewAction(layerId, type ?? "fadeIn")];
  next.activeSceneId = sceneId;
  next.scenes = { [sceneId]: scene };
  next.layers = { [layerId]: layer };
  next.animationGroups = {};
  return next;
}

function builtInPreviewAction(layerId: string, type: AnimationType) {
  const preset = presetFor(type);
  const startTime = preset.category === "out" ? 1.15 : .2;
  const action = createAnimationAction(layerId, preset.category, type, {
    startTime,
    duration: preset.recommendedDuration ?? .7,
    easing: preset.recommendedEasing ?? (preset.category === "loop" ? "easeInOut" : "easeOut"),
  });
  if (type === "motionPath") action.motionPath = defaultMotionPath();
  if (type === "counter") action.parameters = { ...action.parameters, from: 0, to: 1240, decimals: 0, prefix: "", suffix: "+" };
  return action;
}

function presetActionToPreview(layerId: string, template: AnimationPresetAction, index: number) {
  const action = createAnimationAction(layerId, template.category, template.type, {
    startTime: Math.max(.1, template.startOffset ?? index * .08),
    duration: template.duration,
    delay: template.delay,
    easing: template.easing,
    easingCurve: template.easingCurve,
    parameters: template.parameters,
    stagger: template.stagger,
    repeat: template.repeat,
    motionPath: template.motionPath,
  });
  return action;
}

function presetSpan(actions: AnimationPresetAction[]) {
  return actions.reduce((value, action) => Math.max(value, (action.startOffset ?? 0) + action.delay + action.duration), 0);
}

function previewBackground(layer: Layer) {
  const color = layer.type === "text" ? layer.style.color : layer.type === "shape" ? layer.style.fill : "#7c5cff";
  return isLightColor(color) ? { type: "solid" as const, color: "#171821" } : { type: "solid" as const, color: "#f4f2f8" };
}

function isLightColor(value: string) {
  const normalized = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return false;
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155;
}
