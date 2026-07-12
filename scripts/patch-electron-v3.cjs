const fs = require("fs");
const path = "electron/main.cjs";
let source = fs.readFileSync(path, "utf8");

function replaceRequired(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label}`);
  source = source.replace(before, after);
}

replaceRequired(
  '      ...(media.pixelFormat ? { pixelFormat: media.pixelFormat } : {}),',
  '      ...(media.pixelFormat ? { pixelFormat: media.pixelFormat } : {}),\n      ...(media.proResProfile ? { proResProfile: media.proResProfile } : {}),',
  "ProRes render option",
);

replaceRequired(
  '    webm: { extension: "webm", label: "WebM video" },\n    mp4: { extension: "mp4", label: "MP4 video" },\n    gif: { extension: "gif", label: "Animated GIF" },',
  '    webm: { extension: "webm", label: "WebM video" },\n    mp4: { extension: "mp4", label: "MP4 video" },\n    mov: { extension: "mov", label: "MOV ProRes 4444 video" },\n    gif: { extension: "gif", label: "Animated GIF" },',
  "MOV save target",
);

replaceRequired(
  '  if (options.format === "gif") return { codec: "gif", crf: null };',
  '  if (options.format === "gif") return { codec: "gif", crf: null };\n  if (options.format === "mov") {\n    return {\n      codec: "prores",\n      crf: null,\n      imageFormat: "png",\n      pixelFormat: "yuva444p10le",\n      proResProfile: "4444",\n    };\n  }',
  "MOV media settings",
);

replaceRequired(
  '  const allowedFormats = new Set(["mp4", "webm", "gif", "png-sequence"]);',
  '  const allowedFormats = new Set(["mp4", "webm", "mov", "gif", "png-sequence"]);',
  "MOV allowed format",
);

const marker = 'async function getServeUrl() {';
if (!source.includes(marker)) throw new Error("Missing IPC insertion marker");
source = source.replace(marker, `ipcMain.handle("save-kuromotion-file", async (_event, envelope, defaultName) => {
  validateKuroMotionEnvelope(envelope);
  const target = await dialog.showSaveDialog({
    title: "Save Kurogi Motion project",
    defaultPath: String(defaultName || "kurogi-motion.kuromotion"),
    filters: [{ name: "Kurogi Motion project", extensions: ["kuromotion"] }],
  });
  if (target.canceled || !target.filePath) return { canceled: true };
  await fs.promises.writeFile(target.filePath, JSON.stringify(envelope, null, 2), "utf8");
  return { path: target.filePath };
});

ipcMain.handle("open-kuromotion-file", async () => {
  const target = await dialog.showOpenDialog({
    title: "Open Kurogi Motion project",
    properties: ["openFile"],
    filters: [{ name: "Kurogi Motion project", extensions: ["kuromotion"] }],
  });
  if (target.canceled || !target.filePaths[0]) return { canceled: true };
  const filePath = target.filePaths[0];
  const content = await fs.promises.readFile(filePath, "utf8");
  return { path: filePath, content };
});

function validateKuroMotionEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") throw new Error("Invalid .kuromotion document.");
  if (envelope.application !== "Kurogi Motion" || !envelope.project) {
    throw new Error("The file is not a valid Kurogi Motion project.");
  }
}

${marker}`);

fs.writeFileSync(path, source);
