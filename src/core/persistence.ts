import type { KurogiProject } from "../types";
import { cloneProject, createId, normalizeProject } from "./project";

const DATABASE_NAME = "kurogi-motion";
const DATABASE_VERSION = 2;
const PROJECT_STORE = "projects";
const TEMPLATE_STORE = "templates";
const DRAFT_STORE = "drafts";
const LATEST_DRAFT_ID = "latest";

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

export interface UserTemplateRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  project: KurogiProject;
}

export interface DraftRecord {
  id: typeof LATEST_DRAFT_ID;
  projectId: string;
  name: string;
  updatedAt: string;
  project: KurogiProject;
}

export async function saveProject(project: KurogiProject): Promise<void> {
  const database = await openDatabase();
  await putRecord(database, PROJECT_STORE, project);
  const draft = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
  if (draft?.projectId === project.id) await deleteRecord(database, DRAFT_STORE, LATEST_DRAFT_ID);
}

export async function loadProject(projectId: string): Promise<KurogiProject | null> {
  const database = await openDatabase();
  const value = await getRecord<unknown>(database, PROJECT_STORE, projectId);
  return value ? normalizeProject(value) : null;
}

export async function listProjects(): Promise<KurogiProject[]> {
  const database = await openDatabase();
  const values = await getAllRecords<unknown>(database, PROJECT_STORE);
  return values.map(normalizeProject).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const projects = await listProjects();
  return projects.map(toProjectSummary);
}

export async function deleteProject(projectId: string): Promise<void> {
  const database = await openDatabase();
  await deleteRecord(database, PROJECT_STORE, projectId);
  const draft = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
  if (draft?.projectId === projectId) await deleteRecord(database, DRAFT_STORE, LATEST_DRAFT_ID);
}

export async function saveDraft(project: KurogiProject): Promise<void> {
  const database = await openDatabase();
  const record: DraftRecord = {
    id: LATEST_DRAFT_ID,
    projectId: project.id,
    name: project.name,
    updatedAt: new Date().toISOString(),
    project: cloneProject(project),
  };
  await putRecord(database, DRAFT_STORE, record);
}

export async function loadLatestDraft(): Promise<DraftRecord | null> {
  const database = await openDatabase();
  const value = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
  if (!value?.project) return null;
  return { ...value, project: normalizeProject(value.project) };
}

export async function clearDraft(projectId?: string): Promise<void> {
  const database = await openDatabase();
  if (projectId) {
    const draft = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
    if (!draft || draft.projectId !== projectId) return;
  }
  await deleteRecord(database, DRAFT_STORE, LATEST_DRAFT_ID);
}

export async function saveUserTemplate(project: KurogiProject, name = project.name): Promise<UserTemplateRecord> {
  const database = await openDatabase();
  const now = new Date().toISOString();
  const record: UserTemplateRecord = {
    id: createId("user-template"),
    name: name.trim() || `${project.name} template`,
    createdAt: now,
    updatedAt: now,
    project: cloneProject(project),
  };
  await putRecord(database, TEMPLATE_STORE, record);
  return record;
}

export async function listUserTemplates(): Promise<UserTemplateRecord[]> {
  const database = await openDatabase();
  const values = await getAllRecords<UserTemplateRecord>(database, TEMPLATE_STORE);
  return values
    .filter((value) => Boolean(value?.project))
    .map((value) => ({ ...value, project: normalizeProject(value.project) }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteUserTemplate(templateId: string): Promise<void> {
  const database = await openDatabase();
  await deleteRecord(database, TEMPLATE_STORE, templateId);
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

function toProjectSummary(project: KurogiProject): ProjectSummary {
  const scene = project.scenes[project.activeSceneId];
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    createdAt: project.createdAt,
    width: scene?.width ?? 1080,
    height: scene?.height ?? 1080,
    duration: scene?.duration ?? 5,
    background: scene?.background.type === "solid" ? scene.background.color ?? "#ffffff" : "transparent",
  };
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
      if (!database.objectStoreNames.contains(TEMPLATE_STORE)) {
        const store = database.createObjectStore(TEMPLATE_STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the project database."));
    request.onblocked = () => reject(new Error("Project database upgrade is blocked by another window."));
  });
}

function putRecord(database: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return transactionPromise(database, storeName, "readwrite", (store) => store.put(value));
}

function deleteRecord(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
  return transactionPromise(database, storeName, "readwrite", (store) => store.delete(key));
}

function getRecord<T>(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T> {
  return requestPromise<T>(database.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

function getAllRecords<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  return requestPromise<T[]>(database.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

function transactionPromise(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    operation(transaction.objectStore(storeName));
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
