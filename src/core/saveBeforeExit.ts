import type { KurogiProject } from "../types";

export type ProjectSaveOperation = (project: KurogiProject) => Promise<void>;
export type DraftClearOperation = (projectId: string) => Promise<void>;

/**
 * Persists the latest editor snapshot before navigation is allowed to continue.
 * Callers must only unmount the editor after this promise resolves.
 */
export async function persistProjectBeforeExit(
  project: KurogiProject,
  save: ProjectSaveOperation,
  clearDraft: DraftClearOperation,
): Promise<void> {
  await save(project);
  await clearDraft(project.id);
}
