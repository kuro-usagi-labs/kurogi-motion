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
import { Icon, animationIconName } from "../ui/Icon";
import { AnimationPresetDialog } from "./AnimationPresetDialog";
import { CubicBezierEditor } from "./CubicBezierEditor";
import { defaultMotionPath } from "./MotionPathOverlay";
import { EffectsPanel } from "./EffectsPanel";
import { presetFor } from "./animationPresets";
import { estimateAutoFitFontSize } from "../core/projectValidation";

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
  onPreviewAction: (layerId: string, actionId: string, updater: (action: AnimationAction) => AnimationAction) => void;
  onCommitAction: (layerId: string, actionId: string, updater: (action: AnimationAction) => AnimationAction) => void;
  onAddAction: (category: AnimationCategory, type: AnimationType) => void;
  onSelectAction: (actionId: string) => void;
  onDeleteAction: (actionId: string) => void;
  onDuplicateAction: (actionId: string) => void;
  onSavePreset: () => void;
  onApplyCustomPreset: (presetId: string) => void;
  onDeleteCustomPreset: (presetId: string) => void;
  exportOptions: ExportOptions;
  onExportOptionsChange: (options: ExportOptions) => void;
  exporting: boolean;
  exportProgress: ExportProgress | null;
  onExport: () => void;
}

export function Inspector(props: InspectorProps) {
  return (
    <aside className="inspector inspector-v2">
      <div className="inspector-tabs">
        {(["Design", "Animation"] as const).map((candidate) => (
          <button type="button" key={candidate} className={props.tab === candidate ? "active" : ""} onClick={() => props.onTabChange(candidate)}>{candidate}</button>
        ))}
      </div>
      {props.tab === "Design" ? (
        <DesignInspector
          layer={props.selectedLayer}
          onBegin={props.onBeginPropertyEdit}
          onFinish={props.onFinishPropertyEdit}
          onCancel={props.onCancelPropertyEdit}
          onPreview={props.onPreviewLayer}
          onCommit={props.onCommitLayer}
        />
      ) : null}
      {props.tab === "Animation" ? (
        <AnimationInspector
          project={props.project}
          layer={props.selectedLayer}
          selectedAction={props.selectedAction}
          onBegin={props.onBeginPropertyEdit}
          onFinish={props.onFinishPropertyEdit}
          onCancel={props.onCancelPropertyEdit}
          onPreview={props.onPreviewAction}
          onCommit={props.onCommitAction}
          onAddAction={props.onAddAction}
          onSelectAction={props.onSelectAction}
          onDeleteAction={props.onDeleteAction}
          onDuplicateAction={props.onDuplicateAction}
          onSavePreset={props.onSavePreset}
          onApplyCustomPreset={props.onApplyCustomPreset}
          onDeleteCustomPreset={props.onDeleteCustomPreset}
        />
      ) : null}
      {props.tab === "Export" ? (
        <ExportInspector
          project={props.project}
          options={props.exportOptions}
          onChange={props.onExportOptionsChange}
          exporting={props.exporting}
          progress={props.exportProgress}
          onExport={props.onExport}
        />
      ) : null}
    </aside>
  );
}

function DesignInspector({ layer, onBegin, onFinish, onCancel, onPreview, onCommit }: {
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
  const number = (label: string, value: number, change: (current: Layer, value: number) => Layer, options: Partial<NumberFieldProps> = {}) => (
    <NumberField label={label} value={value} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(next) => preview((current) => change(current, next))} {...options} />
  );

  return (
    <div className="inspector-body inspector-scroll compact-inspector-body">
      <InspectorHeader eyebrow={layer.type} title={layer.name} />

      <section className="property-section compact-property-section">
        <div className="section-label">Transform</div>
        <div className="property-grid two">
          {number("X", layer.position.x, (current, value) => ({ ...current, position: { ...current.position, x: value } }))}
          {number("Y", layer.position.y, (current, value) => ({ ...current, position: { ...current.position, y: value } }))}
          {number("Width", layer.size.width, (current, value) => ({ ...current, size: { ...current.size, width: Math.max(1, value) } }), { min: 1 })}
          {number("Height", layer.size.height, (current, value) => ({ ...current, size: { ...current.size, height: Math.max(1, value) } }), { min: 1 })}
          {number("Rotation", layer.rotation, (current, value) => ({ ...current, rotation: value }))}
          {number("Opacity", layer.opacity * 100, (current, value) => ({ ...current, opacity: clamp(value / 100, 0, 1) }), { min: 0, max: 100, suffix: "%" })}
          {number("Scale X", layer.scale.x, (current, value) => ({ ...current, scale: { ...current.scale, x: value } }), { step: .01 })}
          {number("Scale Y", layer.scale.y, (current, value) => ({ ...current, scale: { ...current.scale, y: value } }), { step: .01 })}
        </div>
      </section>

      {layer.type === "text" ? (
        <section className="property-section compact-property-section">
          <div className="section-label">Typography</div>
          <label>Content<textarea value={layer.text} onFocus={onBegin} onChange={(event) => preview((current) => {
            if (current.type !== "text") return current;
            const next = { ...current, text: event.currentTarget.value };
            return next.style.autoFit ? { ...next, style: { ...next.style, fontSize: estimateAutoFitFontSize(next) } } : next;
          })} onBlur={onFinish} onKeyDown={(event) => escapeField(event, onCancel)} /></label>
          <label>Font family<select value={layer.style.fontFamily} onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, fontFamily: event.currentTarget.value } } : current)}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Trebuchet MS</option></select></label>
          <div className="property-grid two">
            <NumberField label="Font size" value={layer.style.fontSize} min={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, fontSize: Math.max(1, value) } } : current)} />
            <label>Weight<select value={layer.style.fontWeight} onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, fontWeight: Number(event.currentTarget.value) } } : current)}><option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extra bold</option></select></label>
            <NumberField label="Line height" value={layer.style.lineHeight} min={.1} step={.05} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, lineHeight: Math.max(.1, value) } } : current)} />
            <NumberField label="Letter spacing" value={layer.style.letterSpacing} step={.1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, letterSpacing: value } } : current)} />
          </div>
          <div className="property-grid two">
            <label>Horizontal<select value={layer.style.align} onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, align: event.currentTarget.value as "left" | "center" | "right" } } : current)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
            <label>Vertical<select value={layer.style.verticalAlign ?? "middle"} onChange={(event) => commit((current) => current.type === "text" ? { ...current, style: { ...current.style, verticalAlign: event.currentTarget.value as "top" | "middle" | "bottom" } } : current)}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
          </div>
          <ColorField label="Color" value={layer.style.color} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, color: value } } : current)} />
          <div className="property-grid two">
            <ColorField label="Text stroke" value={normalizeColor(layer.style.stroke ?? "#000000")} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, stroke: value } } : current)} />
            <NumberField label="Stroke width" value={layer.style.strokeWidth ?? 0} min={0} max={40} step={.5} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "text" ? { ...current, style: { ...current.style, strokeWidth: Math.max(0, value) } } : current)} />
          </div>
          <label className="toggle-row"><span>Auto-fit text</span><ToggleSwitch checked={Boolean(layer.style.autoFit)} onChange={(checked) => commit((current) => {
            if (current.type !== "text") return current;
            const next = { ...current, style: { ...current.style, autoFit: checked } };
            return checked ? { ...next, style: { ...next.style, fontSize: estimateAutoFitFontSize(next) } } : next;
          })} /></label>
        </section>
      ) : null}

      {layer.type === "shape" ? (
        <section className="property-section compact-property-section">
          <div className="section-label">Shape style</div>
          <label>Shape<select value={layer.shape} onChange={(event) => commit((current) => current.type === "shape" ? { ...current, shape: event.currentTarget.value as typeof current.shape } : current)}><option value="rectangle">Rectangle</option><option value="circle">Circle</option><option value="line">Line</option><option value="polygon">Polygon</option><option value="arrow">Arrow</option></select></label>
          <div className="property-grid two">
            <ColorField label="Fill" value={layer.style.fill} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, fill: value } } : current)} />
            <ColorField label="Stroke" value={normalizeColor(layer.style.stroke)} onBegin={onBegin} onFinish={onFinish} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, stroke: value } } : current)} />
            <NumberField label="Stroke width" value={layer.style.strokeWidth} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, strokeWidth: Math.max(0, value) } } : current)} />
            <NumberField label="Radius" value={layer.style.borderRadius} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, borderRadius: Math.max(0, value) } } : current)} />
            <NumberField label="Shadow" value={layer.style.shadow} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, shadow: Math.max(0, value) } } : current)} />
            <NumberField label="Blur" value={layer.style.blur} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((current) => current.type === "shape" ? { ...current, style: { ...current.style, blur: Math.max(0, value) } } : current)} />
          </div>
        </section>
      ) : null}

      {layer.type === "image" ? (
        <section className="property-section compact-property-section">
          <div className="section-label">Image</div>
          <label>Fit<select value={layer.fit} onChange={(event) => commit((current) => current.type === "image" ? { ...current, fit: event.currentTarget.value as typeof current.fit } : current)}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option></select></label>
        </section>
      ) : null}

      <EffectsPanel layer={layer} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onPreview={preview} onCommit={commit} />
    </div>
  );
}

function AnimationInspector({ project, layer, selectedAction, onBegin, onFinish, onCancel, onPreview, onCommit, onAddAction, onSelectAction, onDeleteAction, onDuplicateAction, onSavePreset, onApplyCustomPreset, onDeleteCustomPreset }: {
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
  onSavePreset: () => void;
  onApplyCustomPreset: (presetId: string) => void;
  onDeleteCustomPreset: (presetId: string) => void;
}) {
  const [category, setCategory] = useState<AnimationCategory>(selectedAction?.category ?? "in");
  const [browserOpen, setBrowserOpen] = useState(false);
  const scene = getActiveScene(project);
  useEffect(() => { if (selectedAction) setCategory(selectedAction.category); }, [selectedAction?.id, selectedAction?.category]);
  const actions = useMemo(() => layer?.animationActions.filter((action) => action.category === category) ?? [], [category, layer]);
  if (!layer) return <InspectorEmpty title="Select a layer" message="Choose a layer, then add an In, Loop, or Out action." />;
  const activeAction = selectedAction?.layerId === layer.id && selectedAction.category === category ? selectedAction : actions[0] ?? null;
  const preview = (updater: (action: AnimationAction) => AnimationAction) => activeAction && onPreview(layer.id, activeAction.id, updater);
  const commit = (updater: (action: AnimationAction) => AnimationAction) => activeAction && onCommit(layer.id, activeAction.id, updater);
  const categoryLabel = category === "in" ? "In" : category === "loop" ? "Loop" : "Out";

  return (
    <div className="inspector-body inspector-scroll animation-inspector compact-animation-inspector">
      <InspectorHeader eyebrow="Animation" title={layer.name} />
      <div className="animation-category-tabs">
        {(["in", "loop", "out"] as const).map((candidate) => (
          <button type="button" key={candidate} className={category === candidate ? "active" : ""} onClick={() => setCategory(candidate)}>
            {candidate === "in" ? "In" : candidate === "loop" ? "Loop" : "Out"}<span>{layer.animationActions.filter((action) => action.category === candidate).length}</span>
          </button>
        ))}
      </div>

      <button type="button" className={`open-preset-browser preset-${category}`} onClick={() => setBrowserOpen(true)}>
        <span><Icon name="sparkles" size={19} /><span><strong>{actions.length ? `Add another ${categoryLabel} animation` : `Choose ${categoryLabel} animation`}</strong><small>Open live preset previews</small></span></span><Icon name="plus" size={18} />
      </button>

      {actions.length ? (
        <section className="property-section compact-property-section">
          <div className="section-label">{categoryLabel} actions</div>
          <div className="action-chip-list">
            {actions.map((action) => (
              <button type="button" key={action.id} className={activeAction?.id === action.id ? "active" : ""} onClick={() => onSelectAction(action.id)}>
                <span className={`action-chip-icon preset-${action.category}`}><Icon name={animationIconName(action.type)} size={15} /></span>
                <span><strong>{presetFor(action.type).label}</strong><small>{(action.startTime + action.delay).toFixed(2)}s · {action.duration.toFixed(2)}s</small></span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="animation-empty-state"><Icon name={category === "loop" ? "pulse" : category === "out" ? "export" : "move"} size={22} /><span>No {categoryLabel} animation yet</span></div>
      )}

      {activeAction ? (
        <section className="property-section action-editor compact-action-editor">
          <div className="action-editor-title">
            <span><small>{activeAction.category.toUpperCase()}</small><strong>{presetFor(activeAction.type).label}</strong></span>
            <span><button type="button" className="svg-button" title="Save reusable preset" onClick={onSavePreset}><Icon name="sparkles" size={14} /></button><button type="button" className="svg-button" title="Duplicate action" onClick={() => onDuplicateAction(activeAction.id)}><Icon name="copy" size={14} /></button><button type="button" className="svg-button danger-text" title="Delete action" onClick={() => onDeleteAction(activeAction.id)}><Icon name="trash" size={14} /></button></span>
          </div>
          <div className="property-grid two">
            <NumberField label="Start" value={activeAction.startTime} min={0} max={scene.duration} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, startTime: clamp(value, 0, scene.duration) }))} />
            <NumberField label="Duration" value={activeAction.duration} min={.05} max={scene.duration} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, duration: clamp(value, .05, scene.duration) }))} />
            <NumberField label="Delay" value={activeAction.delay} min={0} max={scene.duration} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, delay: clamp(value, 0, scene.duration) }))} />
            <label>Easing<select value={activeAction.easing} onChange={(event) => commit((action) => ({ ...action, easing: event.currentTarget.value as AnimationAction["easing"] }))}><option value="linear">Linear</option><option value="easeIn">Ease in</option><option value="easeOut">Ease out</option><option value="easeInOut">Ease in out</option><option value="backIn">Back in</option><option value="backOut">Back out</option><option value="overshoot">Overshoot</option><option value="bounce">Bounce</option><option value="elastic">Elastic</option><option value="custom">Custom cubic Bezier</option></select></label>
          </div>
          {activeAction.easing === "custom" ? <CubicBezierEditor value={activeAction.easingCurve ?? { x1: .25, y1: .1, x2: .25, y2: 1 }} onBegin={onBegin} onPreview={(curve) => preview((action) => ({ ...action, easing: "custom", easingCurve: curve }))} onFinish={onFinish} /> : null}
          {activeAction.groupId ? <div className="action-group-name">Grouped as {project.animationGroups[activeAction.groupId]?.name ?? "Animation group"}</div> : null}
          {activeAction.type === "counter" && layer.type === "text" ? <div className="property-grid two"><NumberField label="From" value={Number(activeAction.parameters.from ?? 0)} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, from: value } }))} /><NumberField label="To" value={Number(activeAction.parameters.to ?? 100)} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, to: value } }))} /><NumberField label="Decimals" value={Number(activeAction.parameters.decimals ?? 0)} min={0} max={6} step={1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, decimals: Math.round(clamp(value, 0, 6)) } }))} /><label>Prefix<input value={String(activeAction.parameters.prefix ?? "")} onChange={(event) => commit((action) => ({ ...action, parameters: { ...action.parameters, prefix: event.currentTarget.value } }))} /></label><label>Suffix<input value={String(activeAction.parameters.suffix ?? "")} onChange={(event) => commit((action) => ({ ...action, parameters: { ...action.parameters, suffix: event.currentTarget.value } }))} /></label></div> : null}
          {activeAction.type === "motionPath" ? <div><label className="toggle-row"><span>Orient to path</span><ToggleSwitch checked={activeAction.motionPath?.orientToPath ?? false} onChange={(checked) => commit((action) => ({ ...action, motionPath: { ...(action.motionPath ?? defaultMotionPath()), orientToPath: checked } }))} /></label><div className="motion-path-fields">{(["start","control1","control2","end"] as const).flatMap((point) => ([<NumberField key={`${point}-x`} label={`${point} X`} value={(activeAction.motionPath ?? defaultMotionPath())[point].x} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, motionPath: { ...(action.motionPath ?? defaultMotionPath()), [point]: { ...(action.motionPath ?? defaultMotionPath())[point], x: value } } }))} />,<NumberField key={`${point}-y`} label={`${point} Y`} value={(activeAction.motionPath ?? defaultMotionPath())[point].y} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, motionPath: { ...(action.motionPath ?? defaultMotionPath()), [point]: { ...(action.motionPath ?? defaultMotionPath())[point], y: value } } }))} />]))}</div><small>Drag the four Bezier handles directly on the active canvas.</small></div> : null}
          {hasDirection(activeAction.type) ? <label>Direction<select value={String(activeAction.parameters.direction ?? "up")} onChange={(event) => commit((action) => ({ ...action, parameters: { ...action.parameters, direction: event.currentTarget.value } }))}><option value="up">Up</option><option value="down">Down</option><option value="left">Left</option><option value="right">Right</option></select></label> : null}
          {hasDistance(activeAction.type) ? <NumberField label="Distance" value={Number(activeAction.parameters.distance ?? 120)} min={0} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, distance: Math.max(0, value) } }))} /> : null}
          {hasIntensity(activeAction.type) ? <NumberField label="Intensity" value={Number(activeAction.parameters.intensity ?? defaultIntensity(activeAction.type))} min={0} step={usesFractionalIntensity(activeAction.type) ? .01 : 1} onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, intensity: Math.max(0, value) } }))} /> : null}
          {layer.type === "text" ? (
            <div className="stagger-panel">
              <label className="toggle-row"><span>Stagger text</span><ToggleSwitch checked={activeAction.stagger?.enabled ?? false} onChange={(checked) => commit((action) => ({ ...action, stagger: { enabled: checked, unit: action.stagger?.unit ?? "character", delay: action.stagger?.delay ?? .04, order: action.stagger?.order ?? "normal", seed: action.stagger?.seed ?? 42 } }))} /></label>
              {activeAction.stagger?.enabled ? (
                <>
                  <div className="property-grid two">
                    <label>Unit<select value={activeAction.stagger.unit} onChange={(event) => commit((action) => ({ ...action, stagger: { ...action.stagger!, unit: event.currentTarget.value as NonNullable<AnimationAction["stagger"]>["unit"] } }))}><option value="line">Line</option><option value="word">Word</option><option value="character">Character</option></select></label>
                    <label>Order<select value={activeAction.stagger.order} onChange={(event) => commit((action) => ({ ...action, stagger: { ...action.stagger!, order: event.currentTarget.value as NonNullable<AnimationAction["stagger"]>["order"] } }))}><option value="normal">Normal</option><option value="reverse">Reverse</option><option value="center">Center outward</option><option value="edges">Edges inward</option><option value="random">Random seeded</option></select></label>
                  </div>
                  <NumberField label="Stagger delay" value={activeAction.stagger.delay} min={0} max={1} step={.01} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, stagger: { ...action.stagger!, delay: clamp(value, 0, 1) } }))} />
                </>
              ) : null}
            </div>
          ) : null}
          {activeAction.category === "loop" ? (
            <div className="property-grid two">
              <label>Repeat<select value={String(activeAction.repeat?.count ?? "infinite")} onChange={(event) => commit((action) => ({ ...action, repeat: { count: event.currentTarget.value === "infinite" ? "infinite" : Number(event.currentTarget.value), delay: action.repeat?.delay ?? 0 } }))}><option value="infinite">Infinite</option><option value="1">1 time</option><option value="2">2 times</option><option value="3">3 times</option><option value="5">5 times</option></select></label>
              <NumberField label="Blend in" value={Number(activeAction.parameters.blendIn ?? Math.min(.28, activeAction.duration * .2))} min={0} max={2} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, parameters: { ...action.parameters, blendIn: clamp(value, 0, 2) } }))} />
              <NumberField label="Repeat gap" value={activeAction.repeat?.delay ?? 0} min={0} max={5} step={.05} suffix="s" onBegin={onBegin} onFinish={onFinish} onCancel={onCancel} onChange={(value) => preview((action) => ({ ...action, repeat: { count: action.repeat?.count ?? "infinite", delay: Math.max(0, value) } }))} />
            </div>
          ) : null}
        </section>
      ) : null}

      {browserOpen ? (
        <AnimationPresetDialog
          project={project}
          layer={layer}
          initialCategory={category}
          onClose={() => setBrowserOpen(false)}
          onChoose={(nextCategory, type) => {
            setCategory(nextCategory);
            onAddAction(nextCategory, type);
            setBrowserOpen(false);
          }}
          onChooseCustom={(presetId) => { onApplyCustomPreset(presetId); setBrowserOpen(false); }}
          onDeleteCustom={onDeleteCustomPreset}
        />
      ) : null}
    </div>
  );
}

function ExportInspector({ project, options, onChange, exporting, progress, onExport }: { project: KurogiProject; options: ExportOptions; onChange: (options: ExportOptions) => void; exporting: boolean; progress: ExportProgress | null; onExport: () => void }) {
  const scene = getActiveScene(project);
  const outputWidth = Math.round(scene.width * options.scale);
  const outputHeight = Math.round(scene.height * options.scale);
  return (
    <div className="inspector-body inspector-scroll export-panel compact-inspector-body">
      <InspectorHeader eyebrow="Export" title="Render motion" />
      <div className="export-poster"><Icon name="export" size={21} /><b>{outputWidth} × {outputHeight}</b><small>{scene.duration.toFixed(2)} seconds · {options.fps} FPS</small></div>
      <section className="property-section compact-property-section">
        <label>Format<select value={options.format} onChange={(event) => onChange({ ...options, format: event.currentTarget.value as ExportOptions["format"] })}><option value="mp4">MP4 · H.264</option><option value="webm">WebM</option><option value="gif">Animated GIF</option><option value="png-sequence">PNG sequence</option></select></label>
        <label>Resolution<select value={options.scale} onChange={(event) => onChange({ ...options, scale: Number(event.currentTarget.value) })}><option value={.5}>50%</option><option value={.6666667}>67%</option><option value={1}>100%</option><option value={1.5}>150%</option></select></label>
        <div className="property-grid two"><label>Frame rate<select value={options.fps} onChange={(event) => onChange({ ...options, fps: Number(event.currentTarget.value) as ExportOptions["fps"] })}><option value={24}>24 FPS</option><option value={30}>30 FPS</option><option value={60}>60 FPS</option></select></label><label>Quality<select value={options.quality} onChange={(event) => onChange({ ...options, quality: event.currentTarget.value as ExportOptions["quality"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>
        <label className="toggle-row"><span>Transparent background</span><ToggleSwitch checked={options.transparent} disabled={options.format === "mp4" || options.format === "gif"} onChange={(checked) => onChange({ ...options, transparent: checked })} /></label>
      </section>
      {progress ? <div className={`export-progress progress-${progress.phase}`}><div><span>{progress.phase}</span><strong>{Math.round(progress.progress * 100)}%</strong></div><progress max={1} value={progress.progress} /><small>{progress.message}</small></div> : null}
      <button type="button" className="render-btn" disabled={exporting} onClick={onExport}>{exporting ? "Rendering…" : "Export motion"}<Icon name="export" size={16} /></button>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBegin: () => void;
  onFinish: () => void;
  onCancel: () => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

function NumberField({ label, value, onChange, onBegin, onFinish, onCancel, min, max, step = .1, suffix }: NumberFieldProps) {
  return <label className="number-field">{label}<span><input type="number" value={Number.isFinite(value) ? Number(value.toFixed(4)) : 0} min={min} max={max} step={step} onFocus={onBegin} onChange={(event) => onChange(Number(event.currentTarget.value))} onBlur={onFinish} onKeyDown={(event) => escapeField(event, onCancel)} />{suffix ? <i>{suffix}</i> : null}</span></label>;
}

function ColorField({ label, value, onChange, onBegin, onFinish }: { label: string; value: string; onChange: (value: string) => void; onBegin: () => void; onFinish: () => void }) {
  return <label className="color-field">{label}<span><input type="color" value={normalizeColor(value)} onFocus={onBegin} onChange={(event) => onChange(event.currentTarget.value)} onBlur={onFinish} /><input value={value} onFocus={onBegin} onChange={(event) => onChange(event.currentTarget.value)} onBlur={onFinish} /></span></label>;
}

function InspectorHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="inspector-heading"><span>{eyebrow}</span><strong>{title}</strong></div>;
}

function InspectorEmpty({ title, message }: { title: string; message: string }) {
  return <div className="inspector-empty"><div><Icon name="layers" size={28} /></div><strong>{title}</strong><p>{message}</p></div>;
}

function escapeField(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, cancel: () => void) {
  if (event.key === "Enter" && event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur();
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    event.currentTarget.blur();
  }
}

function ToggleSwitch({ checked, disabled = false, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <span className={`switch-control ${checked ? "is-on" : ""} ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} /><i aria-hidden="true" /></span>;
}

function normalizeColor(value: string) { return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"; }
function hasDirection(type: AnimationType) { return ["moveIn", "slideIn", "dropIn", "rollIn", "maskReveal", "wipeIn", "moveOut", "slideOut", "dropOut", "rollOut", "maskHide", "wipeOut"].includes(type); }
function hasDistance(type: AnimationType) { return ["moveIn", "slideIn", "dropIn", "rollIn", "moveOut", "slideOut", "dropOut", "rollOut"].includes(type); }
function hasIntensity(type: AnimationType) { return ["pulse", "float", "shake", "breathe", "swing", "hover", "wobble", "heartbeat", "drift", "orbit", "wave", "jiggle", "glowPulse", "ripple", "liquid"].includes(type); }
function usesFractionalIntensity(type: AnimationType) { return ["pulse", "breathe", "wobble", "heartbeat", "ripple", "liquid"].includes(type); }
function defaultIntensity(type: AnimationType) { if (["pulse", "breathe", "wobble", "heartbeat", "ripple", "liquid"].includes(type)) return .07; if (["float", "hover", "drift", "orbit", "wave", "glowPulse"].includes(type)) return 18; if (["shake", "jiggle"].includes(type)) return 10; return 8; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
