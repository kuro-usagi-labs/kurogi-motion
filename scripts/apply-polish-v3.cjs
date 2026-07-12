const fs = require("fs");

function patch(path, mutate) {
  const source = fs.readFileSync(path, "utf8");
  const next = mutate(source);
  if (next === source) throw new Error(`No changes made to ${path}`);
  fs.writeFileSync(path, next);
}

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label}`);
  return source.replace(before, after);
}

patch("src/app/Editor.tsx", (initial) => {
  let source = initial;
  source = replaceRequired(source, 'import { MotionComposition } from "../MotionComposition";\n', '', "unused composition import");
  source = replaceRequired(source, '  reorderLayer,\n', '', "reorder import");
  source = replaceRequired(source, 'import { saveProject } from "../core/persistence";', 'import { clearDraft, saveDraft, saveProject } from "../core/persistence";', "persistence imports");
  source = replaceRequired(source, 'import { Timeline } from "../editor/TimelineV2";', 'import { Timeline } from "../editor/TimelineV3";', "timeline v3 import");
  source = replaceRequired(source,
    '  const [showSafeArea, setShowSafeArea] = useState(false);',
    '  const [showSafeArea, setShowSafeArea] = useState(false);\n  const [draggedLayerId, setDraggedLayerId] = useState("");\n  const [dragOverLayerId, setDragOverLayerId] = useState("");',
    "layer drag state",
  );

  source = replaceRequired(source, `  useEffect(() => {
    if (!project.settings.autoSave) return;
    setSaveStatus("Saving…");
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(project);
        setSaveStatus(navigator.onLine ? "Saved" : "Offline");
      } catch {
        setSaveStatus("Save failed");
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project]);`, `  useEffect(() => {
    if (!project.settings.autoSave) return;
    setSaveStatus("Saving…");
    const draftTimer = window.setTimeout(() => { void saveDraft(project); }, 220);
    const saveTimer = window.setTimeout(async () => {
      try {
        await saveProject(project);
        await clearDraft(project.id);
        setSaveStatus(navigator.onLine ? "Saved" : "Offline");
      } catch {
        setSaveStatus("Save failed");
      }
    }, 1200);
    return () => {
      window.clearTimeout(draftTimer);
      window.clearTimeout(saveTimer);
    };
  }, [project]);`, "autosave and recovery");

  source = replaceRequired(source, `  function addExistingAsset(assetId: string) {`, `  async function replaceAssetForLayer(layerId: string, file: File) {
    const accepted = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (!accepted.includes(file.type)) {
      window.alert("Use PNG, JPG, WebP, or SVG files.");
      return;
    }
    const maximum = file.type === "image/svg+xml" ? 10 : 20;
    if (file.size > maximum * 1024 * 1024) {
      window.alert(\`This file is larger than \${maximum} MB.\`);
      return;
    }
    const layer = project.layers[layerId];
    if (!layer || (layer.type !== "image" && layer.type !== "svg")) return;
    try {
      const sourceUrl = file.type === "image/svg+xml"
        ? svgToDataUrl(sanitizeSvg(await file.text()))
        : await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(sourceUrl);
      commitProject((current) => {
        const next = cloneProject(current);
        const currentLayer = next.layers[layerId];
        if (!currentLayer || (currentLayer.type !== "image" && currentLayer.type !== "svg")) return current;
        const asset = next.assets[currentLayer.assetId];
        if (!asset) return current;
        next.assets[currentLayer.assetId] = {
          ...asset,
          name: file.name.replace(/\\.[^.]+$/, ""),
          type: file.type === "image/svg+xml" ? "svg" : "image",
          mimeType: file.type,
          width: dimensions.width,
          height: dimensions.height,
          sourceUrl,
          thumbnailUrl: undefined,
        };
        return touchProject(next);
      });
    } catch {
      window.alert("The replacement asset could not be loaded.");
    }
  }

  function addExistingAsset(assetId: string) {`, "replace asset function");

  source = replaceRequired(source, `  function deleteSelectedLayer() {
    if (!selectedLayerId) return;
    const ids = scene.layerIds.filter((id) => id !== selectedLayerId);
    commitProject((current) => removeLayer(current, selectedLayerId));
    setSelectedLayerId(ids.at(-1) ?? "");
    setSelectedActionId("");
  }

  function duplicateSelectedLayer() {
    if (!selectedLayerId) return;
    commitProject((current) => {
      const result = duplicateLayer(current, selectedLayerId);
      window.queueMicrotask(() => setSelectedLayerId(result.layerId));
      return result.project;
    });
    setSelectedActionId("");
  }`, `  function deleteLayerById(layerId: string) {
    if (!layerId) return;
    const ids = scene.layerIds.filter((id) => id !== layerId);
    commitProject((current) => removeLayer(current, layerId));
    if (selectedLayerId === layerId) setSelectedLayerId(ids.at(-1) ?? "");
    setSelectedActionId("");
  }

  function deleteSelectedLayer() {
    deleteLayerById(selectedLayerId);
  }

  function duplicateLayerById(layerId: string) {
    if (!layerId) return;
    commitProject((current) => {
      const result = duplicateLayer(current, layerId);
      window.queueMicrotask(() => setSelectedLayerId(result.layerId));
      return result.project;
    });
    setSelectedActionId("");
  }

  function duplicateSelectedLayer() {
    duplicateLayerById(selectedLayerId);
  }

  function moveLayerByDrop(sourceId: string, targetId: string, aboveInSidebar: boolean) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    commitProject((current) => {
      const next = cloneProject(current);
      const activeScene = getActiveScene(next);
      const ids = activeScene.layerIds;
      const sourceIndex = ids.indexOf(sourceId);
      if (sourceIndex < 0 || !ids.includes(targetId)) return current;
      ids.splice(sourceIndex, 1);
      const targetIndex = ids.indexOf(targetId);
      ids.splice(aboveInSidebar ? targetIndex + 1 : targetIndex, 0, sourceId);
      return touchProject(next);
    });
  }`, "layer operations");

  source = replaceRequired(source, `        await saveProject(project);
        setSaveStatus(navigator.onLine ? "Saved" : "Offline");`, `        await saveProject(project);
        await clearDraft(project.id);
        setSaveStatus(navigator.onLine ? "Saved" : "Offline");`, "manual save draft clear");

  source = replaceRequired(source, '<div className="scene-row"><span>⌄</span><b>{scene.name}</b><small>{scene.width} × {scene.height}</small></div>', '<div className="scene-row"><span><Icon name="chevronDown" size={14} /></span><b>{scene.name}</b><small>{scene.width} × {scene.height}</small></div>', "scene chevron");

  source = replaceRequired(source,
    '<div key={layer.id} className={`layer-row ${selectedLayerId === layer.id ? "selected" : ""}`} onClick={() => selectLayer(layer.id)}>',
    `<div
                      key={layer.id}
                      draggable
                      className={\`layer-row \${selectedLayerId === layer.id ? "selected" : ""} \${dragOverLayerId === layer.id ? "drag-over" : ""}\`}
                      onClick={() => selectLayer(layer.id)}
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest("input,button")) { event.preventDefault(); return; }
                        setDraggedLayerId(layer.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", layer.id);
                      }}
                      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDragOverLayerId(layer.id); }}
                      onDragLeave={() => setDragOverLayerId((current) => current === layer.id ? "" : current)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const sourceId = draggedLayerId || event.dataTransfer.getData("text/plain");
                        const rect = event.currentTarget.getBoundingClientRect();
                        moveLayerByDrop(sourceId, layer.id, event.clientY < rect.top + rect.height / 2);
                        setDraggedLayerId("");
                        setDragOverLayerId("");
                      }}
                      onDragEnd={() => { setDraggedLayerId(""); setDragOverLayerId(""); }}
                    >`,
    "draggable layer row",
  );

  source = replaceRequired(source, `                    <div className="layer-order-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); commitProject((current) => reorderLayer(current, layer.id, "up")); }} title="Move up"><Icon name="chevronUp" size={14} /></button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); commitProject((current) => reorderLayer(current, layer.id, "down")); }} title="Move down"><Icon name="chevronDown" size={14} /></button>
                    </div>
`, '', "remove layer order buttons");

  source = replaceRequired(source, `          onTextCommit={commitText}
        />`, `          onTextCommit={commitText}
          onZoomChange={setZoom}
          onReplaceAsset={(layerId, file) => { void replaceAssetForLayer(layerId, file); }}
          onDuplicateLayer={duplicateLayerById}
          onDeleteLayer={deleteLayerById}
        />`, "canvas callbacks");

  return source;
});

patch("src/editor/InspectorV2.tsx", (initial) => {
  let source = initial;
  source = replaceRequired(source,
    '<option value="mp4">MP4 · H.264</option><option value="webm">WebM</option><option value="gif">Animated GIF</option><option value="png-sequence">PNG sequence</option>',
    '<option value="mp4">MP4 · H.264</option><option value="webm">WebM</option><option value="mov">MOV · ProRes 4444 Alpha</option><option value="gif">Animated GIF</option><option value="png-sequence">PNG sequence</option>',
    "MOV export option",
  );
  return source;
});

patch("src/types.ts", (initial) => replaceRequired(
  initial,
  'export type ExportFormat = "webm" | "mp4" | "gif" | "png-sequence";',
  'export type ExportFormat = "webm" | "mp4" | "mov" | "gif" | "png-sequence";',
  "MOV export type",
));
