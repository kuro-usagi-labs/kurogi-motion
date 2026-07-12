const fs = require("fs");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Could not find ${label}`);
  return source.replace(before, after);
}

const motionPath = "src/MotionComposition.tsx";
let motion = fs.readFileSync(motionPath, "utf8");
motion = replaceRequired(
  motion,
  "  const [draftLayer, setDraftLayer] = useState<Layer | null>(null);\n  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);",
  "  const [draftLayer, setDraftLayer] = useState<Layer | null>(null);\n  const draftLayerRef = useRef<Layer | null>(null);\n  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);",
  "draft layer state",
);
motion = replaceRequired(
  motion,
  "    setDraftLayer(cloneLayer(layer));",
  "    const initialDraft = cloneLayer(layer);\n    draftLayerRef.current = initialDraft;\n    setDraftLayer(initialDraft);",
  "gesture start draft",
);
motion = replaceRequired(
  motion,
  "    setDraftLayer(next);\n  }\n\n  function finishGesture",
  "    draftLayerRef.current = next;\n    setDraftLayer(next);\n  }\n\n  function finishGesture",
  "gesture move draft",
);
motion = replaceRequired(
  motion,
  "    const finalLayer = draftLayer;\n    setDraftLayer(null);",
  "    const finalLayer = draftLayerRef.current;\n    draftLayerRef.current = null;\n    setDraftLayer(null);",
  "gesture final draft",
);
fs.writeFileSync(motionPath, motion);

const editorPath = "src/app/Editor.tsx";
let editor = fs.readFileSync(editorPath, "utf8");
editor = replaceRequired(
  editor,
  "                      onFocus={() => selectLayer(layer.id)}\n                      onChange={(event) => history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: event.currentTarget.value })))}\n                      onBlur={(event) => renameLayer(layer.id, event.currentTarget.value)}",
  "                      onFocus={() => {\n                        selectLayer(layer.id);\n                        history.beginGesture();\n                      }}\n                      onChange={(event) => history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: event.currentTarget.value })))}\n                      onBlur={(event) => {\n                        const cleanName = event.currentTarget.value.trim();\n                        if (!cleanName) {\n                          history.cancelGesture();\n                          return;\n                        }\n                        if (cleanName !== event.currentTarget.value) {\n                          history.preview((current) => updateLayer(current, layer.id, (candidate) => ({ ...candidate, name: cleanName })));\n                        }\n                        history.finishGesture();\n                      }}\n                      onKeyDown={(event) => {\n                        if (event.key === \"Enter\") event.currentTarget.blur();\n                        if (event.key === \"Escape\") {\n                          event.preventDefault();\n                          history.cancelGesture();\n                          event.currentTarget.blur();\n                        }\n                      }}",
  "layer rename input",
);
fs.writeFileSync(editorPath, editor);
