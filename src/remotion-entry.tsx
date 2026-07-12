import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {MotionComposition} from './MotionComposition';
import {starterProject, type Project} from './types';

const Root: React.FC = () => <Composition id="KurogiMotion" component={MotionComposition} durationInFrames={150} fps={30} width={1080} height={1080} defaultProps={{project: starterProject as Project}} calculateMetadata={({props}) => ({durationInFrames: Math.round(props.project.duration * props.project.fps), fps: props.project.fps, width: props.project.width, height: props.project.height})}/>;
registerRoot(Root);
