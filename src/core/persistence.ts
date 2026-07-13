import type { KurogiProject, ProjectAsset } from "../types";
import { cloneProject, createId, normalizeProject } from "./project";

const DATABASE_NAME = "kurogi-motion";
const DATABASE_VERSION = 3;
const PROJECT_STORE = "projects";
const TEMPLATE_STORE = "templates";
const DRAFT_STORE = "drafts";
const ASSET_BLOB_STORE = "assetBlobs";
const LATEST_DRAFT_ID = "latest";
const runtimeUrls = new Map<string, string>();

interface AssetBlobRecord {
  id: string;
  projectId: string;
  assetId: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
  blob: Blob;
}

export interface ProjectSummary {
  id: string; name: string; updatedAt: string; createdAt: string; width: number; height: number; duration: number; background: string;
}
export interface UserTemplateRecord {
  id: string; name: string; createdAt: string; updatedAt: string; project: KurogiProject;
}
export interface DraftRecord {
  id: typeof LATEST_DRAFT_ID; projectId: string; name: string; updatedAt: string; project: KurogiProject;
}

export async function saveProject(project: KurogiProject): Promise<void> {
  const database = await openDatabase();
  await putRecord(database, PROJECT_STORE, prepareProjectForStorage(project));
  const draft = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
  if (draft?.projectId === project.id) await deleteRecord(database, DRAFT_STORE, LATEST_DRAFT_ID);
}

export async function loadProject(projectId: string): Promise<KurogiProject | null> {
  const database = await openDatabase();
  const value = await getRecord<unknown>(database, PROJECT_STORE, projectId);
  return value ? resolveProjectAssets(normalizeProject(value), database) : null;
}

export async function listProjects(): Promise<KurogiProject[]> {
  const database = await openDatabase();
  const values = await getAllRecords<unknown>(database, PROJECT_STORE);
  return values.map(normalizeProject).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  return (await listProjects()).map(toProjectSummary);
}

export async function deleteProject(projectId: string): Promise<void> {
  const database = await openDatabase();
  await deleteRecord(database, PROJECT_STORE, projectId);
  const draft = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
  if (draft?.projectId === projectId) await deleteRecord(database, DRAFT_STORE, LATEST_DRAFT_ID);
  await garbageCollectAssetBlobs(database);
}

export async function saveDraft(project: KurogiProject): Promise<void> {
  const database = await openDatabase();
  const detached = prepareProjectForStorage(project);
  const record: DraftRecord = {
    id: LATEST_DRAFT_ID, projectId: project.id, name: project.name, updatedAt: new Date().toISOString(), project: detached,
  };
  await putRecord(database, DRAFT_STORE, record);
}

export async function loadLatestDraft(): Promise<DraftRecord | null> {
  const database = await openDatabase();
  const value = await getRecord<DraftRecord | undefined>(database, DRAFT_STORE, LATEST_DRAFT_ID);
  if (!value?.project) return null;
  return { ...value, project: await resolveProjectAssets(normalizeProject(value.project), database) };
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
    id: createId("user-template"), name: name.trim() || `${project.name} template`, createdAt: now, updatedAt: now,
    project: prepareProjectForStorage(project),
  };
  await putRecord(database, TEMPLATE_STORE, record);
  return { ...record, project: cloneProject(project) };
}

export async function listUserTemplates(): Promise<UserTemplateRecord[]> {
  const database = await openDatabase();
  const values = await getAllRecords<UserTemplateRecord>(database, TEMPLATE_STORE);
  const resolved = await Promise.all(values.filter((value) => Boolean(value?.project)).map(async (value) => ({
    ...value, project: await resolveProjectAssets(normalizeProject(value.project), database),
  })));
  return resolved.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteUserTemplate(templateId: string): Promise<void> {
  const database = await openDatabase();
  await deleteRecord(database, TEMPLATE_STORE, templateId);
  await garbageCollectAssetBlobs(database);
}

export async function storeAssetBlob(projectId: string, assetId: string, blob: Blob, blobId = createId("asset-blob")) {
  const database = await openDatabase();
  const record: AssetBlobRecord = {
    id: blobId, projectId, assetId, mimeType: blob.type || "application/octet-stream", byteSize: blob.size,
    createdAt: new Date().toISOString(), blob,
  };
  await putRecord(database, ASSET_BLOB_STORE, record);
  return { blobId, sourceUrl: runtimeUrl(blobId, blob), byteSize: blob.size };
}

export async function migrateProjectAssets(project: KurogiProject): Promise<KurogiProject> {
  const next = cloneProject(project);
  for (const asset of Object.values(next.assets)) {
    if (asset.storage === "blob" && asset.blobId) continue;
    if (!asset.sourceUrl || (!asset.sourceUrl.startsWith("data:") && !asset.sourceUrl.startsWith("blob:"))) continue;
    const blob = asset.sourceUrl.startsWith("data:") ? dataUrlToBlob(asset.sourceUrl) : await (await fetch(asset.sourceUrl)).blob();
    const stored = await storeAssetBlob(next.id, asset.id, blob);
    asset.storage = "blob";
    asset.blobId = stored.blobId;
    asset.byteSize = stored.byteSize;
    asset.sourceUrl = stored.sourceUrl;
  }
  return next;
}

export async function prepareProjectForExport(project: KurogiProject): Promise<KurogiProject> {
  const next = cloneProject(project);
  const database = await openDatabase();
  for (const asset of Object.values(next.assets)) {
    if (asset.storage !== "blob" || !asset.blobId) continue;
    const record = await getRecord<AssetBlobRecord | undefined>(database, ASSET_BLOB_STORE, asset.blobId);
    if (!record?.blob) throw new Error(`Asset data is missing for ${asset.name}.`);
    asset.sourceUrl = await blobToDataUrl(record.blob);
  }
  return next;
}

export async function importLegacyLocalStorageProject(): Promise<KurogiProject | null> {
  const raw = localStorage.getItem("kurogi-project");
  if (!raw) return null;
  try {
    const project = await migrateProjectAssets(normalizeProject(JSON.parse(raw)));
    await saveProject(project);
    localStorage.removeItem("kurogi-project");
    localStorage.removeItem("kurogi-recent-projects");
    return project;
  } catch { return null; }
}

function prepareProjectForStorage(project: KurogiProject): KurogiProject {
  const next = cloneProject(project);
  for (const asset of Object.values(next.assets)) {
    if (asset.storage === "blob" && asset.blobId) {
      asset.sourceUrl = "";
      if (asset.thumbnailUrl?.startsWith("blob:")) asset.thumbnailUrl = undefined;
    }
  }
  return next;
}

async function resolveProjectAssets(project: KurogiProject, database?: IDBDatabase): Promise<KurogiProject> {
  const activeDatabase = database ?? await openDatabase();
  const next = cloneProject(project);
  await Promise.all(Object.values(next.assets).map(async (asset) => {
    if (asset.storage !== "blob" || !asset.blobId) return;
    const record = await getRecord<AssetBlobRecord | undefined>(activeDatabase, ASSET_BLOB_STORE, asset.blobId);
    if (!record?.blob) return;
    asset.sourceUrl = runtimeUrl(asset.blobId, record.blob);
    asset.byteSize = record.byteSize;
  }));
  return next;
}

function runtimeUrl(blobId: string, blob: Blob) {
  const current = runtimeUrls.get(blobId);
  if (current) return current;
  const url = URL.createObjectURL(blob);
  runtimeUrls.set(blobId, url);
  return url;
}

async function garbageCollectAssetBlobs(database: IDBDatabase) {
  const used = new Set<string>();
  const projects = await getAllRecords<KurogiProject>(database, PROJECT_STORE);
  const templates = await getAllRecords<UserTemplateRecord>(database, TEMPLATE_STORE);
  const drafts = await getAllRecords<DraftRecord>(database, DRAFT_STORE);
  for (const project of [...projects, ...templates.map((item) => item.project), ...drafts.map((item) => item.project)]) {
    for (const asset of Object.values(project?.assets ?? {})) if (asset.blobId) used.add(asset.blobId);
  }
  const records = await getAllRecords<AssetBlobRecord>(database, ASSET_BLOB_STORE);
  for (const record of records) if (!used.has(record.id)) {
    const url = runtimeUrls.get(record.id);
    if (url) URL.revokeObjectURL(url);
    runtimeUrls.delete(record.id);
    await deleteRecord(database, ASSET_BLOB_STORE, record.id);
  }
}

function toProjectSummary(project: KurogiProject): ProjectSummary {
  const scene = project.scenes[project.activeSceneId];
  return { id: project.id, name: project.name, updatedAt: project.updatedAt, createdAt: project.createdAt,
    width: scene?.width ?? 1080, height: scene?.height ?? 1080, duration: scene?.duration ?? 5,
    background: scene?.background.type === "solid" ? scene.background.color ?? "#ffffff" : "transparent" };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) { const store = database.createObjectStore(PROJECT_STORE, { keyPath: "id" }); store.createIndex("updatedAt", "updatedAt"); }
      if (!database.objectStoreNames.contains(TEMPLATE_STORE)) { const store = database.createObjectStore(TEMPLATE_STORE, { keyPath: "id" }); store.createIndex("updatedAt", "updatedAt"); }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) database.createObjectStore(DRAFT_STORE, { keyPath: "id" });
      if (!database.objectStoreNames.contains(ASSET_BLOB_STORE)) {
        const store = database.createObjectStore(ASSET_BLOB_STORE, { keyPath: "id" });
        store.createIndex("projectId", "projectId");
        store.createIndex("assetId", "assetId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the project database."));
    request.onblocked = () => reject(new Error("Project database upgrade is blocked by another window."));
  });
}

function putRecord(database: IDBDatabase, storeName: string, value: unknown): Promise<void> { return transactionPromise(database, storeName, "readwrite", (store) => store.put(value)); }
function deleteRecord(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> { return transactionPromise(database, storeName, "readwrite", (store) => store.delete(key)); }
function getRecord<T>(database: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T> { return requestPromise<T>(database.transaction(storeName, "readonly").objectStore(storeName).get(key)); }
function getAllRecords<T>(database: IDBDatabase, storeName: string): Promise<T[]> { return requestPromise<T[]>(database.transaction(storeName, "readonly").objectStore(storeName).getAll()); }
function transactionPromise(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode); operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Project database transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Project database transaction was aborted."));
  });
}
function requestPromise<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Project database request failed.")); }); }

function dataUrlToBlob(source: string) {
  const [header, payload] = source.split(",", 2);
  const mimeType = /data:([^;,]+)/.exec(header)?.[1] ?? "application/octet-stream";
  const bytes = header.includes(";base64") ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mimeType });
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error("Asset data could not be serialized.")); reader.readAsDataURL(blob); });
}
