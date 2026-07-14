const fs = require("node:fs");

function patch(path, before, after) {
  let source = fs.readFileSync(path, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing build-fix target in ${path}`);
  source = source.replace(before, after);
  fs.writeFileSync(path, source);
}

patch(
  "src/app/Editor.tsx",
  "          onSelectAction={setSelectedActionId}",
  "          onSelectAction={(actionId) => { const owner = findActionOwner(project, actionId); if (owner) selectAction(owner.id, actionId); }}",
);

patch(
  "src/core/project.ts",
  "  const point = (candidate, fallback) => ({ x: Number.isFinite(candidate?.x) ? candidate.x : fallback.x, y: Number.isFinite(candidate?.y) ? candidate.y : fallback.y });",
  "  const point = (candidate: { x?: number; y?: number } | undefined, fallback: { x: number; y: number }) => ({ x: Number.isFinite(candidate?.x) ? candidate!.x! : fallback.x, y: Number.isFinite(candidate?.y) ? candidate!.y! : fallback.y });",
);

console.log("Animation workflow compiler fixes applied.");
