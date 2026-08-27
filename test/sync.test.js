import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refresh } from '../src/sync.js';
import { fetchWithTimeout } from '../src/http.js';

function response(body) {
  return { ok: true, headers: new Headers(), async json() { return body; } };
}

function officialFetch() {
  return async url => response(String(url).includes('/point/list') ? {
    retcode: 0,
    data: { point_list: [{ id: 1, label_id: 9, x_pos: 10, y_pos: 20, area_id: 1, z_level: 0 }] },
  } : {
    retcode: 0,
    data: { tree: [{ name: '材料', children: [{ id: 9, name: '测试矿物', recommend_route_list: [] }] }] },
  });
}

test('无版本响应的相同数据只在首次写入', async () => {
  const root = await mkdtemp(join(tmpdir(), 'map-sync-'));
  const options = { dataFile: join(root, 'markers.json'), manifestFile: join(root, 'manifest.json'), fetchImpl: officialFetch() };
  const first = await refresh(options);
  const second = await refresh(options);
  assert.equal(first.updated, true);
  assert.equal(second.updated, false);
  assert.equal(second.reason, '数据未变化');
  const dataset = JSON.parse(await readFile(options.dataFile, 'utf8'));
  assert.match(dataset.version, /^sha256:/);
});

test('强制刷新保留稳定内容版本', async () => {
  const root = await mkdtemp(join(tmpdir(), 'map-force-'));
  const options = { dataFile: join(root, 'markers.json'), manifestFile: join(root, 'manifest.json'), fetchImpl: officialFetch() };
  const first = await refresh(options);
  const forced = await refresh({ ...options, force: true });
  assert.equal(forced.updated, true);
  assert.equal(forced.manifest.version, first.manifest.version);
  assert.match(forced.reason, /强制刷新/);
});

test('网络请求到期后结束', async () => {
  await assert.rejects(fetchWithTimeout(() => new Promise(() => {}), 'https://example.invalid', { timeoutMs: 10 }), /请求超时/);
});
