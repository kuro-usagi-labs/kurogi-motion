import { useCallback, useRef, useState } from "react";
import type { KurogiProject } from "../types";
import { applyProjectPatch, createProjectPatch, isProjectPatchEmpty, type ProjectPatch } from "./historyPatch";

const HISTORY_LIMIT = 100;
type ProjectUpdater = (project: KurogiProject) => KurogiProject;
type HistoryEntry = { patch: ProjectPatch };

export function useProjectHistory(initialProject: KurogiProject) {
  const [project, setProjectState] = useState(initialProject);
  const projectRef = useRef(initialProject);
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
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
    const patch = createProjectPatch(current, next);
    if (next === current || isProjectPatchEmpty(patch)) return current;
    pushLimited(undoStack.current, { patch });
    redoStack.current = [];
    projectRef.current = next;
    setProjectState(next);
    forceHistoryRevision((revision) => revision + 1);
    return next;
  }, []);

  const beginGesture = useCallback(() => {
    if (!gestureBaseline.current) gestureBaseline.current = projectRef.current;
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
    if (!baseline) return false;
    const patch = createProjectPatch(baseline, projectRef.current);
    if (isProjectPatchEmpty(patch)) return false;
    pushLimited(undoStack.current, { patch });
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
    const entry = undoStack.current.pop();
    if (!entry) return false;
    const previous = applyProjectPatch(projectRef.current, entry.patch, "before");
    pushLimited(redoStack.current, entry);
    projectRef.current = previous;
    setProjectState(previous);
    gestureBaseline.current = null;
    forceHistoryRevision((revision) => revision + 1);
    return true;
  }, []);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return false;
    const next = applyProjectPatch(projectRef.current, entry.patch, "after");
    pushLimited(undoStack.current, entry);
    projectRef.current = next;
    setProjectState(next);
    gestureBaseline.current = null;
    forceHistoryRevision((revision) => revision + 1);
    return true;
  }, []);

  return {
    project, projectRef, replaceProject, commit, beginGesture, preview, finishGesture, cancelGesture, undo, redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    isGestureActive: gestureBaseline.current !== null,
  };
}

function pushLimited<T>(stack: T[], entry: T) {
  stack.push(entry);
  if (stack.length > HISTORY_LIMIT) stack.splice(0, stack.length - HISTORY_LIMIT);
}
