const fs = require("node:fs");

function patch(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [from, to, label] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`Missing compiler fix anchor: ${label}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patch("src/app/Editor.tsx", [
  [
    '        const file = new File([payload.bytes], payload.name, { type: payload.mimeType });',
    '        const mediaBytes = new Uint8Array(payload.bytes);\n        const file = new File([mediaBytes.buffer as ArrayBuffer], payload.name, { type: payload.mimeType });',
    "IPC BlobPart conversion",
  ],
  [
    '      const metadata = isAudio ? { duration: await readAudioDuration(temporaryUrl) } : await readImageDimensions(temporaryUrl);',
    '      const audioDuration = isAudio ? await readAudioDuration(temporaryUrl) : undefined;\n      const imageDimensions = isAudio ? undefined : await readImageDimensions(temporaryUrl);',
    "separate media metadata",
  ],
  [
    '        ...(isAudio ? { duration: metadata.duration } : { width: metadata.width, height: metadata.height }),',
    '        ...(isAudio ? { duration: audioDuration } : { width: imageDimensions!.width, height: imageDimensions!.height }),',
    "typed media metadata fields",
  ],
]);

patch("src/core/mcpCommands.ts", [[
  '    easingCurve: Array.isArray(params.easingCurve) && params.easingCurve.length === 4 ? params.easingCurve.map(Number) as [number, number, number, number] : undefined,',
  '    easingCurve: Array.isArray(params.easingCurve) && params.easingCurve.length === 4 ? {\n      x1: Number(params.easingCurve[0]),\n      y1: Number(params.easingCurve[1]),\n      x2: Number(params.easingCurve[2]),\n      y2: Number(params.easingCurve[3]),\n    } : undefined,',
  "cubic bezier object",
]]);

patch("src/editor/AnimationPresetDialog.tsx", [[
  '    layerIds: [layerId],\n  };',
  '    layerIds: [layerId],\n    audioClipIds: [],\n  };',
  "preview scene audio IDs",
]]);

patch("src/editor/TimelineV3.tsx", [
  [
    '  function seekToTime(time: number) {\n    seekToTime(time);\n  }\n\n',
    '',
    "recursive duplicate seek helper",
  ],
  [
    '    const targetFrame = Math.min(Math.max(0, Math.round(time * scene.fps)), Math.max(0, Math.round(scene.duration * scene.fps) - 1));\n    playerRef.current?.seekTo(targetFrame);\n    setFrame(targetFrame);\n  }\n\n  function beginActionGesture',
    '    seekToTime(time);\n  }\n\n  function beginActionGesture',
    "reuse seek helper from pointer",
  ],
]);

console.log("Audio compiler fixes applied.");
