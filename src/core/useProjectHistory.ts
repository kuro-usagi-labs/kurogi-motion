import { useCallback, useRef, useState } from "react";
import type { KurogiProject } from "../types";
import { cloneProject } from "./project";

const HISTORY_LIMIT = 100;

type ProjectUpdater = (project: KurogiProject) => KurogiProject;

export function useProjectHistory(initialProject: KurogiProject) {
  const [project, setProjectState] = useState(initialProject);
  const projectRef = useRef(initialProject);
  const undoStack = useRef<KurogiProject[]>([]);
  const redoStack = useRef<KurogiProject[]>([]);
  const gestureBaseline = useRef<KurogiProject | null>(null);
  const [, forceHistoryRevision] = useState(0);

  const replaceProject = useCallback((next: KurogiProject) => {
    projectRef.current = next;
    setProjectState(next);
    undoStack.current = [];
    redoStack.current = [];
    gestureBaseline.current = null;
    forceHistoryRevision((revision) => revision + 1);
  }, []);

  const commit = useCallback((updater: ProjectUpdater) => {
    const current = projectRef.current;
    const next = updater(current);
    if (next === current || projectEquals(current, next)) return current;
    pushLimited(undoStack.current, cloneProject(current));
    redoStack.current = [];
    projectRef.current = next;
    setProjectState(next);
    forceHistoryRevision((revision) => revision + 1);
    return next;
  }, []);

  const beginGesture = useCallback(() => {
    if (!gestureBaseline.current) gestureBaseline.current = cloneProject(projectRef.current);
  }, []);

  const preview = useCallback((updater: ProjectUpdater) => {
    const current = projectRef.current;
    const next = updater(current);
    if (next === current) return current;
    projectRef.current = next;
    setProjectState(next);
    return next;
  }, []);

  const finishGesture = useCallback(() => {
    const baseline = gestureBaseline.current;
    gestureBaseline.current = null;
    if (!baseline || projectEquals(baseline, projectRef.current)) return false;
    pushLimited(undoStack.current, baseline);
    redoStack.current = [];
    forceHistoryRevision((revision) => revision + 1);
    return true;
  }, []);

  const cancelGesture = useCallback(() => {
    const baseline = gestureBaseline.current;
    gestureBaseline.current = null;
    if (!baseline) return false;
    projectRef.current = baseline;
    setProjectState(baseline);
    return true;
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return false;
    pushLimited(redoStack.current, cloneProject(projectRef.current));
    projectRef.current = previous;
    setProjectState(previous);
    gestureBaseline.current = null;
    forceHistoryRevision((revision) => revision + 1);
    return true;
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return false;
    pushLimited(undoStack.current, cloneProject(projectRef.current));
    projectRef.current = next;
    setProjectState(next);
    gestureBaseline.current = null;
    forceHistoryRevision((revision) => revision + 1);
    return true;
  }, []);

  return {
    project,
    projectRef,
    replaceProject,
    commit,
    beginGesture,
    preview,
    finishGesture,
    cancelGesture,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    isGestureActive: gestureBaseline.current !== null,
  };
}

function pushLimited(stack: KurogiProject[], project: KurogiProject) {
  stack.push(project);
  if (stack.length > HISTORY_LIMIT) stack.splice(0, stack.length - HISTORY_LIMIT);
}

function projectEquals(left: KurogiProject, right: KurogiProject): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
