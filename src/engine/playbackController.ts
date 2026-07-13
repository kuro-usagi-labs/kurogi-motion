import { useDocumentStore } from "../stores/documentStore";
import { usePlaybackStore } from "../stores/playbackStore";
import { frameToTime, timeToFrame } from "./time";

class PlaybackController {
  private requestId: number | null = null;
  private previousTimestamp = 0;

  play(): void {
    const playback = usePlaybackStore.getState();
    const project = useDocumentStore.getState().project;
    const scene = project.scenes[project.activeSceneId];
    if (playback.currentTimeMs >= scene.durationMs) playback.seek(0);
    playback.setStatus("playing");
    this.previousTimestamp = performance.now();
    this.requestId ??= requestAnimationFrame(this.tick);
  }

  pause(): void {
    usePlaybackStore.getState().setStatus("paused");
    this.cancelFrame();
  }

  stop(): void {
    const playback = usePlaybackStore.getState();
    playback.setStatus("stopped");
    playback.seek(0);
    this.cancelFrame();
  }

  seek(timeMs: number): void {
    const project = useDocumentStore.getState().project;
    const scene = project.scenes[project.activeSceneId];
    usePlaybackStore.getState().seek(Math.min(scene.durationMs, Math.max(0, timeMs)));
  }

  step(direction: -1 | 1): void {
    const project = useDocumentStore.getState().project;
    const scene = project.scenes[project.activeSceneId];
    const currentFrame = timeToFrame(usePlaybackStore.getState().currentTimeMs, scene.fps);
    this.seek(frameToTime(Math.max(0, currentFrame + direction), scene.fps));
  }

  toggle(): void {
    if (usePlaybackStore.getState().status === "playing") this.pause();
    else this.play();
  }

  private tick = (timestamp: number): void => {
    const playback = usePlaybackStore.getState();
    if (playback.status !== "playing") {
      this.cancelFrame();
      return;
    }

    const project = useDocumentStore.getState().project;
    const scene = project.scenes[project.activeSceneId];
    const delta = (timestamp - this.previousTimestamp) * playback.speed;
    this.previousTimestamp = timestamp;
    let nextTime = playback.currentTimeMs + delta;

    if (nextTime >= scene.durationMs) {
      if (playback.loop) nextTime %= scene.durationMs;
      else {
        playback.seek(scene.durationMs);
        playback.setStatus("stopped");
        this.cancelFrame();
        return;
      }
    }

    playback.seek(nextTime);
    this.requestId = requestAnimationFrame(this.tick);
  };

  private cancelFrame(): void {
    if (this.requestId !== null) cancelAnimationFrame(this.requestId);
    this.requestId = null;
  }
}

export const playbackController = new PlaybackController();
