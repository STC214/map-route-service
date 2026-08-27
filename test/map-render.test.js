import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { renderMapPage } from '../src/map-render.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'map-render-'));
  const dataDir = join(root, 'data');
  const cacheDir = join(root, 'cache');
  await mkdir(dataDir);
  await writeFile(join(dataDir, 'map-meta.json'), JSON.stringify({ mapId: 2, origin: [0, 0], totalSize: [256, 256], tileSize: 256, version: 'v1', tileBase: 'https://tiles.invalid' }));
  return { dataDir, cacheDir, page: { group: 'surface:area:1', points: [{ name: '测试点', x: 128, y: 128 }] } };
}

test('底图切片全部失败时交给上层回退', async () => {
  const input = await fixture();
  await assert.rejects(renderMapPage(input.page, { ...input, fetchImpl: async () => ({ ok: false, status: 404 }) }), error => error.code === 'BASEMAP_TILES_INCOMPLETE');
});

test('不同标题使用不同底图结果缓存键', async () => {
  const input = await fixture();
  const tile = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#b9d5a5' } }).webp().toBuffer();
  const fetchImpl = async () => ({ ok: true, async arrayBuffer() { return tile; } });
  const first = await renderMapPage(input.page, { ...input, title: '路线 A', fetchImpl });
  const second = await renderMapPage(input.page, { ...input, title: '路线 B', fetchImpl });
  assert.notEqual(first.path, second.path);
});
