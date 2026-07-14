const fs = require("node:fs");

const path = "src/editor/MultiSceneCanvasStage.tsx";
let source = fs.readFileSync(path, "utf8");

function replace(before, after) {
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Missing multiscene patch target: ${before.slice(0, 180)}`);
  }
  source = source.replace(before, after);
}

replace(
  `  const scenes = Object.values(project.scenes);\n  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;`,
  `  const scenes = Object.values(project.scenes);\n  const workspaceBounds = getSceneWorkspaceBounds(project);\n  const workspacePadding = 240;\n  const workspaceOrigin = {\n    x: workspaceBounds.left - workspacePadding,\n    y: workspaceBounds.top - workspacePadding,\n  };\n  const workspaceSize = {\n    width: Math.max(1, workspaceBounds.width + workspacePadding * 2),\n    height: Math.max(1, workspaceBounds.height + workspacePadding * 2),\n  };\n  const selectedLayer = selectedLayerId ? project.layers[selectedLayerId] ?? null : null;`,
);

replace(
  `  function fitAllScenes() {\n    const bounds = getSceneWorkspaceBounds(project);\n    const horizontalPadding = 160;\n    const verticalPadding = 180;\n    const scale = clamp(\n      Math.min(\n        (available.width - horizontalPadding) / Math.max(1, bounds.width),\n        (available.height - verticalPadding) / Math.max(1, bounds.height),\n      ),\n      0.05,\n      2.5,\n    );\n    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };\n    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });\n  }`,
  `  function fitAllScenes() {\n    const horizontalPadding = 160;\n    const verticalPadding = 180;\n    const scale = clamp(\n      Math.min(\n        (available.width - horizontalPadding) / Math.max(1, workspaceBounds.width),\n        (available.height - verticalPadding) / Math.max(1, workspaceBounds.height),\n      ),\n      0.05,\n      2.5,\n    );\n    const center = {\n      x: workspaceBounds.left + workspaceBounds.width / 2 - workspaceOrigin.x,\n      y: workspaceBounds.top + workspaceBounds.height / 2 - workspaceOrigin.y,\n    };\n    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });\n  }`,
);

replace(
  `    const center = { x: position.x + scene.width / 2, y: position.y + scene.height / 2 };\n    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });`,
  `    const center = {\n      x: position.x + scene.width / 2 - workspaceOrigin.x,\n      y: position.y + scene.height / 2 - workspaceOrigin.y,\n    };\n    setView(scale * 100, { x: -center.x * scale, y: -center.y * scale });`,
);

replace(
  `        <div className="workspace-pan-shell" style={{ transform: \`translate3d(\${pan.x}px, \${pan.y}px, 0)\` }}>\n          <div className="workspace-scale-shell" style={{ transform: \`scale(\${viewScale})\` }}>\n            {scenes.map((scene) => {`,
  `        <div\n          className="workspace-world"\n          data-workspace-world="true"\n          style={{\n            width: workspaceSize.width,\n            height: workspaceSize.height,\n            transform: \`translate3d(\${pan.x}px, \${pan.y}px, 0) scale(\${viewScale})\`,\n          }}\n        >\n            {scenes.map((scene) => {`,
);

replace(
  `                  style={{ left: position.x, top: position.y, width: scene.width, height: scene.height }}`,
  `                  style={{\n                    left: position.x - workspaceOrigin.x,\n                    top: position.y - workspaceOrigin.y,\n                    width: scene.width,\n                    height: scene.height,\n                  }}`,
);

replace(
  `            })}\n          </div>\n        </div>\n      </div>\n\n      <div className="workspace-help">`,
  `            })}\n        </div>\n      </div>\n\n      <div className="workspace-help">`,
);

fs.writeFileSync(path, source);
console.log("Applied single-world multiscene layout fix.");
