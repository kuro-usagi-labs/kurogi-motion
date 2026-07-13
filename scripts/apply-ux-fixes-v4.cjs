const fs = require("fs");

function patch(path, mutate) {
  const source = fs.readFileSync(path, "utf8");
  const next = mutate(source);
  if (next === source) throw new Error(`No changes made to ${path}`);
  fs.writeFileSync(path, next);
}

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing patch target: ${label}`);
  return source.replace(from, to);
}

patch("src/ui/Icon.tsx", (source) => {
  source = replaceOnce(
    source,
    '  | "polygon" | "arrow" | "restart" | "previous" | "next";',
    '  | "polygon" | "arrow" | "restart" | "previous" | "next" | "grip";',
    "grip icon type",
  );
  return replaceOnce(
    source,
    '  next: <><path d="M18 5v14"/><path d="m6 6 8 6-8 6V6Z"/></>,',
    '  next: <><path d="M18 5v14"/><path d="m6 6 8 6-8 6V6Z"/></>,\n  grip: <><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none"/></>,',
    "grip icon path",
  );
});

patch("src/core/project.ts", (source) => {
  const marker = `export function createTextLayer(`;
  const helper = `export function setSceneLayerOrder(\n  project: KurogiProject,\n  sceneId: string,\n  orderedLayerIds: string[],\n): KurogiProject {\n  const scene = project.scenes[sceneId];\n  if (!scene || orderedLayerIds.length !== scene.layerIds.length) return project;\n  const expected = new Set(scene.layerIds);\n  if (new Set(orderedLayerIds).size !== orderedLayerIds.length) return project;\n  if (orderedLayerIds.some((id) => !expected.has(id))) return project;\n  if (orderedLayerIds.every((id, index) => id === scene.layerIds[index])) return project;\n  const next = cloneProject(project);\n  next.scenes[sceneId].layerIds = [...orderedLayerIds];\n  return touchProject(next);\n}\n\n`;
  if (!source.includes(marker)) throw new Error("Missing setSceneLayerOrder insertion point");
  return source.replace(marker, helper + marker);
});

patch("src/app/Editor.tsx", (source) => {
  source = replaceOnce(source, "  reorderLayer,\n", "  reorderLayer,\n  setSceneLayerOrder,\n", "project reorder import");
  source = replaceOnce(source, 'import { Timeline } from "../editor/TimelineV2";', 'import { Timeline } from "../editor/TimelineV3";', "Timeline V3 import");
  source = replaceOnce(
    source,
    '  const [showSafeArea, setShowSafeArea] = useState(false);',
    '  const [showSafeArea, setShowSafeArea] = useState(false);\n  const [draggedLayerId, setDraggedLayerId] = useState("");\n  const [dragOverLayerId, setDragOverLayerId] = useState("");',
    "layer drag state",
  );

  source = replaceOnce(
    source,
    `  function deleteSelectedLayer() {\n    if (!selectedLayerId) return;\n    const ids = scene.layerIds.filter((id) => id !== selectedLayerId);\n    commitProject((current) => removeLayer(current, selectedLayerId));\n    setSelectedLayerId(ids.at(-1) ?? "");\n    setSelectedActionId("");\n  }\n\n  function duplicateSelectedLayer() {\n    if (!selectedLayerId) return;\n    commitProject((current) => {\n      const result = duplicateLayer(current, selectedLayerId);\n      window.queueMicrotask(() => setSelectedLayerId(result.layerId));\n      return result.project;\n    });\n    setSelectedActionId("");\n  }`,
    `  function deleteLayerById(layerId: string) {\n    if (!layerId) return;\n    const ids = scene.layerIds.filter((id) => id !== layerId);\n    commitProject((current) => removeLayer(current, layerId));\n    setSelectedLayerId(ids.at(-1) ?? "");\n    setSelectedActionId("");\n  }\n\n  function deleteSelectedLayer() {\n    deleteLayerById(selectedLayerId);\n  }\n\n  function duplicateLayerById(layerId: string) {\n    if (!layerId) return;\n    commitProject((current) => {\n      const result = duplicateLayer(current, layerId);\n      window.queueMicrotask(() => setSelectedLayerId(result.layerId));\n      return result.project;\n    });\n    setSelectedActionId("");\n  }\n\n  function duplicateSelectedLayer() {\n    duplicateLayerById(selectedLayerId);\n  }\n\n  function moveLayerByDrop(draggedId: string, targetId: string) {\n    if (!draggedId || !targetId || draggedId === targetId) return;\n    commitProject((current) => {\n      const currentScene = getActiveScene(current);\n      const displayOrder = [...currentScene.layerIds].reverse();\n      const fromIndex = displayOrder.indexOf(draggedId);\n      const targetIndex = displayOrder.indexOf(targetId);\n      if (fromIndex < 0 || targetIndex < 0) return current;\n      displayOrder.splice(fromIndex, 1);\n      displayOrder.splice(targetIndex, 0, draggedId);\n      return setSceneLayerOrder(current, currentScene.id, displayOrder.reverse());\n    });\n  }`,
    "direct layer helpers",
  );

  source = replaceOnce(
    source,
    '                  <div key={layer.id} className={`layer-row ${selectedLayerId === layer.id ? "selected" : ""}`} onClick={() => selectLayer(layer.id)}>',
    '                  <div\n                    key={layer.id}\n                    draggable\n                    className={`layer-row ${selectedLayerId === layer.id ? "selected" : ""} ${draggedLayerId === layer.id ? "is-dragging" : ""} ${dragOverLayerId === layer.id ? "drag-over" : ""}`}\n                    onClick={() => selectLayer(layer.id)}\n                    onDragStart={(event) => { setDraggedLayerId(layer.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", layer.id); }}\n                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverLayerId(layer.id); }}\n                    onDragLeave={() => setDragOverLayerId((current) => current === layer.id ? "" : current)}\n                    onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData("text/plain") || draggedLayerId; moveLayerByDrop(sourceId, layer.id); setDraggedLayerId(""); setDragOverLayerId(""); }}\n                    onDragEnd={() => { setDraggedLayerId(""); setDragOverLayerId(""); }}\n                  >',
    "layer row drag markup",
  );
  source = replaceOnce(
    source,
    '                    <span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span>',
    '                    <span className="layer-drag-grip" title="Drag to reorder"><Icon name="grip" size={15} /></span>\n                    <span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span>',
    "layer drag grip",
  );
  source = replaceOnce(
    source,
    `                    <div className="layer-order-actions">\n                      <button type="button" onClick={(event) => { event.stopPropagation(); commitProject((current) => reorderLayer(current, layer.id, "up")); }} title="Move up"><Icon name="chevronUp" size={14} /></button>\n                      <button type="button" onClick={(event) => { event.stopPropagation(); commitProject((current) => reorderLayer(current, layer.id, "down")); }} title="Move down"><Icon name="chevronDown" size={14} /></button>\n                    </div>\n`,
    "",
    "remove layer order buttons",
  );
  source = replaceOnce(
    source,
    `          onTextCommit={commitText}\n        />`,
    `          onTextCommit={commitText}\n          onZoomChange={setZoom}\n          onDuplicateLayer={duplicateLayerById}\n          onDeleteLayer={deleteLayerById}\n        />`,
    "CanvasStage callbacks",
  );
  return source;
});

patch("src/editor/InspectorV2.tsx", (source) => {
  source = replaceOnce(
    source,
    '<label className="toggle-row"><span>Visible</span><input type="checkbox" checked={layer.visible} onChange={(event) => commit((current) => ({ ...current, visible: event.currentTarget.checked }))} /></label><label className="toggle-row"><span>Locked</span><input type="checkbox" checked={layer.locked} onChange={(event) => commit((current) => ({ ...current, locked: event.currentTarget.checked }))} /></label>',
    '<label className="toggle-row"><span>Visible</span><ToggleSwitch checked={layer.visible} onChange={(checked) => commit((current) => ({ ...current, visible: checked }))} /></label><label className="toggle-row"><span>Locked</span><ToggleSwitch checked={layer.locked} onChange={(checked) => commit((current) => ({ ...current, locked: checked }))} /></label>',
    "layer switches",
  );
  source = replaceOnce(
    source,
    '<label className="toggle-row"><span>Stagger text</span><input type="checkbox" checked={activeAction.stagger?.enabled ?? false} onChange={(event) => commit((action) => ({ ...action, stagger: { enabled: event.currentTarget.checked, unit: action.stagger?.unit ?? "character", delay: action.stagger?.delay ?? .04, order: action.stagger?.order ?? "normal", seed: action.stagger?.seed ?? 42 } }))} /></label>',
    '<label className="toggle-row"><span>Stagger text</span><ToggleSwitch checked={activeAction.stagger?.enabled ?? false} onChange={(checked) => commit((action) => ({ ...action, stagger: { enabled: checked, unit: action.stagger?.unit ?? "character", delay: action.stagger?.delay ?? .04, order: action.stagger?.order ?? "normal", seed: action.stagger?.seed ?? 42 } }))} /></label>',
    "stagger switch",
  );
  source = replaceOnce(
    source,
    '<label className="toggle-row"><span>Transparent background</span><input type="checkbox" checked={options.transparent} disabled={options.format === "mp4" || options.format === "gif"} onChange={(event) => onChange({ ...options, transparent: event.currentTarget.checked })} /></label>',
    '<label className="toggle-row"><span>Transparent background</span><ToggleSwitch checked={options.transparent} disabled={options.format === "mp4" || options.format === "gif"} onChange={(checked) => onChange({ ...options, transparent: checked })} /></label>',
    "export switch",
  );
  const insert = `function ToggleSwitch({ checked, disabled = false, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) { return <span className={\`switch-control \${checked ? "is-on" : ""} \${disabled ? "is-disabled" : ""}\`}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} /><i aria-hidden="true" /></span>; }\n`;
  return replaceOnce(source, "function normalizeColor(value: string)", insert + "function normalizeColor(value: string)", "ToggleSwitch helper");
});

patch("src/app/DashboardV3.tsx", (source) => {
  source = replaceOnce(
    source,
    '<div><span className="eyebrow">TEMPLATE LIBRARY</span><h1>Start polished. Keep everything editable.</h1><p>These previews use the same Remotion composition that opens in the editor.</p></div>',
    '<div><span className="eyebrow">TEMPLATE LIBRARY</span><h1>Ready-made motion, fully editable.</h1><p>Pick a polished starting point, then change every layer, color, word, and action.</p></div>',
    "template hero copy",
  );
  source = replaceOnce(
    source,
    '<label className="dashboard-toggle"><span><strong>Transparent canvas</strong><small>Required for alpha WebM, PNG sequence, and MOV ProRes 4444.</small></span><input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.currentTarget.checked)} /></label>',
    '<label className="dashboard-toggle"><span><strong>Transparent canvas</strong><small>Required for alpha WebM, PNG sequence, and MOV ProRes 4444.</small></span><DashboardSwitch checked={transparent} onChange={setTransparent} /></label>',
    "dashboard transparent switch",
  );
  source = replaceOnce(
    source,
    `function TemplateCardShell({ name, category, description, duration, project, onUse, onDelete }: { name: string; category: string; description: string; duration: number; project: UserTemplateRecord["project"]; onUse: () => void; onDelete?: () => void }) {\n  const scene = getActiveScene(project);\n  return <article className="library-template-card live-template-card">\n    <button type="button" className="live-template-preview-button" onClick={onUse}>\n      <div className="live-template-player">\n        <Player\n          component={MotionComposition}\n          inputProps={{ project, editable: false, showSelection: false, showSafeArea: false }}\n          durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}\n          compositionWidth={scene.width}\n          compositionHeight={scene.height}\n          fps={scene.fps}\n          autoPlay\n          loop\n          controls={false}\n          style={{ width: "100%", height: "100%" }}\n        />\n      </div>\n      <span className="template-duration">{duration}s</span>\n    </button>\n    <div className="library-template-copy"><span><small>{category}</small><strong>{name}</strong><p>{description}</p></span><button type="button" className="template-use-action" onClick={onUse}>Use template <Icon name="arrow" size={15} /></button></div>\n    {onDelete ? <button type="button" className="custom-template-delete" title="Delete custom template" onClick={onDelete}><Icon name="trash" size={14} /></button> : null}\n  </article>;\n}`,
    `function TemplateCardShell({ name, category, description, duration, project, onUse, onDelete }: { name: string; category: string; description: string; duration: number; project: UserTemplateRecord["project"]; onUse: () => void; onDelete?: () => void }) {\n  const scene = getActiveScene(project);\n  const orientation = scene.height > scene.width ? "portrait" : scene.width > scene.height ? "landscape" : "square";\n  const sceneColor = scene.background.type === "solid" ? scene.background.color ?? "#171821" : "#171821";\n  return <article className={\`library-template-card live-template-card template-\${orientation}\`}>\n    <button type="button" className="live-template-preview-button" onClick={onUse}>\n      <div className="live-template-player" style={{ "--template-scene-color": sceneColor } as React.CSSProperties}>\n        <div className="live-template-player-frame" style={{ aspectRatio: \`\${scene.width} / \${scene.height}\` }}>\n          <Player\n            component={MotionComposition}\n            inputProps={{ project, editable: false, showSelection: false, showSafeArea: false }}\n            durationInFrames={Math.max(1, Math.round(scene.duration * scene.fps))}\n            compositionWidth={scene.width}\n            compositionHeight={scene.height}\n            fps={scene.fps}\n            autoPlay\n            loop\n            controls={false}\n            style={{ width: "100%", height: "100%" }}\n          />\n        </div>\n      </div>\n      <span className="template-duration">{duration}s</span>\n    </button>\n    <div className="library-template-copy"><span><small>{category}</small><strong>{name}</strong><p>{description}</p></span><button type="button" className="template-use-action" onClick={onUse}><span>Open template</span><Icon name="arrow" size={15} /></button></div>\n    {onDelete ? <button type="button" className="custom-template-delete" title="Delete custom template" onClick={onDelete}><Icon name="trash" size={14} /></button> : null}\n  </article>;\n}`,
    "template card redesign",
  );
  const helper = `function DashboardSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) { return <span className={\`switch-control \${checked ? "is-on" : ""}\`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><i aria-hidden="true" /></span>; }\n\n`;
  return replaceOnce(source, "function relativeTime(value: string)", helper + "function relativeTime(value: string)", "DashboardSwitch helper");
});

patch("src/core/templateCatalog.ts", (source) => {
  source = source
    .replace('const title = text(scene, "Conversation title", "A QUICK UPDATE", .1, .08, .8, .1, 42, "#17192b");', 'const title = text(scene, "Conversation title", "A QUICK UPDATE", .1, .07, .8, .1, 58, "#17192b");')
    .replace('const messageA = text(scene, "Message text", "Alex · 09:42\\nThe first draft is ready ✨", .13, .285, .57, .1, 28, "#202235");', 'const messageA = text(scene, "Message text", "Alex · 09:42\\nThe first draft is ready ✨", .13, .28, .57, .11, 43, "#202235");')
    .replace('const messageB = text(scene, "Reply text", "Perfect. Let’s make it move.", .3, .55, .57, .08, 29, "#ffffff");', 'const messageB = text(scene, "Reply text", "Perfect. Let’s make it move.", .3, .545, .57, .09, 44, "#ffffff");')
    .replace('const title = text(scene, "Section title", "PRODUCT UPDATE", .1, .12, .8, .08, 34, "#67e8c3");', 'const title = text(scene, "Section title", "PRODUCT UPDATE", .1, .1, .8, .09, 56, "#67e8c3");')
    .replace('const cardLayer = card(scene, "Notification", .08, .34, .84, .23, "#242734", 36);', 'const cardLayer = card(scene, "Notification", .07, .3, .86, .3, "#242734", 44);')
    .replace('const icon = createShapeLayer(scene, "circle", { name: "App icon", position: pos(scene, .13, .385), size: size(scene, .13, .13), fill: "#67e8c3" });', 'const icon = createShapeLayer(scene, "circle", { name: "App icon", position: pos(scene, .12, .37), size: size(scene, .16, .16), fill: "#67e8c3" });')
    .replace('const copy = text(scene, "Notification copy", "Kurogi Motion\\nYour export is ready.", .31, .38, .54, .14, 31, "#f4f5fa");', 'const copy = text(scene, "Notification copy", "Kurogi Motion\\nYour export is ready.", .32, .36, .52, .16, 48, "#f4f5fa");')
    .replace('const time = text(scene, "Notification time", "now", .78, .36, .1, .04, 19, "#9298a8");', 'const time = text(scene, "Notification time", "now", .79, .33, .1, .05, 28, "#9298a8");');
  return source;
});

patch("src/polishV3.css", (source) => source + `\n\n/* UX repair pass v4 */\n.layer-row { grid-template-columns: 22px 28px minmax(0,1fr) 28px 28px !important; }\n.layer-drag-grip { display:grid; width:22px; height:28px; place-items:center; color:#6f6b79; cursor:grab; }\n.layer-row:hover .layer-drag-grip { color:#aaa4b4; }\n.layer-row.is-dragging { opacity:.42; transform:scale(.985); }\n.layer-row.drag-over { background:#3c334f !important; box-shadow:inset 0 2px #aa8cff !important; }\n\n.switch-control { position:relative; display:inline-flex; flex:0 0 auto; width:36px; height:22px; }\n.switch-control input { position:absolute !important; inset:0 !important; z-index:2; width:100% !important; height:100% !important; margin:0 !important; opacity:0 !important; cursor:pointer; }\n.switch-control > i { position:absolute; inset:0; border:1px solid rgba(255,255,255,.13); border-radius:999px; background:#353641; box-shadow:inset 0 1px 2px rgba(0,0,0,.25); transition:background .16s ease,border-color .16s ease; }\n.switch-control > i::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#d9d6df; box-shadow:0 2px 5px rgba(0,0,0,.35); transition:transform .16s cubic-bezier(.2,.8,.2,1),background .16s ease; }\n.switch-control.is-on > i { border-color:#9c80ec; background:#8d6ee5; }\n.switch-control.is-on > i::after { transform:translateX(14px); background:#fff; }\n.switch-control.is-disabled { opacity:.42; }\n.switch-control.is-disabled input { cursor:not-allowed; }\n.inspector input[type="checkbox"], .dashboard-toggle input[type="checkbox"] { appearance:auto !important; }\n\n.timeline-v3 .tracks,\n.timeline-v3 .timeline-lanes,\n.timeline-v3 .clean-track-lane,\n.timeline-v3 .clean-ruler,\n.timeline-v3 .track-lane { background-image:none !important; }\n.timeline-v3 .track-lane::before, .timeline-v3 .track-lane::after, .timeline-v3 .tracks::before, .timeline-v3 .tracks::after { display:none !important; content:none !important; }\n.timeline-v3 .track { border-bottom:1px solid rgba(255,255,255,.045) !important; }\n.timeline-v3 .track:nth-child(even) .clean-track-lane { background:rgba(255,255,255,.008) !important; }\n.timeline-v3 .clean-ruler { background:#15161e !important; }\n.timeline-v3 .clean-ruler span::after { height:4px !important; opacity:.65; }\n.timeline-v3 .playhead { box-shadow:none !important; }\n\n.template-library-hero h1 { max-width:760px; font-size:clamp(38px,4.6vw,64px) !important; line-height:.98; }\n.live-template-preview-button { height:340px !important; background:#111219 !important; }\n.live-template-player { display:grid; width:100%; height:100%; place-items:center; padding:18px; background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--template-scene-color) 46%,transparent),transparent 58%),#12131a; }\n.live-template-player-frame { overflow:hidden; max-width:100%; max-height:100%; border-radius:8px; box-shadow:0 18px 55px rgba(0,0,0,.36); }\n.template-portrait .live-template-player-frame { height:100%; width:auto; }\n.template-square .live-template-player-frame { height:min(100%,306px); width:auto; }\n.template-landscape .live-template-player-frame { width:min(100%,560px); height:auto; }\n.live-template-card .library-template-copy { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:end; gap:18px; min-height:116px; padding:18px 19px !important; }\n.template-use-action { display:inline-flex !important; align-items:center; justify-content:center; gap:8px; min-width:132px; height:36px; padding:0 13px !important; border:1px solid rgba(180,154,252,.28) !important; border-radius:10px !important; color:#efe9ff !important; background:rgba(124,92,255,.16) !important; font-size:10px !important; font-weight:760 !important; cursor:pointer; }\n.template-use-action:hover { border-color:rgba(191,168,255,.55) !important; background:rgba(124,92,255,.28) !important; transform:translateY(-1px); }\n.live-template-card .library-template-copy p { max-width:520px; }\n\n@media (max-width:900px) { .live-template-preview-button { height:300px !important; } .live-template-card .library-template-copy { grid-template-columns:1fr; } .template-use-action { width:100%; } }\n`);
