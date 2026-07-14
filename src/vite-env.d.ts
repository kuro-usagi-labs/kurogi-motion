/// <reference types="vite/client" />

interface Window {
  kurogi?: {
    platform: string;
    exportVideo: (
      project: import("./types").KurogiProject,
      options: import("./types").ExportOptions & { outputPath?: string; automatic?: boolean },
    ) => Promise<{ canceled?: boolean; path?: string }>;
    renderPreviewFrame: (
      project: import("./types").KurogiProject,
      options: { time?: number; scale?: number },
    ) => Promise<{ path: string; mimeType: "image/png"; time: number; frame: number; width: number; height: number }>;
    startRenderJob: (
      project: import("./types").KurogiProject,
      options: import("./types").ExportOptions & { outputPath?: string; automatic?: boolean },
    ) => Promise<RenderJobInfo & { canceled?: boolean }>;
    getRenderJob: (jobId: string) => Promise<RenderJobInfo>;
    cancelRenderJob: (jobId: string) => Promise<RenderJobInfo>;
    saveKuroMotionFile: (
      envelope: import("./core/projectFiles").KuroMotionFileEnvelope,
      defaultName: string,
    ) => Promise<{ canceled?: boolean; path?: string }>;
    openKuroMotionFile: () => Promise<{ canceled?: boolean; path?: string; content?: string }>;
    showItemInFolder: (targetPath: string) => Promise<{ opened: boolean }>;
    readMcpMediaFile: (filePath: string) => Promise<{ name: string; mimeType: string; bytes: Uint8Array; byteSize: number }>;
    getMcpInfo: () => Promise<{ bridgeRunning: boolean; bridgeFile: string; command: string; args: string[]; env: Record<string, string>; packaged: boolean }>;
    onMcpRequest: (listener: (request: import("./core/mcpCommands").McpBridgeRequest) => void) => () => void;
    respondMcpRequest: (response: import("./core/mcpCommands").McpBridgeResponse) => void;
    onExportProgress: (
      listener: (progress: import("./types").ExportProgress) => void,
    ) => () => void;
  };
}

interface RenderJobInfo {
  id: string;
  projectName: string;
  status: "queued" | "running" | "canceling" | "completed" | "failed" | "canceled";
  phase: string;
  progress: number;
  outputPath?: string;
  error?: string;
  renderedFrames?: number;
  encodedFrames?: number;
  frameCount?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
