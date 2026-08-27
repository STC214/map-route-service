import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

async function listFiles(root) {
  const files = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        const info = await stat(path);
        files.push({ path, size: info.size, mtimeMs: info.mtimeMs });
      }
    }
  }
  await walk(root);
  return files;
}

export async function inspectCache(cacheDir) {
  const files = await listFiles(cacheDir);
  return { files: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) };
}

export async function cleanupCache(cacheDir, { maxBytes = 512 * 1024 * 1024, maxAgeDays = 30, dryRun = false } = {}) {
  const files = await listFiles(cacheDir);
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const ordered = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs);
  let bytes = files.reduce((sum, file) => sum + file.size, 0);
  const removed = [];
  for (const file of ordered) {
    if (file.mtimeMs >= cutoff && bytes <= maxBytes) continue;
    if (!dryRun) await unlink(file.path).catch(() => {});
    bytes -= file.size;
    removed.push(file);
  }
  return { beforeFiles: files.length, beforeBytes: files.reduce((sum, file) => sum + file.size, 0), removedFiles: removed.length, removedBytes: removed.reduce((sum, file) => sum + file.size, 0), afterBytes: Math.max(0, bytes), dryRun };
}
