import React from "react";
import { Composition, registerRoot } from "remotion";
import { MotionComposition } from "./MotionComposition";
import { createStarterProject, getActiveScene } from "./core/project";
import type { KurogiProject } from "./types";

const defaultProject = createStarterProject();

const Root: React.FC = () => (
  <Composition
    id="KurogiMotion"
    component={MotionComposition}
    durationInFrames={150}
    fps={30}
    width={1080}
    height={1080}
    defaultProps={{ project: defaultProject as KurogiProject }}
    calculateMetadata={({ props }) => {
      const scene = getActiveScene(props.project);
      return {
        durationInFrames: Math.max(1, Math.round(scene.duration * scene.fps)),
        fps: scene.fps,
        width: scene.width,
        height: scene.height,
      };
    }}
  />
);

registerRoot(Root);
