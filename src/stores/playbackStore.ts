import { create } from "zustand";

export type PlaybackStatus = "stopped" | "playing" | "paused";

interface PlaybackState {
  status: PlaybackStatus;
  currentTimeMs: number;
  loop: boolean;
  speed: number;
  setStatus: (status: PlaybackStatus) => void;
  seek: (currentTimeMs: number) => void;
  setLoop: (loop: boolean) => void;
  setSpeed: (speed: number) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  status: "stopped",
  currentTimeMs: 0,
  loop: true,
  speed: 1,
  setStatus: (status) => set({ status }),
  seek: (currentTimeMs) => set({ currentTimeMs: Math.max(0, currentTimeMs) }),
  setLoop: (loop) => set({ loop }),
  setSpeed: (speed) => set({ speed: Math.max(0.1, Math.min(4, speed)) }),
}));
