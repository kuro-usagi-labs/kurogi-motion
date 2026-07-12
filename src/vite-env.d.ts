/// <reference types="vite/client" />

interface Window {
  kurogi?: {
    platform: string;
    exportVideo: (
      project: import("./types").KurogiProject,
      options: import("./types").ExportOptions,
    ) => Promise<{ canceled?: boolean; path?: string }>;
    onExportProgress: (
      listener: (progress: import("./types").ExportProgress) => void,
    ) => () => void;
  };
}
