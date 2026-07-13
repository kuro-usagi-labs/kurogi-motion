import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AssetId, KurogiProject, ProjectId } from "../domain/project";
import { kurogiProjectSchema } from "../domain/schema";

interface StoredProject {
  id: ProjectId;
  name: string;
  updatedAt: string;
  document: KurogiProject;
}

interface StoredAsset {
  id: AssetId;
  projectId: ProjectId;
  fileName: string;
  mimeType: string;
  blob: Blob;
  createdAt: string;
}

interface KurogiDatabase extends DBSchema {
  projects: {
    key: ProjectId;
    value: StoredProject;
    indexes: { "by-updatedAt": string };
  };
  assets: {
    key: AssetId;
    value: StoredAsset;
    indexes: { "by-projectId": ProjectId };
  };
  thumbnails: {
    key: ProjectId;
    value: { projectId: ProjectId; blob: Blob; updatedAt: string };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
  exports: {
    key: string;
    value: { id: string; projectId: ProjectId; blob: Blob; createdAt: string };
    indexes: { "by-projectId": ProjectId };
  };
}

let databasePromise: Promise<IDBPDatabase<KurogiDatabase>> | null = null;

export const getDatabase = (): Promise<IDBPDatabase<KurogiDatabase>> => {
  databasePromise ??= openDB<KurogiDatabase>("kurogi-motion", 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("projects")) {
        const store = database.createObjectStore("projects", { keyPath: "id" });
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!database.objectStoreNames.contains("assets")) {
        const store = database.createObjectStore("assets", { keyPath: "id" });
        store.createIndex("by-projectId", "projectId");
      }
      if (!database.objectStoreNames.contains("thumbnails")) {
        database.createObjectStore("thumbnails", { keyPath: "projectId" });
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("exports")) {
        const store = database.createObjectStore("exports", { keyPath: "id" });
        store.createIndex("by-projectId", "projectId");
      }
    },
  });
  return databasePromise;
};

export const saveProject = async (project: KurogiProject): Promise<void> => {
  const parsed = kurogiProjectSchema.parse(project) as KurogiProject;
  const database = await getDatabase();
  await database.put("projects", {
    id: parsed.id,
    name: parsed.name,
    updatedAt: parsed.updatedAt,
    document: structuredClone(parsed),
  });
};

export const loadProject = async (projectId: ProjectId): Promise<KurogiProject | null> => {
  const database = await getDatabase();
  const record = await database.get("projects", projectId);
  if (!record) return null;
  return kurogiProjectSchema.parse(record.document) as KurogiProject;
};

export const loadMostRecentProject = async (): Promise<KurogiProject | null> => {
  const database = await getDatabase();
  const records = await database.getAllFromIndex("projects", "by-updatedAt");
  const record = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!record) return null;
  return kurogiProjectSchema.parse(record.document) as KurogiProject;
};

export const listProjects = async (): Promise<StoredProject[]> => {
  const database = await getDatabase();
  const records = await database.getAllFromIndex("projects", "by-updatedAt");
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

export const saveAsset = async (asset: StoredAsset): Promise<void> => {
  const database = await getDatabase();
  await database.put("assets", asset);
};
