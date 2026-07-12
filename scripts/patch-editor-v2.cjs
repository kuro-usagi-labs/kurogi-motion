const fs = require("fs");
const path = "src/app/Editor.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label}`);
  source = source.replace(before, after);
}

replaceRequired('import { Player, type PlayerRef } from "@remotion/player";', 'import type { PlayerRef } from "@remotion/player";', "player import");
replaceRequired('import { Inspector, type InspectorTab } from "../editor/Inspector";', 'import { Inspector, type InspectorTab } from "../editor/InspectorV2";\nimport { CanvasStage } from "../editor/CanvasStage";\nimport { Icon, type IconName } from "../ui/Icon";', "inspector import");
replaceRequired('const SIDEBAR_TABS: Array<{ id: SidebarTab; icon: string; label: string }> = [\n  { id: "layers", icon: "▱", label: "Layers" },\n  { id: "assets", icon: "◈", label: "Assets" },\n  { id: "text", icon: "T", label: "Text" },\n  { id: "shapes", icon: "◇", label: "Shapes" },\n  { id: "templates", icon: "✦", label: "Templates" },\n];', 'const SIDEBAR_TABS: Array<{ id: SidebarTab; icon: IconName; label: string }> = [\n  { id: "layers", icon: "layers", label: "Layers" },\n  { id: "assets", icon: "assets", label: "Assets" },\n  { id: "text", icon: "text", label: "Text" },\n  { id: "shapes", icon: "shapes", label: "Shapes" },\n  { id: "templates", icon: "templates", label: "Templates" },\n];', "sidebar tabs");
replaceRequired('<button type="button" className="icon-btn" disabled={!history.canUndo} onClick={history.undo} title="Undo">↶</button>\n          <button type="button" className="icon-btn" disabled={!history.canRedo} onClick={history.redo} title="Redo">↷</button>', '<button type="button" className="icon-btn" disabled={!history.canUndo} onClick={history.undo} title="Undo"><Icon name="undo" size={16} /></button>\n          <button type="button" className="icon-btn" disabled={!history.canRedo} onClick={history.redo} title="Redo"><Icon name="redo" size={16} /></button>', "undo redo");
replaceRequired('<button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.max(25, value - 10))}>−</button>', '<button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.max(25, value - 10))} title="Zoom out"><Icon name="minus" size={15} /></button>', "zoom out");
replaceRequired('<button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.min(150, value + 10))}>+</button>', '<button type="button" className="icon-btn" onClick={() => setZoom((value) => Math.min(150, value + 10))} title="Zoom in"><Icon name="plus" size={15} /></button>', "zoom in");
replaceRequired('<button type="button" className={showSafeArea ? "icon-btn active" : "icon-btn"} onClick={() => setShowSafeArea((value) => !value)} title="Toggle safe area">▣</button>', '<button type="button" className={showSafeArea ? "icon-btn active" : "icon-btn"} onClick={() => setShowSafeArea((value) => !value)} title="Toggle safe area"><Icon name="frame" size={16} /></button>', "safe area");
replaceRequired('<button type="button" className="preview" onClick={togglePlay}>{playing ? "❚❚ Pause" : "▶ Preview"}</button>', '<button type="button" className="preview" onClick={togglePlay}>{playing ? <><Icon name="pause" size={15} />Pause</> : <><Icon name="play" size={15} />Preview</>}</button>', "preview button");
replaceRequired('<button type="button" className="share-button" onClick={() => void copyProjectSnapshot()}>Share</button>', '<button type="button" className="share-button" onClick={() => void copyProjectSnapshot()}><Icon name="share" size={15} />Share</button>', "share button");
replaceRequired('<button type="button" className="export" onClick={() => setInspectorTab("Export")}>Export <span>↗</span></button>', '<button type="button" className="export" onClick={() => setInspectorTab("Export")}>Export <Icon name="export" size={15} /></button>', "export button");
replaceRequired('<b>{item.icon}</b><span>{item.label}</span>', '<b><Icon name={item.icon} size={18} /></b><span>{item.label}</span>', "rail icons");
replaceRequired('<div className="rail-bottom"><button type="button"><b>?</b><span>Help</span></button><div className="avatar">KM</div></div>', '<div className="rail-bottom"><button type="button"><b><Icon name="help" size={18} /></b><span>Help</span></button><div className="avatar">KM</div></div>', "help icon");
replaceRequired('{sidebarTab === "assets" ? <button type="button" onClick={() => assetInputRef.current?.click()}>＋</button> : null}', '{sidebarTab === "assets" ? <button type="button" onClick={() => assetInputRef.current?.click()} aria-label="Import asset"><Icon name="plus" size={16} /></button> : null}', "asset add icon");
replaceRequired('<span className={`layer-thumb ${layer.type}`}>{layer.type === "text" ? "T" : layer.type === "shape" ? "●" : "◇"}</span>', '<span className={`layer-thumb ${layer.type}`}><Icon name={layer.type === "text" ? "text" : layer.type === "shape" ? "shapes" : "assets"} size={13} /></span>', "layer thumbnail");
replaceRequired('{layer.visible ? "◉" : "◌"}', '{layer.visible ? <Icon name="eye" size={14} /> : <Icon name="eyeOff" size={14} />}', "visibility icon");
replaceRequired('{layer.locked ? "▣" : "▢"}', '{layer.locked ? <Icon name="lock" size={13} /> : <Icon name="unlock" size={13} />}', "lock icon");
replaceRequired('title="Move up">↑</button>', 'title="Move up"><Icon name="chevronUp" size={14} /></button>', "move up icon");
replaceRequired('title="Move down">↓</button>', 'title="Move down"><Icon name="chevronDown" size={14} /></button>', "move down icon");
replaceRequired('<button type="button" className="asset-dropzone" onClick={() => assetInputRef.current?.click()}><span>↑</span><strong>Import an asset</strong><small>PNG, JPG, WebP, or sanitized SVG</small></button>', '<button type="button" className="asset-dropzone" onClick={() => assetInputRef.current?.click()}><span><Icon name="upload" size={24} /></span><strong>Import an asset</strong><small>PNG, JPG, WebP, or sanitized SVG</small></button>', "asset upload icon");
replaceRequired('{shape === "rectangle" ? "■" : shape === "circle" ? "●" : shape === "line" ? "━" : shape === "polygon" ? "⬟" : "➜"}', '<Icon name={shape} size={25} />', "shape icons");

const stageStart = source.indexOf('        <section className="stage editor-stage">');
const stageEnd = source.indexOf('        <Inspector', stageStart);
if (stageStart < 0 || stageEnd < 0) throw new Error("Missing canvas stage block");
const replacement = `        <CanvasStage\n          project={project}\n          playerRef={playerRef}\n          selectedLayerId={selectedLayerId}\n          zoom={zoom}\n          playing={playing}\n          showSafeArea={showSafeArea}\n          onSelect={selectLayer}\n          onTransformCommit={commitTransform}\n          onTextCommit={commitText}\n        />\n\n`;
source = source.slice(0, stageStart) + replacement + source.slice(stageEnd);

fs.writeFileSync(path, source);
