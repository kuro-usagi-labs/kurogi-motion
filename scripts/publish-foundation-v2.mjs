import { readFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const branch = "feature/prd-foundation-remotion";
if (!repository || !token) throw new Error("GitHub publishing environment is unavailable.");

const files = [
  "src/types.ts",
  "src/core/historyPatch.ts",
  "src/core/useProjectHistory.ts",
  "src/core/persistence.ts",
  "src/app/Editor.tsx",
  "src/App.tsx",
  "scripts/audit-foundation-v2.mjs",
  "package.json",
];

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(`${options.method ?? "GET"} ${path} failed (${response.status}): ${body?.message ?? "Unknown GitHub API error"}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

const treeEntries = await Promise.all(files.map(async (path) => {
  const content = await readFile(path, "utf8");
  const blob = await api("/git/blobs", {
    method: "POST",
    body: JSON.stringify({ content, encoding: "utf-8" }),
  });
  return { path, mode: "100644", type: "blob", sha: blob.sha };
}));

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const ref = await api(`/git/ref/heads/${branch}`);
    const parentSha = ref.object.sha;
    const parent = await api(`/git/commits/${parentSha}`);
    const tree = await api("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries }),
    });
    const commit = await api("/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: "Build Asset Storage V2, patch history, and real recovery",
        tree: tree.sha,
        parents: [parentSha],
      }),
    });
    await api(`/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    console.log(`Published scalable foundation commit ${commit.sha}`);
    process.exit(0);
  } catch (error) {
    if (attempt === 3 || (error.status !== 409 && error.status !== 422)) throw error;
    console.warn(`Branch moved while publishing; retrying (${attempt}/3).`);
  }
}
