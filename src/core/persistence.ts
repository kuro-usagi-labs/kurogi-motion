import type { KurogiProject } from "../types";
import { normalizeProject } from "./project";

const DATABASE_NAME = "kurogi-motion";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  width: number;
  height: number;
  duration: number;
  background: string;
}

export async function saveProject(project: KurogiProject): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.put(project));
}

export async function loadProject(projectId: string): Promise<KurogiProject | null> {
  const database = await openDatabase();
  const value = await requestPromise<unknown>(
    database.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).get(projectId),
  );
  return value ? normalizeProject(value) : null;
}

export async function listProjects(): Promise<KurogiProject[]> {
  const database = await openDatabase();
  const values = await requestPromise<unknown[]>(
    database.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).getAll(),
  );
  return values
    .map(normalizeProject)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await listProjects();
  return projects.map((project) => {
    const scene = project.scenes[project.activeSceneId];
    return {
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
      width: scene?.width ?? 1080,
      height: scene?.height ?? 1080,
      duration: scene?.duration ?? 5,
      background:
        scene?.background.type === "solid" ? scene.background.color ?? "#ffffff" : "transparent",
    };
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.delete(projectId));
}

export async function importLegacyLocalStorageProject(): Promise<KurogiProject | null> {
  const raw = localStorage.getItem("kurogi-project");
  if (!raw) return null;
  try {
    const project = normalizeProject(JSON.parse(raw));
    await saveProject(project);
    localStorage.removeItem("kurogi-project");
    localStorage.removeItem("kurogi-recent-projects");
    return project;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        const store = database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the project database."));
    request.onblocked = () => reject(new Error("Project database upgrade is blocked by another window."));
  });
}

function transactionPromise(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE, mode);
    operation(transaction.objectStore(PROJECT_STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Project database transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Project database transaction was aborted."));
  });
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Project database request failed."));
  });
}
