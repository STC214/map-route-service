import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupCache, inspectCache } from '../src/cache.js';

test('缓存按容量删除最旧文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'map-cache-'));
  await mkdir(join(root, 'tiles'));
  const old = join(root, 'tiles', 'old.webp');
  const fresh = join(root, 'fresh.png');
  await writeFile(old, Buffer.alloc(20));
  await writeFile(fresh, Buffer.alloc(20));
  await utimes(old, new Date(0), new Date(0));
  const result = await cleanupCache(root, { maxBytes: 20, maxAgeDays: 36500 });
  assert.equal(result.removedFiles, 1);
  assert.deepEqual(await inspectCache(root), { files: 1, bytes: 20 });
});
