import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MotionComposition } from "../MotionComposition";
import { cloneProject, createAnimationAction, createId, createShapeLayer } from "../core/project";
import type { AnimationCategory, AnimationPresetAction, AnimationType, CustomAnimationPreset, KurogiProject, Layer, Scene, TextAnimationUnit } from "../types";
import { Icon, animationIconName } from "../ui/Icon";
import { useMotionPreview } from "../ui/useMotionPreview";
import { fitPresetLayer, PRESET_PREVIEW_HEIGHT, PRESET_PREVIEW_WIDTH } from "../app/previewPolicy";
import { ANIMATION_PRESETS, presetFor } from "./animationPresets";
import { defaultMotionPath } from "./MotionPathOverlay";
import { supportsTextAnimationUnit, textAnimationScope, textAnimationScopeBadge, textAnimationScopeLabel, textAnimationVisualDuration, textStaggerForScope } from "../core/textAnimation";
import "../previewExperience.css";

interface AnimationPresetDialogProps {
  project: KurogiProject;
  layer: Layer;
  initialCategory: AnimationCategory;
  onClose: () => void;
  initialTextUnit?: TextAnimationUnit;
  onChoose: (category: AnimationCategory, type: AnimationType, textUnit?: TextAnimationUnit) => void;
  onChooseCustom: (presetId: string) => void;
  onDeleteCustom: (presetId: string) => void;
}

export function AnimationPresetDialog({ project, layer, initialCategory, initialTextUnit = "layer", onClose, onChoose, onChooseCustom, onDeleteCustom }: AnimationPresetDialogProps) {
  const [category, setCategory] = useState<AnimationCategory>(initialCategory);
  const [query, setQuery] = useState("");
  const [textUnit, setTextUnit] = useState<TextAnimationUnit>(initialTextUnit);
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
      <section className={`preset-dialog motion-preset-dialog ${layer.type === "text" ? "has-text-scope" : ""}`} role="dialog" aria-modal="true" aria-label="Choose animation preset">
        <header className="preset-dialog-header">
          <div><span>MOTION LIBRARY</span><h2>Preview motion on {layer.name}</h2><p>See the real timing on your selected layer before applying it.</p></div>
          <button type="button" className="svg-button" onClick={onClose} aria-label="Close preset browser"><Icon name="close" /></button>
        </header>

        <div className="preset-dialog-toolbar">
          <div className="preset-dialog-categories">
            {(["in", "loop", "out"] as const).map((candidate) => <button type="button" key={candidate} className={category === candidate ? "active" : ""} onClick={() => setCategory(candidate)}>{candidate === "in" ? "In" : candidate === "loop" ? "Loop" : "Out"}</button>)}
          </div>
          <label className="preset-search"><Icon name="search" size={16} /><input autoFocus placeholder="Search presets" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
        </div>

        {layer.type === "text" ? (
          <div className="preset-text-scope" aria-label="Text animation target">
            <span><strong>Apply to</strong><small>{textUnit === "layer" ? "Move the text as one object" : `Build the motion one ${textAnimationScopeLabel(textUnit, 1)} at a time`}</small></span>
            <div role="radiogroup" aria-label="Apply animation to">
              {(["layer", "line", "word", "character"] as const).map((unit) => (
                <button type="button" role="radio" aria-checked={textUnit === unit} key={unit} className={textUnit === unit ? "active" : ""} onClick={() => setTextUnit(unit)}>
                  {unit === "layer" ? "Whole" : unit === "character" ? "Letters" : unit === "word" ? "Words" : "Lines"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="preset-dialog-content">
        {customPresets.length ? (
          <section className="custom-preset-section">
            <header><h3>My presets</h3><small>{customPresets.length} reusable</small></header>
            <div className="custom-preset-grid">
              {customPresets.map((preset) => (
                <article className="custom-preset-card-shell" key={preset.id}>
                  <button type="button" className="custom-preset-card-open" onClick={() => onChooseCustom(preset.id)}>
                    <AccuratePresetPreview project={project} layer={layer} customPreset={preset} />
                    <strong>{preset.name}</strong>
                    <small>{preset.actions.length} action{preset.actions.length === 1 ? "" : "s"}</small>
                  </button>
                  <button type="button" className="custom-preset-delete" title="Delete custom preset" onClick={() => onDeleteCustom(preset.id)}><Icon name="trash" size={13} /></button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="preset-browser-grid">
          {presets.map((preset) => (
            <button type="button" className={`preset-browser-card motion-preset-card preset-card-${category}`} key={preset.type} onClick={() => onChoose(category, preset.type, supportsTextAnimationUnit(preset.type) ? textUnit : "layer")}>
              <AccuratePresetPreview project={project} layer={layer} type={preset.type} textUnit={supportsTextAnimationUnit(preset.type) ? textUnit : "layer"} />
              <span className="preset-browser-copy">
                <span className={`preset-browser-icon preset-${category}`}><Icon name={animationIconName(preset.type)} size={17} /></span>
                <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
                <Icon name="plus" size={15} />
              </span>
            </button>
          ))}
        </div>
        </div>
      </section>
    </div>
  );
}

function AccuratePresetPreview({ project, layer, type, customPreset, textUnit = "layer" }: { project: KurogiProject; layer: Layer; type?: AnimationType; customPreset?: CustomAnimationPreset; textUnit?: TextAnimationUnit }) {
  const preview = useMemo(() => buildPresetPreviewProject(project, layer, type, customPreset, textUnit), [customPreset, layer, project, textUnit, type]);
  const scene = preview.scenes[preview.activeSceneId];
  const playerRef = useRef<PlayerRef>(null);
  const { hostRef, shouldLoad, shouldPlay, reducedMotion, previewEvents } = useMotionPreview<HTMLDivElement>();
  const resolvedCategory = type ? presetFor(type).category : customPreset?.actions[0]?.category ?? "in";
  const resolvedTextUnit = layer.type === "text"
    ? type ? textUnit : customPreset?.actions[0] ? textAnimationScope(customPreset.actions[0]) : "layer"
    : "layer";
  const durationInFrames = Math.max(1, Math.round(scene.duration * scene.fps));
  const posterTime = resolvedCategory === "out" ? .8 : resolvedCategory === "loop" ? .55 : 1.05;
  const posterFrame = Math.min(durationInFrames - 1, Math.round(posterTime * scene.fps));

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !shouldLoad) return;
    if (shouldPlay) player.play();
    else {
      player.pause();
      if (reducedMotion) player.seekTo(posterFrame);
    }
  }, [posterFrame, preview, reducedMotion, shouldLoad, shouldPlay]);

  return (
    <div ref={hostRef} className="preset-live-preview contrast-preview motion-preset-stage" {...previewEvents}>
      <div className="motion-preset-frame">
        {shouldLoad ? <Player
          ref={playerRef}
          className="remotion-player motion-preset-player"
          component={MotionComposition}
          inputProps={{ project: preview, editable: false, showSelection: false, showSafeArea: false }}
          durationInFrames={durationInFrames}
          compositionWidth={scene.width}
          compositionHeight={scene.height}
          fps={scene.fps}
          loop
          controls={false}
          initiallyMuted
          clickToPlay={false}
          spaceKeyToPlayOrPause={false}
          style={{ width: "100%", height: "100%" }}
        /> : null}
        <span className="motion-preset-safe-frame" aria-hidden="true" />
      </div>
      <span className="motion-preset-chip" aria-hidden="true"><i />{resolvedCategory} · {textAnimationScopeBadge(resolvedTextUnit)} · live</span>
    </div>
  );
}

export function buildPresetPreviewProject(project: KurogiProject, sourceLayer: Layer, type?: AnimationType, customPreset?: CustomAnimationPreset, textUnit: TextAnimationUnit = "layer"): KurogiProject {
  const next = cloneProject(project);
  const sceneId = createId("preview-scene");
  const layerId = createId("preview-layer");
  const sourceText = sourceLayer.type === "text" ? sourceLayer.text : "";
  const duration = customPreset
    ? Math.max(2.4, presetSpan(customPreset.actions, sourceText) + .8)
    : builtInPreviewDuration(type ?? "fadeIn", sourceText, textUnit);
  const scene: Scene = {
    id: sceneId,
    name: "Preset preview",
    width: PRESET_PREVIEW_WIDTH,
    height: PRESET_PREVIEW_HEIGHT,
    duration,
    fps: 30,
    background: previewBackground(sourceLayer),
    layerIds: [layerId],
    audioClipIds: [],
  };
  const layer: Layer = sourceLayer.type === "group"
    ? createShapeLayer(scene, "rectangle", { name: sourceLayer.name, size: { width: 320, height: 170 }, fill: "#8b6cf2" })
    : cloneProject(sourceLayer);
  layer.id = layerId;
  layer.sceneId = sceneId;
  layer.parentId = undefined;
  const fitted = fitPresetLayer(layer.size.width, layer.size.height);
  layer.size = { width: fitted.width, height: fitted.height };
  layer.position = { x: (scene.width - layer.size.width) / 2, y: (scene.height - layer.size.height) / 2 };
  layer.rotation = 0;
  layer.scale = { x: 1, y: 1 };
  layer.visible = true;
  layer.locked = false;
  layer.mask = undefined;
  layer.maskSource = false;
  layer.opacity = 1;
  layer.startTime = 0;
  layer.duration = duration;
  if (layer.type === "text") {
    layer.style = {
      ...layer.style,
      fontSize: Math.max(32, layer.style.fontSize * fitted.scale),
      letterSpacing: layer.style.letterSpacing * fitted.scale,
      strokeWidth: (layer.style.strokeWidth ?? 0) * fitted.scale,
      verticalAlign: "middle",
    };
  }
  if (layer.type === "shape") {
    layer.style = {
      ...layer.style,
      borderRadius: layer.style.borderRadius * fitted.scale,
      strokeWidth: layer.style.strokeWidth * fitted.scale,
      shadow: layer.style.shadow * fitted.scale,
      blur: layer.style.blur * fitted.scale,
    };
  }
  layer.animationActions = customPreset
    ? customPreset.actions.map((action, index) => presetActionToPreview(layerId, action, index))
    : [builtInPreviewAction(layerId, type ?? "fadeIn", textUnit)];
  next.activeSceneId = sceneId;
  next.scenes = { [sceneId]: scene };
  next.layers = { [layerId]: layer };
  next.animationGroups = {};
  return next;
}

function builtInPreviewAction(layerId: string, type: AnimationType, textUnit: TextAnimationUnit = "layer") {
  const preset = presetFor(type);
  const startTime = preset.category === "out" ? 1.15 : .2;
  const action = createAnimationAction(layerId, preset.category, type, {
    startTime,
    duration: preset.recommendedDuration ?? .7,
    easing: preset.recommendedEasing ?? (preset.category === "loop" ? "easeInOut" : "easeOut"),
    stagger: supportsTextAnimationUnit(type) ? textStaggerForScope(textUnit) : undefined,
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

function presetSpan(actions: AnimationPresetAction[], text = "") {
  return actions.reduce((value, action) => Math.max(value, (action.startOffset ?? 0) + action.delay + textAnimationVisualDuration(action, text)), 0);
}

function builtInPreviewDuration(type: AnimationType, text: string, textUnit: TextAnimationUnit) {
  const preset = presetFor(type);
  const startTime = preset.category === "out" ? 1.15 : .2;
  const action = {
    duration: preset.recommendedDuration ?? .7,
    stagger: supportsTextAnimationUnit(type) ? textStaggerForScope(textUnit) : undefined,
  };
  return Math.max(2.6, startTime + textAnimationVisualDuration(action, text) + .65);
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
