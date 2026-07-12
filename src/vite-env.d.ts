/// <reference types="vite/client" />
interface Window { kurogi?: {platform: string; exportVideo: (project: import('./types').Project) => Promise<{canceled?: boolean; path?: string}>} }
