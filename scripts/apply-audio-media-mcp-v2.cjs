const fs = require("node:fs");

function read(path) { return fs.readFileSync(path, "utf8"); }
function write(path, content) { fs.writeFileSync(path, content); }
function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    console.warn(`Skipping missing patch anchor: ${label}`);
    return source;
  }
  return source.replace(from, to);
}
function replaceRegex(source, pattern, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!pattern.test(source)) {
    console.warn(`Skipping missing regex anchor: ${label}`);
    return source;
  }
  return source.replace(pattern, replacement);
}

{
  const path = "src/types.ts";
  let source = read(path);
  source = source.replace("export const PROJECT_VERSION = 6;", "export const PROJECT_VERSION = 7;");
  source = replaceOnce(source, "  layerIds: string[];\n}", "  layerIds: string[];\n  audioClipIds: string[];\n}", "scene audio clip IDs");
  source = replaceOnce(source, '  type: "image" | "svg" | "font";', '  type: "image" | "svg" | "font" | "audio";', "audio asset type");
  source = replaceOnce(source, "  height?: number;\n  sourceUrl: string;", "  height?: number;\n  duration?: number;\n  sourceUrl: string;", "asset duration");
  source = replaceOnce(source, "export interface AnimationGroup {", `export interface AudioClip {\n  id: string;\n  sceneId: string;\n  assetId: string;\n  name: string;\n  startTime: number;\n  trimStart: number;\n  duration: number;\n  volume: number;\n  muted: boolean;\n  fadeIn: number;\n  fadeOut: number;\n  playbackRate: number;\n}\n\nexport interface AnimationGroup {`, "audio clip type");
  source = replaceOnce(source, "  assets: Record<string, ProjectAsset>;\n  animationGroups:", "  assets: Record<string, ProjectAsset>;\n  audioClips: Record<string, AudioClip>;\n  animationGroups:", "project audio clips");
  write(path, source);
}

{
  const path = "src/core/project.ts";
  let source = read(path);
  source = replaceOnce(source, "    layerIds: [],\n  };", "    layerIds: [],\n    audioClipIds: [],\n  };", "initial scene audio clips");
  source = replaceOnce(source, "    assets: {},\n    animationGroups:", "    assets: {},\n    audioClips: {},\n    animationGroups:", "initial project audio clips");
  source = replaceOnce(source, '  if (asset.type === "font") throw new Error("Font assets cannot be placed as visual layers.");', '  if (asset.type === "font" || asset.type === "audio") throw new Error("Font and audio assets cannot be placed as visual layers.");', "reject audio visual layers");
  source = replaceOnce(source, "  next.animationPresets = next.animationPresets ?? {};\n  next.settings", "  next.animationPresets = next.animationPresets ?? {};\n  next.audioClips = next.audioClips ?? {};\n  next.settings", "normalize audio collection");
  source = replaceOnce(source, "    scene.layerIds = scene.layerIds.filter((id) => Boolean(next.layers[id]));\n  }", "    scene.layerIds = scene.layerIds.filter((id) => Boolean(next.layers[id]));\n    scene.audioClipIds = (scene.audioClipIds ?? []).filter((id) => Boolean(next.audioClips[id]));\n  }", "normalize scene audio IDs");
  source = replaceOnce(source, "  return next;\n}\n\nfunction isV2Project", `  for (const [clipId, clip] of Object.entries(next.audioClips)) {\n    const scene = next.scenes[clip.sceneId];\n    const asset = next.assets[clip.assetId];\n    if (!scene || !asset || asset.type !== "audio") {\n      delete next.audioClips[clipId];\n      continue;\n    }\n    clip.name = clip.name?.trim() || asset.name || "Audio clip";\n    clip.startTime = clampNumber(clip.startTime ?? 0, 0, Math.max(0, scene.duration - .05));\n    clip.trimStart = clampNumber(clip.trimStart ?? 0, 0, Math.max(0, (asset.duration ?? 0) - .01));\n    clip.playbackRate = clampNumber(clip.playbackRate ?? 1, .25, 4);\n    const sourceDuration = asset.duration && asset.duration > clip.trimStart ? (asset.duration - clip.trimStart) / clip.playbackRate : scene.duration - clip.startTime;\n    clip.duration = clampNumber(clip.duration ?? sourceDuration, .05, Math.max(.05, Math.min(scene.duration - clip.startTime, sourceDuration)));\n    clip.volume = clampNumber(clip.volume ?? 1, 0, 2);\n    clip.muted = Boolean(clip.muted);\n    clip.fadeIn = clampNumber(clip.fadeIn ?? 0, 0, clip.duration);\n    clip.fadeOut = clampNumber(clip.fadeOut ?? 0, 0, clip.duration);\n  }\n  for (const scene of Object.values(next.scenes)) scene.audioClipIds = (scene.audioClipIds ?? []).filter((id) => Boolean(next.audioClips[id]));\n  return next;\n}\n\nfunction isV2Project`, "sanitize audio clips");
  write(path, source);
}

{
  const path = "src/core/sceneWorkspace.ts";
  let source = read(path);
  source = replaceOnce(source, 'import type { KurogiProject, Layer, Scene } from "../types";', 'import type { AudioClip, KurogiProject, Layer, Scene } from "../types";', "audio scene type import");
  source = replaceOnce(source, "    layerIds: [],\n    workspace:", "    layerIds: [],\n    audioClipIds: [],\n    workspace:", "new scene audio IDs");
  source = replaceOnce(source, "  const layerMap = new Map<string, string>();\n  const sourceLayers", "  const layerMap = new Map<string, string>();\n  const audioMap = new Map<string, string>();\n  const sourceLayers", "duplicate scene audio map");
  source = replaceOnce(source, "  for (const layer of sourceLayers) layerMap.set(layer.id, createId(\"layer\"));\n\n  const copiedLayers", "  for (const layer of sourceLayers) layerMap.set(layer.id, createId(\"layer\"));\n  const sourceAudio = (sourceScene.audioClipIds ?? []).map((clipId) => prepared.audioClips[clipId]).filter((clip): clip is AudioClip => Boolean(clip));\n  for (const clip of sourceAudio) audioMap.set(clip.id, createId(\"audio\"));\n\n  const copiedLayers", "duplicate audio source");
  source = replaceOnce(source, "  for (const layer of copiedLayers) next.layers[layer.id] = layer;\n\n  const copiedScene", "  for (const layer of copiedLayers) next.layers[layer.id] = layer;\n  for (const clip of sourceAudio) {\n    const clipId = audioMap.get(clip.id)!;\n    next.audioClips[clipId] = { ...cloneProject(clip), id: clipId, sceneId: id };\n  }\n\n  const copiedScene", "duplicate audio records");
  source = replaceOnce(source, "    layerIds: sourceScene.layerIds.map((layerId) => layerMap.get(layerId)).filter(Boolean) as string[],\n    workspace:", "    layerIds: sourceScene.layerIds.map((layerId) => layerMap.get(layerId)).filter(Boolean) as string[],\n    audioClipIds: (sourceScene.audioClipIds ?? []).map((clipId) => audioMap.get(clipId)).filter(Boolean) as string[],\n    workspace:", "duplicate scene audio IDs");
  source = replaceOnce(source, "  for (const [layerId, layer] of Object.entries(next.layers)) {\n    if (layer.sceneId === sceneId) delete next.layers[layerId];\n  }\n  delete next.scenes[sceneId];", "  for (const [layerId, layer] of Object.entries(next.layers)) {\n    if (layer.sceneId === sceneId) delete next.layers[layerId];\n  }\n  for (const [clipId, clip] of Object.entries(next.audioClips)) {\n    if (clip.sceneId === sceneId) delete next.audioClips[clipId];\n  }\n  delete next.scenes[sceneId];", "remove scene audio clips");
  write(path, source);
}

{
  const path = "src/core/projectFiles.ts";
  let source = read(path);
  source = replaceOnce(source, 'import type { KurogiProject, Layer, ProjectAsset, Scene } from "../types";', 'import type { AudioClip, KurogiProject, Layer, ProjectAsset, Scene } from "../types";', "project file audio type");
  source = replaceOnce(source, "  const assetIds = new Map<string, string>();\n\n  for (const id of Object.keys(normalized.scenes))", "  const assetIds = new Map<string, string>();\n  const audioClipIds = new Map<string, string>();\n\n  for (const id of Object.keys(normalized.scenes))", "project file audio ID map");
  source = replaceOnce(source, "  for (const id of Object.keys(normalized.assets)) assetIds.set(id, createId(\"asset\"));", "  for (const id of Object.keys(normalized.assets)) assetIds.set(id, createId(\"asset\"));\n  for (const id of Object.keys(normalized.audioClips ?? {})) audioClipIds.set(id, createId(\"audio\"));", "map project audio IDs");
  source = replaceOnce(source, "      layerIds: scene.layerIds.map((layerId) => layerIds.get(layerId)).filter(Boolean) as string[],\n    };", "      layerIds: scene.layerIds.map((layerId) => layerIds.get(layerId)).filter(Boolean) as string[],\n      audioClipIds: (scene.audioClipIds ?? []).map((clipId) => audioClipIds.get(clipId)).filter(Boolean) as string[],\n    };", "instantiate scene audio IDs");
  source = replaceOnce(source, "  const layers: Record<string, Layer> = {};", "  const audioClips: Record<string, AudioClip> = {};\n  for (const clip of Object.values(normalized.audioClips ?? {})) {\n    const id = audioClipIds.get(clip.id)!;\n    audioClips[id] = {\n      ...cloneProject(clip),\n      id,\n      sceneId: sceneIds.get(clip.sceneId) ?? clip.sceneId,\n      assetId: assetIds.get(clip.assetId) ?? clip.assetId,\n    };\n  }\n\n  const layers: Record<string, Layer> = {};", "instantiate audio clips");
  source = replaceOnce(source, "    assets,\n  };", "    assets,\n    audioClips,\n  };", "return instantiated audio clips");
  source = replaceOnce(source, "    if (!Array.isArray(sceneValue.layerIds) || sceneValue.layerIds.some((id) => typeof id !== \"string\")) return false;", "    if (!Array.isArray(sceneValue.layerIds) || sceneValue.layerIds.some((id) => typeof id !== \"string\")) return false;\n    if (sceneValue.audioClipIds !== undefined && (!Array.isArray(sceneValue.audioClipIds) || sceneValue.audioClipIds.some((id) => typeof id !== \"string\"))) return false;", "validate audio clip IDs");
  source = replaceOnce(source, "  for (const layer of Object.values(project.layers)) {\n    if (!project.scenes[layer.sceneId]) throw new Error(`Layer ${layer.name || layer.id} references a missing scene.`);\n  }", "  for (const layer of Object.values(project.layers)) {\n    if (!project.scenes[layer.sceneId]) throw new Error(`Layer ${layer.name || layer.id} references a missing scene.`);\n  }\n  for (const clip of Object.values(project.audioClips ?? {})) {\n    if (!project.scenes[clip.sceneId]) throw new Error(`Audio clip ${clip.name || clip.id} references a missing scene.`);\n    if (project.assets[clip.assetId]?.type !== \"audio\") throw new Error(`Audio clip ${clip.name || clip.id} references a missing audio asset.`);\n  }", "audio integrity validation");
  write(path, source);
}

{
  const path = "src/MotionComposition.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import { useCurrentFrame, useVideoConfig } from "remotion";', 'import { Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";', "Remotion audio imports");
  source = replaceOnce(source, 'import { getActiveScene, getSceneLayers } from "./core/project";', 'import { getActiveScene, getSceneLayers } from "./core/project";\nimport { audioClipVolumeAt, getSceneAudioClips } from "./core/audio";', "composition audio helpers");
  source = replaceOnce(source, "      <style>{projectFontFaceCss(project)}</style>\n      {editable", "      <style>{projectFontFaceCss(project)}</style>\n      <AudioTracks project={project} />\n      {editable", "render composition audio");
  source = replaceOnce(source, "function AnimatedText({ layer, scene, time }", `function AudioTracks({ project }: { project: KurogiProject }) {\n  const frame = useCurrentFrame();\n  const { fps } = useVideoConfig();\n  return <>\n    {getSceneAudioClips(project).map((clip) => {\n      const asset = project.assets[clip.assetId];\n      if (!asset?.sourceUrl || asset.type !== "audio") return null;\n      const from = Math.max(0, Math.round(clip.startTime * fps));\n      const durationInFrames = Math.max(1, Math.round(clip.duration * fps));\n      return <Sequence key={clip.id} from={from} durationInFrames={durationInFrames} name={clip.name}>\n        <Audio\n          src={asset.sourceUrl}\n          startFrom={Math.max(0, Math.round(clip.trimStart * fps))}\n          playbackRate={clip.playbackRate}\n          volume={audioClipVolumeAt(clip, frame / fps)}\n          muted={clip.muted}\n        />\n      </Sequence>;\n    })}\n  </>;\n}\n\nfunction AnimatedText({ layer, scene, time }`, "audio track component");
  write(path, source);
}

{
  const path = "src/editor/TimelineV3.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import type { AnimationAction, KurogiProject, StaggerOrder } from "../types";', 'import type { AnimationAction, AudioClip, KurogiProject, StaggerOrder } from "../types";\nimport { AudioClipToolbar, AudioTimelineTracks } from "./AudioTimeline";', "timeline audio imports");
  source = replaceOnce(source, "  selectedActionIds: string[];\n  onSelectLayer:", "  selectedActionIds: string[];\n  selectedAudioClipId: string;\n  onSelectLayer:", "timeline selected audio prop");
  source = replaceOnce(source, "  onSavePreset: () => void;\n  canPaste:", "  onSavePreset: () => void;\n  onSelectAudioClip: (clipId: string) => void;\n  onUpdateAudioClip: (clipId: string, patch: Partial<AudioClip>) => void;\n  onDeleteAudioClip: (clipId: string) => void;\n  onDuplicateAudioClip: (clipId: string) => void;\n  canPaste:", "timeline audio callbacks");
  source = replaceOnce(source, "  selectedActionIds,\n  onSelectLayer,", "  selectedActionIds,\n  selectedAudioClipId,\n  onSelectLayer,", "timeline audio destructuring");
  source = replaceOnce(source, "  onSavePreset,\n  canPaste,", "  onSavePreset,\n  onSelectAudioClip,\n  onUpdateAudioClip,\n  onDeleteAudioClip,\n  onDuplicateAudioClip,\n  canPaste,", "timeline audio callback destructuring");
  source = replaceOnce(source, "  const selectedAction = findAction(project, primaryActionId);", "  const selectedAction = findAction(project, primaryActionId);\n  const selectedAudioClip = selectedAudioClipId ? project.audioClips[selectedAudioClipId] ?? null : null;", "selected audio clip");
  source = replaceOnce(source, "  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {", "  function seekToTime(time: number) {\n    const targetFrame = Math.min(Math.max(0, Math.round(time * scene.fps)), Math.max(0, Math.round(scene.duration * scene.fps) - 1));\n    playerRef.current?.seekTo(targetFrame);\n    setFrame(targetFrame);\n  }\n\n  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {", "timeline seek helper");
  source = replaceOnce(source, "    const targetFrame = Math.min(Math.max(0, Math.round(time * scene.fps)), Math.max(0, Math.round(scene.duration * scene.fps) - 1));\n    playerRef.current?.seekTo(targetFrame);\n    setFrame(targetFrame);", "    seekToTime(time);", "reuse timeline seek");
  source = replaceOnce(source, "        <div className=\"timeline-selection-actions animation-selection-expanded\">\n          <AnimationWorkflowBar", "        <div className=\"timeline-selection-actions animation-selection-expanded\">\n          {selectedAudioClip ? <AudioClipToolbar project={project} selectedClipId={selectedAudioClipId} onUpdate={onUpdateAudioClip} onDelete={onDeleteAudioClip} onDuplicate={onDuplicateAudioClip} /> : <AnimationWorkflowBar", "audio timeline toolbar open");
  source = replaceOnce(source, "            onSavePreset={onSavePreset}\n          />\n          {selectedAction ?", "            onSavePreset={onSavePreset}\n          />}\n          {!selectedAudioClip && selectedAction ?", "audio timeline toolbar close");
  source = replaceOnce(source, "          <div className=\"playhead\" style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}><i /></div>\n          {[...layers]", "          <div className=\"playhead\" style={{ left: LABEL_WIDTH + (frame / Math.max(1, scene.duration * scene.fps)) * laneWidth }}><i /></div>\n          <AudioTimelineTracks project={project} laneWidth={laneWidth} labelWidth={LABEL_WIDTH} selectedClipId={selectedAudioClipId} onSelect={onSelectAudioClip} onUpdate={onUpdateAudioClip} onDelete={onDeleteAudioClip} onDuplicate={onDuplicateAudioClip} onSeek={seekToTime} />\n          {[...layers]", "audio timeline tracks");
  write(path, source);
}

{
  const path = "src/ui/Icon.tsx";
  let source = read(path);
  source = replaceOnce(source, '  | "restart" | "previous" | "next" | "grip";', '  | "restart" | "previous" | "next" | "grip" | "audio";', "audio icon type");
  source = replaceOnce(source, "  grip: <><circle", "  audio: <><path d=\"M9 18V5l10-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"16\" cy=\"16\" r=\"3\"/></>,\n  grip: <><circle", "audio icon path");
  write(path, source);
}

{
  const path = "src/main.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import "./mcp.css";', 'import "./mcp.css";\nimport "./audio.css";', "audio CSS import");
  write(path, source);
}

{
  const path = "electron/preload.cjs";
  let source = read(path);
  source = replaceOnce(source, '  getMcpInfo: () => ipcRenderer.invoke("mcp-info"),', '  getMcpInfo: () => ipcRenderer.invoke("mcp-info"),\n  readMcpMediaFile: (filePath) => ipcRenderer.invoke("read-mcp-media-file", filePath),', "preload media file reader");
  write(path, source);
}

{
  const path = "src/vite-env.d.ts";
  let source = read(path);
  source = replaceOnce(source, "      options: import(\"./types\").ExportOptions,", "      options: import(\"./types\").ExportOptions & { outputPath?: string },", "direct export options type");
  source = replaceOnce(source, "    getMcpInfo: () => Promise<", "    readMcpMediaFile: (filePath: string) => Promise<{ name: string; mimeType: string; bytes: Uint8Array; byteSize: number }>;\n    getMcpInfo: () => Promise<", "MCP media reader type");
  write(path, source);
}

{
  const path = "electron/main.cjs";
  let source = read(path);
  source = replaceOnce(source, "  const target = await chooseExportTarget(project.name, options.format);", "  const target = await chooseExportTarget(project.name, options.format, options.outputPath);", "direct export target");
  source = replaceOnce(source, 'ipcMain.handle("save-kuromotion-file", async (_event, envelope, defaultName) => {', `ipcMain.handle("read-mcp-media-file", async (_event, requestedPath) => {\n  if (typeof requestedPath !== "string" || !path.isAbsolute(requestedPath)) throw new Error("MCP media import requires an absolute file path.");\n  const stats = await fs.promises.stat(requestedPath);\n  if (!stats.isFile()) throw new Error("The MCP media path is not a file.");\n  if (stats.size > 250 * 1024 * 1024) throw new Error("MCP media files are limited to 250 MB.");\n  const extension = path.extname(requestedPath).toLowerCase();\n  const mimeTypes = {\n    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",\n    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".webm": "audio/webm",\n  };\n  const mimeType = mimeTypes[extension];\n  if (!mimeType) throw new Error("Unsupported MCP media file. Use PNG, JPG, WebP, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio.");\n  const bytes = await fs.promises.readFile(requestedPath);\n  return { name: path.basename(requestedPath), mimeType, bytes, byteSize: bytes.length };\n});\n\nipcMain.handle("save-kuromotion-file", async (_event, envelope, defaultName) => {`, "MCP media file IPC");
  source = replaceOnce(source, "async function chooseExportTarget(projectName, format) {\n  if (format === \"png-sequence\") {", "async function chooseExportTarget(projectName, format, requestedPath) {\n  if (requestedPath) {\n    if (!path.isAbsolute(requestedPath)) throw new Error(\"Direct export paths must be absolute.\");\n    if (format === \"png-sequence\") { await fs.promises.mkdir(requestedPath, { recursive: true }); return requestedPath; }\n    const extensions = { mp4: \".mp4\", webm: \".webm\", mov: \".mov\", gif: \".gif\" };\n    const expected = extensions[format] || \".mp4\";\n    if (path.extname(requestedPath).toLowerCase() !== expected) throw new Error(`Export path must end with ${expected}.`);\n    await fs.promises.mkdir(path.dirname(requestedPath), { recursive: true });\n    return requestedPath;\n  }\n  if (format === \"png-sequence\") {", "direct export path handling");
  source = replaceOnce(source, "    gifLoops: raw.gifLoops === null ? null : Math.max(0, Number(raw.gifLoops) || 0),\n  };", "    gifLoops: raw.gifLoops === null ? null : Math.max(0, Number(raw.gifLoops) || 0),\n    outputPath: typeof raw.outputPath === \"string\" && raw.outputPath.trim() ? raw.outputPath.trim() : undefined,\n  };", "normalize direct export path");
  write(path, source);
}

{
  const path = "src/app/Editor.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import { clearDraft, listProjectSummaries, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";', 'import { clearDraft, listProjectSummaries, prepareProjectForExport, saveDraft, saveProject, storeAssetBlob } from "../core/persistence";\nimport { createAudioClip, duplicateAudioClip, removeAudioClip, updateAudioClip } from "../core/audio";', "editor audio imports");
  source = replaceOnce(source, "  AnimationAction,\n  AnimationCategory,", "  AnimationAction,\n  AnimationCategory,\n  AudioClip,", "editor audio type");
  source = replaceOnce(source, "  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);", "  const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);\n  const [selectedAudioClipId, setSelectedAudioClipId] = useState(\"\");", "selected audio state");
  source = replaceOnce(source, "      if (request.method === \"project.save\") {", `      if (request.method === "asset.import_file") {\n        const params = request.params ?? {};\n        const filePath = String(params.path ?? "");\n        if (!filePath) throw new Error("path is required.");\n        const allowed = window.confirm(`An MCP client wants to import media from:\\n${filePath}\\n\\nAllow this file to be read and added to the project?`);\n        if (!allowed) throw new Error("The user denied the MCP media import.");\n        const payload = await window.kurogi?.readMcpMediaFile(filePath);\n        if (!payload) throw new Error("Desktop media import is unavailable.");\n        const file = new File([payload.bytes], payload.name, { type: payload.mimeType });\n        const imported = await importAsset(file, { sceneId: typeof params.sceneId === "string" ? params.sceneId : undefined, addToTimeline: params.addToTimeline !== false });\n        respond({ id: request.id, ok: true, result: imported });\n        return;\n      }\n      if (request.method === "project.save") {`, "MCP file import handling");
  source = replaceOnce(source, "        const result = await window.kurogi.exportVideo(snapshot, options);", "        const outputPath = typeof params.outputPath === \"string\" && params.outputPath.trim() ? params.outputPath.trim() : undefined;\n        if (outputPath && !window.confirm(`An MCP client wants to export the active project to:\\n${outputPath}\\n\\nAllow this export?`)) throw new Error(\"The user denied the MCP export.\");\n        const result = await window.kurogi.exportVideo(snapshot, { ...options, outputPath });", "MCP direct export");
  source = replaceOnce(source, "          if (outcome.selectedLayerId) selectOnly(outcome.selectedLayerId);\n          else if (outcome.activeSceneId)", "          if (outcome.selectedAudioClipId) selectAudioClip(outcome.selectedAudioClipId);\n          else if (outcome.selectedLayerId) selectOnly(outcome.selectedLayerId);\n          else if (outcome.activeSceneId)", "MCP audio selection");
  source = replaceOnce(source, "  function selectOnly(layerId: string) {\n    setPrimaryLayerId(layerId);", "  function selectOnly(layerId: string) {\n    setSelectedAudioClipId(\"\");\n    setPrimaryLayerId(layerId);", "clear audio selection on layer select");
  source = replaceOnce(source, "  function selectLayer(layerId: string, additive = false) {", "  function selectAudioClip(clipId: string) {\n    setPrimaryLayerId(\"\");\n    setSelectedLayerIds([]);\n    setOnlyAction(\"\");\n    setSelectedAudioClipId(clipId);\n  }\n\n  function updateAudioClipById(clipId: string, patch: Partial<AudioClip>) { commitProject((current) => updateAudioClip(current, clipId, patch)); }\n  function deleteAudioClipById(clipId: string) { commitProject((current) => removeAudioClip(current, clipId)); setSelectedAudioClipId((current) => current === clipId ? \"\" : current); }\n  function duplicateAudioClipById(clipId: string) {\n    commitProject((current) => { const result = duplicateAudioClip(current, clipId); window.queueMicrotask(() => selectAudioClip(result.clipId)); return result.project; });\n  }\n\n  function selectLayer(layerId: string, additive = false) {", "audio editor callbacks");
  source = replaceRegex(source, /  async function importAsset\(file\?: File\) \{[\s\S]*?\n  \}\n\n  function addExistingAsset/, `  async function importAsset(file?: File, options: { sceneId?: string; addToTimeline?: boolean } = {}) {\n    if (!file) return { imported: false };\n    const mimeType = normalizeMediaMime(file.name, file.type);\n    const accepted = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "audio/mpeg", "audio/wav", "audio/mp4", "audio/aac", "audio/ogg", "audio/webm"];\n    if (!accepted.includes(mimeType)) {\n      window.alert("Use PNG, JPG, WebP, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio files.");\n      return { imported: false };\n    }\n    const isAudio = mimeType.startsWith("audio/");\n    const maximum = isAudio ? 120 : mimeType === "image/svg+xml" ? 10 : 20;\n    if (file.size > maximum * 1024 * 1024) { window.alert(`This file is larger than ${maximum} MB.`); return { imported: false }; }\n\n    let temporaryUrl = "";\n    try {\n      const blob = mimeType === "image/svg+xml" ? new Blob([sanitizeSvg(await file.text())], { type: mimeType }) : new Blob([file], { type: mimeType });\n      temporaryUrl = URL.createObjectURL(blob);\n      const metadata = isAudio ? { duration: await readAudioDuration(temporaryUrl) } : await readImageDimensions(temporaryUrl);\n      URL.revokeObjectURL(temporaryUrl); temporaryUrl = "";\n      const current = cloneProject(history.projectRef.current);\n      const targetSceneId = options.sceneId && current.scenes[options.sceneId] ? options.sceneId : current.activeSceneId;\n      const assetId = createId("asset");\n      const stored = await storeAssetBlob(current.id, assetId, blob);\n      const asset: ProjectAsset = {\n        id: assetId, projectId: current.id, name: file.name.replace(/\\.[^.]+$/, ""),\n        type: isAudio ? "audio" : mimeType === "image/svg+xml" ? "svg" : "image", mimeType,\n        ...(isAudio ? { duration: metadata.duration } : { width: metadata.width, height: metadata.height }),\n        sourceUrl: stored.sourceUrl, storage: "blob", blobId: stored.blobId, byteSize: stored.byteSize,\n      };\n      current.assets[asset.id] = asset;\n      if (isAudio) {\n        if (options.addToTimeline === false) { history.commit(() => touchProject(current)); setSidebarTab("assets"); return { imported: true, assetId }; }\n        const result = createAudioClip(current, targetSceneId, assetId);\n        history.commit(() => result.project);\n        window.queueMicrotask(() => selectAudioClip(result.clipId));\n        setSidebarTab("assets");\n        return { imported: true, assetId, audioClipId: result.clipId, sceneId: targetSceneId };\n      }\n      const layer = createAssetLayer(current.scenes[targetSceneId], asset);\n      layer.animationActions.push(createAnimationAction(layer.id, "in", "scaleIn", { duration: .65, easing: "backOut" }));\n      const next = addLayers(current, [layer]);\n      history.commit(() => next);\n      window.queueMicrotask(() => selectOnly(layer.id));\n      setSidebarTab("layers");\n      return { imported: true, assetId, layerId: layer.id, sceneId: targetSceneId };\n    } catch (error) {\n      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);\n      window.alert(error instanceof Error ? error.message : "The asset could not be imported.");\n      return { imported: false };\n    }\n  }\n\n  function addExistingAsset`, "replace media importer");
  source = replaceOnce(source, "    if (!asset || asset.type === \"font\") return;\n    const layer = createAssetLayer(scene, asset);", "    if (!asset || asset.type === \"font\") return;\n    if (asset.type === \"audio\") {\n      commitProject((current) => { const result = createAudioClip(current, scene.id, asset.id); window.queueMicrotask(() => selectAudioClip(result.clipId)); return result.project; });\n      return;\n    }\n    const layer = createAssetLayer(scene, asset);", "add existing audio asset");
  source = replaceOnce(source, '        accept="image/png,image/jpeg,image/webp,image/svg+xml"', '        accept="image/png,image/jpeg,image/webp,image/svg+xml,audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/webm,.mp3,.wav,.m4a,.aac,.ogg,.oga"', "audio file input accept");
  source = replaceOnce(source, "<small>PNG, JPG, WebP, or sanitized SVG</small>", "<small>Images, SVG, MP3, WAV, M4A, AAC, OGG, or WebM audio</small>", "asset dropzone formats");
  source = replaceOnce(source, "                ) : (\n                  <button type=\"button\" key={asset.id} onClick={() => addExistingAsset(asset.id)}><img", "                ) : asset.type === \"audio\" ? (\n                  <button type=\"button\" className=\"asset-audio-card\" key={asset.id} onClick={() => addExistingAsset(asset.id)}><strong><Icon name=\"audio\" size={20} /></strong><span>{asset.name}</span><small>{asset.duration ? `${asset.duration.toFixed(2)}s` : \"Audio\"}</small></button>\n                ) : (\n                  <button type=\"button\" key={asset.id} onClick={() => addExistingAsset(asset.id)}><img", "audio asset card");
  source = replaceOnce(source, "        selectedActionIds={selectedActionIds}\n        onSelectLayer", "        selectedActionIds={selectedActionIds}\n        selectedAudioClipId={selectedAudioClipId}\n        onSelectLayer", "timeline selected audio wiring");
  source = replaceOnce(source, "        onSavePreset={saveSelectedAnimationPreset}\n        canPaste", "        onSavePreset={saveSelectedAnimationPreset}\n        onSelectAudioClip={selectAudioClip}\n        onUpdateAudioClip={updateAudioClipById}\n        onDeleteAudioClip={deleteAudioClipById}\n        onDuplicateAudioClip={duplicateAudioClipById}\n        canPaste", "timeline audio callback wiring");
  source = replaceOnce(source, "function readImageDimensions(sourceUrl: string): Promise<{ width: number; height: number }> {", "function readAudioDuration(sourceUrl: string): Promise<number> {\n  return new Promise((resolve, reject) => {\n    const audio = new Audio();\n    audio.preload = \"metadata\";\n    audio.onloadedmetadata = () => resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 1);\n    audio.onerror = () => reject(new Error(\"Audio metadata could not be read.\"));\n    audio.src = sourceUrl;\n  });\n}\n\nfunction normalizeMediaMime(name: string, supplied: string) {\n  if (supplied && supplied !== \"application/octet-stream\") return supplied;\n  const extension = name.split(\".\").pop()?.toLowerCase();\n  return ({ png: \"image/png\", jpg: \"image/jpeg\", jpeg: \"image/jpeg\", webp: \"image/webp\", svg: \"image/svg+xml\", mp3: \"audio/mpeg\", wav: \"audio/wav\", m4a: \"audio/mp4\", aac: \"audio/aac\", ogg: \"audio/ogg\", oga: \"audio/ogg\", webm: \"audio/webm\" } as Record<string, string>)[extension ?? \"\"] ?? supplied;\n}\n\nfunction readImageDimensions(sourceUrl: string): Promise<{ width: number; height: number }> {", "audio metadata helpers");
  write(path, source);
}

{
  const path = "package.json";
  const value = JSON.parse(read(path));
  value.scripts["audit:audio-mcp"] = "node scripts/audit-audio-mcp.mjs";
  if (!value.scripts.audit.includes("audit:audio-mcp")) value.scripts.audit += " && npm run audit:audio-mcp";
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

{
  const path = ".github/workflows/ci.yml";
  let source = read(path);
  source = replaceOnce(source, "      - name: Audit effect renderer", "      - name: Audit audio media and MCP authoring\n        shell: bash\n        run: |\n          set -o pipefail\n          npm run audit:audio-mcp 2>&1 | tee audio-mcp-audit.log\n\n      - name: Audit effect renderer", "audio MCP CI step");
  source = replaceOnce(source, "            mcp-audit.log\n            effect-audit.log", "            mcp-audit.log\n            audio-mcp-audit.log\n            effect-audit.log", "audio audit diagnostics");
  write(path, source);
}

console.log("Audio media and MCP V2 patch applied.");
