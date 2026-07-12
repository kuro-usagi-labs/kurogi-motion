/// <reference types="vite/client" />
interface Window {
  kurogi?: {
    platform: string;
    exportVideo: (
      project: import("./types").Project,
      format: "webm" | "mp4" | "gif",
    ) => Promise<{ canceled?: boolean; path?: string }>;
  };
}
