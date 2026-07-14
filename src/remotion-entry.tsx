import React from "react";
import { Composition, registerRoot } from "remotion";
import { getProjectRenderMetadata, ProjectComposition } from "./MotionComposition";
import { createStarterProject } from "./core/project";
import type { KurogiProject } from "./types";

const defaultProject = createStarterProject();

const Root: React.FC = () => (
  <Composition
    id="KurogiMotion"
    component={ProjectComposition}
    durationInFrames={150}
    fps={30}
    width={1080}
    height={1080}
    defaultProps={{ project: defaultProject as KurogiProject, renderMode: "active-scene" as const }}
    calculateMetadata={({ props }) => getProjectRenderMetadata(props)}
  />
);

registerRoot(Root);
