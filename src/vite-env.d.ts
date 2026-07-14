/// <reference types="vite/client" />

interface Window {
  kurogi?: {
    platform: string;
    exportVideo: (
      project: import("./types").KurogiProject,
      options: import("./types").ExportOptions,
    ) => Promise<{ canceled?: boolean; path?: string }>;
    saveKuroMotionFile: (
      envelope: import("./core/projectFiles").KuroMotionFileEnvelope,
      defaultName: string,
    ) => Promise<{ canceled?: boolean; path?: string }>;
    openKuroMotionFile: () => Promise<{ canceled?: boolean; path?: string; content?: string }>;
    showItemInFolder: (targetPath: string) => Promise<{ opened: boolean }>;
    getMcpInfo: () => Promise<{ bridgeRunning: boolean; bridgeFile: string; command: string; args: string[]; packaged: boolean }>;
    onMcpRequest: (listener: (request: import("./core/mcpCommands").McpBridgeRequest) => void) => () => void;
    respondMcpRequest: (response: import("./core/mcpCommands").McpBridgeResponse) => void;
    onExportProgress: (
      listener: (progress: import("./types").ExportProgress) => void,
    ) => () => void;
  };
}
