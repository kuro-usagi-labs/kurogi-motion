import React, { useEffect, useMemo, useState } from "react";
import { getActiveScene } from "../core/project";
import type {
  AnimationAction,
  AnimationCategory,
  AnimationType,
  ExportOptions,
  ExportProgress,
  KurogiProject,
  Layer,
} from "../types";
import { ANIMATION_PRESETS, presetFor } from "./animationPresets";

export type InspectorTab = "Design" | "Animation" | "Export";

interface InspectorProps {
  project: KurogiProject;
  selectedLayer: Layer | null;
  selectedAction: AnimationAction | null;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onBeginPropertyEdit: () => void;
  onFinishPropertyEdit: () => void;
  onCancelPropertyEdit: () => void;
  onPreviewLayer: (layerId: string, updater: (layer: Layer) => Layer) => void;
  onCommitLayer: (layerId: string, updater: (layer: Layer) => Layer) => void;
  onPreviewAction: (
    layerId: string,
    actionId: string,
    updater: (action: AnimationAction) => AnimationAction,
  ) => void;
  onCommitAction: (
    layerId: string,
    actionId: string,
    updater: (action: AnimationAction) => AnimationAction,
  ) => void;
  onAddAction: (category: AnimationCategory, type: AnimationType) => void;
  onSelectAction: (actionId: string) => void;
  onDeleteAction: (actionId: string) => void;
  onDuplicateAction: (actionId: string) => void;
  exportOptions: ExportOptions;
  onExportOptionsChange: (options: ExportOptions) => void;
  exporting: boolean;
  exportProgress: ExportProgress | null;
  onExport: () => void;
}

export function Inspector({
  project,
  selectedLayer,
  selectedAction,
  tab,
  onTabChange,
  onBeginPropertyEdit,
  onFinishPropertyEdit,
  onCancelPropertyEdit,
  onPreviewLayer,
  onCommitLayer,
  onPreviewAction,
  onCommitAction,
  onAddAction,
  onSelectAction,
  onDeleteAction,
  onDuplicateAction,
  exportOptions,
  onExportOptionsChange,
  exporting,
  exportProgress,
  onExport,
}: InspectorProps) {
  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        {(["Design", "Animation", "Export"] as const).map((candidate) => (
          <button
            type="button"
            className={tab === candidate ? "active" : ""}
            onClick={() => onTabChange(candidate)}
            key={candidate}
          >
            {candidate}
          </button>
        ))}
      </div>
      {tab === "Design" ? (
        <DesignInspector
          layer={selectedLayer}
          onBegin={onBeginPropertyEdit}
          onFinish={onFinishPropertyEdit}
          onCancel={onCancelPropertyEdit}
          onPreview={onPreviewLayer}
          onCommit={onCommitLayer}
        />
      ) : null}
      {tab === "Animation" ? (
        <AnimationInspector
          project={project}
          layer={selectedLayer}
          selectedAction={selectedAction}
          onBegin={onBeginPropertyEdit}
          onFinish={onFinishPropertyEdit}
          onCancel={onCancelPropertyEdit}
          onPreview={onPreviewAction}
          onCommit={onCommitAction}
          onAddAction={onAddAction}
          onSelectAction={onSelectAction}
          onDeleteAction={onDeleteAction}
          onDuplicateAction={onDuplicateAction}
        />
      ) : null}
      {tab === "Export" ? (
        <ExportInspector
          project={project}
          options={exportOptions}
          onChange={onExportOptionsChange}
          exporting={exporting}
          progress={exportProgress}
          onExport={onExport}
        />
      ) : null}
    </aside>
  );
}

function DesignInspector({
  layer,
  onBegin,
  onFinish,
  onCancel,
  onPreview,
  onCommit,
}: {
  layer: Layer | null;
  onBegin: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onPreview: (layerId: string, updater: (layer: Layer) => Layer) => void;
  onCommit: (layerId: string, updater: (layer: Layer) => Layer) => void;
}) {
  if (!layer) return <InspectorEmpty title="Select a layer" message="Choose a layer on the canvas or timeline to edit its design." />;

  const preview = (updater: (current: Layer) => Layer) => onPreview(layer.id, updater);
  const commit = (updater: (current: Layer) => Layer) => onCommit(layer.id, updater);

  return (
    <div className="inspector-body inspector-scroll">
      <InspectorHeader eyebrow={layer.type} title={layer.name} />
      <section className="property-section">
        <div className="section-label">Layer</div>
        <label className="toggle-row">
          <span>Visible</span>
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(event) => commit((current) => ({ ...current, visible: event.currentTarget.checked }))}
          />
        </label>
        <label className="toggle-row">
          <span>Locked</span>
          <input
            type="checkbox"
            checked={layer.locked}
            onChange={(event) => commit((current) => ({ ...current, locked: event.currentTarget.checked }))}
          />
        </label>
      </section>
      <section className="property-section">
        <div className="section-label">Transform</div>
        <div className="property-grid two">
          <NumberField label="X" value={layer.position.x} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, position: { ...current.position, x: value } }))} />
          <NumberField label="Y" value={layer.position.y} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, position: { ...current.position, y: value } }))} />
          <NumberField label="Width" value={layer.size.width} min={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, size: { ...current.size, width: Math.max(1, value) } }))} />
          <NumberField label="Height" value={layer.size.height} min={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, size: { ...current.size, height: Math.max(1, value) } }))} />
          <NumberField label="Rotation" value={layer.rotation} step={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, rotation: value }))} />
          <NumberField label="Opacity" value={layer.opacity * 100} min={0} max={100} suffix="%" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, opacity: clamp(value / 100, 0, 1) }))} />
          <NumberField label="Scale X" value={layer.scale.x * 100} min={1} suffix="%" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, scale: { ...current.scale, x: Math.max(0.01, value / 100) } }))} />
          <NumberField label="Scale Y" value={layer.scale.y * 100} min={1} suffix="%" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, scale: { ...current.scale, y: Math.max(0.01, value / 100) } }))} />
          <NumberField label="Anchor X" value={layer.anchor.x * 100} min={0} max={100} suffix="%" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, anchor: { ...current.anchor, x: clamp(value / 100, 0, 1) } }))} />
          <NumberField label="Anchor Y" value={layer.anchor.y * 100} min={0} max={100} suffix="%" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => ({ ...current, anchor: { ...current.anchor, y: clamp(value / 100, 0, 1) } }))} />
        </div>
      </section>
      {layer.type === "text" ? (
        <section className="property-section">
          <div className="section-label">Typography</div>
          <label>
            Content
            <textarea
              value={layer.text}
              onFocus={onBegin}
              onChange={(event) => preview((current) => current.type === "text" ? { ...current, text: event.currentTarget.value } : current)}
              onBlur={onFinish}
              onKeyDown={(event) => cancelOnEscape(event, onCancel)}
            />
          </label>
          <label>
            Font family
            <select
              value={layer.style.fontFamily}
              onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, fontFamily: event.currentTarget.value } } : current)}
            >
              <option>Inter</option>
              <option>Arial</option>
              <option>Georgia</option>
              <option>Verdana</option>
              <option>Trebuchet MS</option>
            </select>
          </label>
          <div className="property-grid two">
            <NumberField label="Font size" value={layer.style.fontSize} min={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, fontSize: Math.max(1, value) } } : current)} />
            <label>
              Weight
              <select value={layer.style.fontWeight} onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, fontWeight: Number(event.currentTarget.value) } } : current)}>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="600">Semibold</option>
                <option value="700">Bold</option>
                <option value="800">Extra bold</option>
              </select>
            </label>
            <NumberField label="Line height" value={layer.style.lineHeight} min={0.1} step={0.05} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, lineHeight: Math.max(0.1, value) } } : current)} />
            <NumberField label="Letter spacing" value={layer.style.letterSpacing} step={0.1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, letterSpacing: value } } : current)} />
          </div>
          <div className="property-grid two">
            <label>
              Alignment
              <select value={layer.style.align} onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, align: event.currentTarget.value as "left" | "center" | "right" } } : current)}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
            <ColorField label="Color" value={layer.style.color} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, color: value } } : current)} />
          </div>
        </section>
      ) : null}
      {layer.type === "shape" ? (
        <section className="property-section">
          <div className="section-label">Shape style</div>
          <label>
            Shape
            <select value={layer.shape} onChange={(event) => commit((current) => current.type === "shape" ? { ...current, shape: event.currentTarget.value as typeof current.shape } : current)}>
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="line">Line</option>
              <option value="polygon">Polygon</option>
              <option value="arrow">Arrow</option>
            </select>
          </label>
          <div className="property-grid two">
            <ColorField label="Fill" value={layer.style.fill} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, fill: value } } : current)} />
            <ColorField label="Stroke" value={normalizeColor(layer.style.stroke)} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, stroke: value } } : current)} />
            <NumberField label="Stroke" value={layer.style.strokeWidth} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, strokeWidth: Math.max(0, value) } } : current)} />
            <NumberField label="Radius" value={layer.style.borderRadius} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, borderRadius: Math.max(0, value) } } : current)} />
            <NumberField label="Shadow" value={layer.style.shadow} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, shadow: Math.max(0, value) } } : current)} />
            <NumberField label="Blur" value={layer.style.blur} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, blur: Math.max(0, value) } } : current)} />
          </div>
        </section>
      ) : null}
      {layer.type === "image" ? (
        <section className="property-section">
          <div className="section-label">Image</div>
          <label>
            Fit
            <select value={layer.fit} onChange={(event) => commit((current) => current.type === "image" ? { ...current, fit: event.currentTarget.value as typeof current.fit } : current)}>
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Fill</option>
            </select>
          </label>
        </section>
      ) : null}
    </div>
  );
}

function AnimationInspector({
  project,
  layer,
  selectedAction,
  onBegin,
  onFinish,
  onCancel,
  onPreview,
  onCommit,
  onAddAction,
  onSelectAction,
  onDeleteAction,
  onDuplicateAction,
}: {
  project: KurogiProject;
  layer: Layer | null;
  selectedAction: AnimationAction | null;
  onBegin: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onPreview: (layerId: string, actionId: string, updater: (action: AnimationAction) => AnimationAction) => void;
  onCommit: (layerId: string, actionId: string, updater: (action: AnimationAction) => AnimationAction) => void;
  onAddAction: (category: AnimationCategory, type: AnimationType) => void;
  onSelectAction: (actionId: string) => void;
  onDeleteAction: (actionId: string) => void;
  onDuplicateAction: (actionId: string) => void;
}) {
  const [category, setCategory] = useState<AnimationCategory>(selectedAction?.category ?? "in");
  const scene = getActiveScene(project);

  useEffect(() => {
    if (selectedAction) setCategory(selectedAction.category);
  }, [selectedAction?.id, selectedAction?.category]);

  const actions = useMemo(
    () => layer?.animationActions.filter((action) => action.category === category) ?? [],
    [category, layer],
  );
  const presets = ANIMATION_PRESETS.filter((preset) => preset.category === category);

  if (!layer) return <InspectorEmpty title="Select a layer" message="Choose a layer, then add an In, Loop, or Out action." />;

  const activeAction = selectedAction && selectedAction.layerId === layer.id ? selectedAction : actions[0] ?? null;
  const preview = (updater: (action: AnimationAction) => AnimationAction) => activeAction && onPreview(layer.id, activeAction.id, updater);
  const commit = (updater: (action: AnimationAction) => AnimationAction) => activeAction && onCommit(layer.id, activeAction.id, updater);

  return (
    <div className="inspector-body inspector-scroll animation-inspector">
      <InspectorHeader eyebrow="Animation" title={layer.name} />
      <div className="animation-category-tabs">
        {(["in", "loop", "out"] as const).map((candidate) => (
          <button type="button" key={candidate} className={category === candidate ? "active" : ""} onClick={() => setCategory(candidate)}>
            {candidate === "in" ? "In" : candidate === "loop" ? "Loop" : "Out"}
            <span>{layer.animationActions.filter((action) => action.category === candidate).length}</span>
          </button>
        ))}
      </div>
      <section className="property-section">
        <div className="section-label">Choose movement</div>
        <div className="preset-grid">
          {presets.map((preset) => (
            <button type="button" key={preset.type} onClick={() => onAddAction(category, preset.type)}>
              <span className={`preset-icon preset-${category}`}>{preset.icon}</span>
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </section>
      {actions.length ? (
        <section className="property-section">
          <div className="section-label">Actions</div>
          <div className="action-list">
            {actions.map((action) => (
              <button type="button" key={action.id} className={activeAction?.id === action.id ? "active" : ""} onClick={() => onSelectAction(action.id)}>
                <span className={`action-dot dot-${action.category}`} />
                <span><strong>{presetFor(action.type).label}</strong><small>{(action.startTime + action.delay).toFixed(2)}s · {action.duration.toFixed(2)}s</small></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {activeAction ? (
        <section className="property-section action-editor">
          <div className="action-editor-title">
            <span><small>{activeAction.category.toUpperCase()}</small><strong>{presetFor(activeAction.type).label}</strong></span>
            <span>
              <button type="button" onClick={() => onDuplicateAction(activeAction.id)}>Duplicate</button>
              <button type="button" className="danger-text" onClick={() => onDeleteAction(activeAction.id)}>Delete</button>
            </span>
          </div>
          <div className="property-grid two">
            <NumberField label="Start" value={activeAction.startTime} min={0} max={scene.duration} step={0.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, startTime: clamp(value, 0, scene.duration) }))} />
            <NumberField label="Duration" value={activeAction.duration} min={0.05} max={scene.duration} step={0.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, duration: clamp(value, 0.05, scene.duration) }))} />
            <NumberField label="Delay" value={activeAction.delay} min={0} max={scene.duration} step={0.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, delay: clamp(value, 0, scene.duration) }))} />
            <label>
              Easing
              <select value={activeAction.easing} onChange={(event) => commit((action) => ({ ...action, easing: event.currentTarget.value as AnimationAction["easing"] }))}>
                <option value="linear">Linear</option>
                <option value="easeIn">Ease in</option>
                <option value="easeOut">Ease out</option>
                <option value="easeInOut">Ease in out</option>
                <option value="backIn">Back in</option>
                <option value="backOut">Back out</option>
                <option value="overshoot">Overshoot</option>
                <option value="bounce">Bounce</option>
                <option value="elastic">Elastic</option>
              </select>
            </label>
          </div>
          {hasDirection(activeAction.type) ? (
            <label>
              Direction
              <select value={String(activeAction.parameters.direction ?? "up")} onChange={(event) => commit((action) => ({ ...action, parameters: { ...action.parameters, direction: event.currentTarget.value } }))}>
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          ) : null}
          {hasDistance(activeAction.type) ? (
            <NumberField label="Distance" value={Number(activeAction.parameters.distance ?? 90)} min={0} step={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, distance: Math.max(0, value) } }))} />
          ) : null}
          {hasIntensity(activeAction.type) ? (
            <NumberField label="Intensity" value={Number(activeAction.parameters.intensity ?? defaultIntensity(activeAction.type))} min={0} step={activeAction.type === "pulse" || activeAction.type === "breathe" ? 0.01 : 1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, intensity: Math.max(0, value) } }))} />
          ) : null}
          {layer.type === "text" ? (
            <div className="stagger-panel">
              <label className="toggle-row">
                <span>Stagger text</span>
                <input type="checkbox" checked={activeAction.stagger?.enabled ?? false} onChange={(event) => commit((action) => ({ ...action, stagger: { enabled: event.currentTarget.checked, unit: action.stagger?.unit ?? "character", delay: action.stagger?.delay ?? 0.04, order: action.stagger?.order ?? "normal", seed: action.stagger?.seed ?? 42 } }))} />
              </label>
              {activeAction.stagger?.enabled ? (
                <>
                  <div className="property-grid two">
                    <label>
                      Unit
                      <select value={activeAction.stagger.unit} onChange={(event) => commit((action) => ({ ...action, stagger: { ...action.stagger!, unit: event.currentTarget.value as NonNullable<AnimationAction["stagger"]>["unit"] } }))}>
                        <option value="line">Line</option>
                        <option value="word">Word</option>
                        <option value="character">Character</option>
                      </select>
                    </label>
                    <label>
                      Order
                      <select value={activeAction.stagger.order} onChange={(event) => commit((action) => ({ ...action, stagger: { ...action.stagger!, order: event.currentTarget.value as NonNullable<AnimationAction["stagger"]>["order"] } }))}>
                        <option value="normal">Normal</option>
                        <option value="reverse">Reverse</option>
                        <option value="center">Center outward</option>
                        <option value="edges">Edges inward</option>
                        <option value="random">Random seeded</option>
                      </select>
                    </label>
                  </div>
                  <NumberField label="Stagger delay" value={activeAction.stagger.delay} min={0} max={1} step={0.01} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, stagger: { ...action.stagger!, delay: clamp(value, 0, 1) } }))} />
                </>
              ) : null}
            </div>
          ) : null}
          {activeAction.category === "loop" ? (
            <div className="property-grid two">
              <label>
                Repeat
                <select value={String(activeAction.repeat?.count ?? "infinite")} onChange={(event) => commit((action) => ({ ...action, repeat: { count: event.currentTarget.value === "infinite" ? "infinite" : Number(event.currentTarget.value), delay: action.repeat?.delay ?? 0 } }))}>
                  <option value="infinite">Infinite</option>
                  <option value="1">1 time</option>
                  <option value="2">2 times</option>
                  <option value="3">3 times</option>
                  <option value="5">5 times</option>
                </select>
              </label>
              <NumberField label="Repeat gap" value={activeAction.repeat?.delay ?? 0} min={0} max={5} step={0.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, repeat: { count: action.repeat?.count ?? "infinite", delay: Math.max(0, value) } }))} />
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function ExportInspector({
  project,
  options,
  onChange,
  exporting,
  progress,
  onExport,
}: {
  project: KurogiProject;
  options: ExportOptions;
  onChange: (options: ExportOptions) => void;
  exporting: boolean;
  progress: ExportProgress | null;
  onExport: () => void;
}) {
  const scene = getActiveScene(project);
  const outputWidth = Math.round(scene.width * options.scale);
  const outputHeight = Math.round(scene.height * options.scale);
  return (
    <div className="inspector-body inspector-scroll export-panel">
      <InspectorHeader eyebrow="Export" title="Render motion" />
      <div className="export-poster">
        <span>◈</span>
        <b>{outputWidth} × {outputHeight}</b>
        <small>{scene.duration.toFixed(2)} seconds · {options.fps} FPS</small>
      </div>
      <section className="property-section">
        <label>
          Format
          <select value={options.format} onChange={(event) => onChange({ ...options, format: event.currentTarget.value as ExportOptions["format"] })}>
            <option value="mp4">MP4 · H.264</option>
            <option value="webm">WebM</option>
            <option value="gif">Animated GIF</option>
            <option value="png-sequence">PNG sequence</option>
          </select>
        </label>
        <label>
          Resolution
          <select value={options.scale} onChange={(event) => onChange({ ...options, scale: Number(event.currentTarget.value) })}>
            <option value="0.5">50% · {Math.round(scene.width * 0.5)} × {Math.round(scene.height * 0.5)}</option>
            <option value="0.6666667">67% · {Math.round(scene.width * 0.6666667)} × {Math.round(scene.height * 0.6666667)}</option>
            <option value="1">100% · {scene.width} × {scene.height}</option>
            <option value="1.5">150% · {Math.round(scene.width * 1.5)} × {Math.round(scene.height * 1.5)}</option>
          </select>
        </label>
        <div className="property-grid two">
          <label>
            Frame rate
            <select value={options.fps} onChange={(event) => onChange({ ...options, fps: Number(event.currentTarget.value) as ExportOptions["fps"] })}>
              <option value="24">24 FPS</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </label>
          <label>
            Quality
            <select value={options.quality} onChange={(event) => onChange({ ...options, quality: event.currentTarget.value as ExportOptions["quality"] })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <label className="toggle-row">
          <span>Transparent background</span>
          <input
            type="checkbox"
            checked={options.transparent}
            disabled={options.format === "mp4" || options.format === "gif"}
            onChange={(event) => onChange({ ...options, transparent: event.currentTarget.checked })}
          />
        </label>
        {options.format === "gif" ? (
          <label>
            GIF loops
            <select value={options.gifLoops ?? "infinite"} onChange={(event) => onChange({ ...options, gifLoops: event.currentTarget.value === "infinite" ? null : Number(event.currentTarget.value) })}>
              <option value="infinite">Infinite</option>
              <option value="0">Play once</option>
              <option value="1">Loop once</option>
              <option value="2">Loop twice</option>
            </select>
          </label>
        ) : null}
      </section>
      {progress ? (
        <div className={`export-progress progress-${progress.phase}`}>
          <div><span>{progress.phase}</span><strong>{Math.round(progress.progress * 100)}%</strong></div>
          <progress max={1} value={progress.progress} />
          <small>{progress.message ?? progressLabel(progress)}</small>
        </div>
      ) : null}
      <button type="button" className="render-btn" disabled={exporting} onClick={onExport}>
        {exporting ? "Rendering…" : "Render & export"} <span>↗</span>
      </button>
      <p className="subtle">Preview and export use the same Remotion composition and deterministic evaluator.</p>
    </div>
  );
}

function InspectorHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="inspector-heading"><span>{eyebrow}</span><strong>{title}</strong></div>;
}

function InspectorEmpty({ title, message }: { title: string; message: string }) {
  return <div className="inspector-empty"><div>◇</div><strong>{title}</strong><p>{message}</p></div>;
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onBegin,
  onFinish,
  onCancel,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onBegin: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      {label}
      <span>
        <input
          type="number"
          value={roundDisplay(value)}
          min={min}
          max={max}
          step={step}
          onFocus={onBegin}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          onBlur={onFinish}
          onKeyDown={(event) => cancelOnEscape(event, onCancel)}
        />
        {suffix ? <i>{suffix}</i> : null}
      </span>
    </label>
  );
}

function ColorField({
  label,
  value,
  onBegin,
  onFinish,
  onChange,
}: {
  label: string;
  value: string;
  onBegin: () => void;
  onFinish: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className="color-field">
      {label}
      <span>
        <input type="color" value={normalizeColor(value)} onPointerDown={onBegin} onFocus={onBegin} onChange={(event) => onChange(event.currentTarget.value)} onBlur={onFinish} />
        <input type="text" value={normalizeColor(value)} onFocus={onBegin} onChange={(event) => onChange(event.currentTarget.value)} onBlur={onFinish} />
      </span>
    </label>
  );
}

function cancelOnEscape(
  event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  cancel: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    event.currentTarget.blur();
  }
  if (event.key === "Enter" && event.currentTarget instanceof HTMLInputElement) {
    event.currentTarget.blur();
  }
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

function hasDirection(type: AnimationType) {
  return ["moveIn", "moveOut", "maskReveal", "maskHide"].includes(type);
}

function hasDistance(type: AnimationType) {
  return type === "moveIn" || type === "moveOut";
}

function hasIntensity(type: AnimationType) {
  return ["pulse", "float", "shake", "breathe", "swing"].includes(type);
}

function defaultIntensity(type: AnimationType) {
  return type === "pulse" || type === "breathe" ? 0.06 : type === "swing" ? 8 : 18;
}

function progressLabel(progress: ExportProgress) {
  if (progress.phase === "preparing") return "Preparing the Remotion bundle";
  if (progress.phase === "encoding") return `Encoding ${progress.encodedFrames ?? 0} frames`;
  if (progress.phase === "completed") return "Export completed";
  if (progress.phase === "failed") return "Export failed";
  return `Rendering ${progress.renderedFrames ?? 0} / ${progress.frameCount ?? 0} frames`;
}

function roundDisplay(value: number) {
  return Number.isInteger(value) ? value : Number(value.toFixed(3));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
