from pathlib import Path

path = Path(__file__).resolve().parents[1] / "src/core/persistence.ts"
text = path.read_text(encoding="utf-8")
old = '''async function resolveProjectAssets(project: KurogiProject, database = await openDatabase()): Promise<KurogiProject> {
  const next = cloneProject(project);
  await Promise.all(Object.values(next.assets).map(async (asset) => {
    if (asset.storage !== "blob" || !asset.blobId) return;
    const record = await getRecord<AssetBlobRecord | undefined>(database, ASSET_BLOB_STORE, asset.blobId);
'''
new = '''async function resolveProjectAssets(project: KurogiProject, database?: IDBDatabase): Promise<KurogiProject> {
  const activeDatabase = database ?? await openDatabase();
  const next = cloneProject(project);
  await Promise.all(Object.values(next.assets).map(async (asset) => {
    if (asset.storage !== "blob" || !asset.blobId) return;
    const record = await getRecord<AssetBlobRecord | undefined>(activeDatabase, ASSET_BLOB_STORE, asset.blobId);
'''
if old not in text:
    raise RuntimeError("Async resolveProjectAssets block not found.")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Async database resolution fixed.")
