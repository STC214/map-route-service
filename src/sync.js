import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fetchHoyolabMarkers, HOYOLAB_SOURCE } from './sources/hoyolab.js';

async function readJson(path, fallback = {}) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

const activeRefreshes = new Map();

export async function refresh(options = {}) {
  const key = options.dataFile || 'default';
  if (activeRefreshes.has(key)) {
    const result = await activeRefreshes.get(key);
    return options.force ? refresh(options) : result;
  }
  const operation = performRefresh(options).finally(() => { activeRefreshes.delete(key); });
  activeRefreshes.set(key, operation);
  return operation;
}

async function performRefresh({ dataFile, manifestFile, fetchImpl = fetch, force = false } = {}) {
  await mkdir(dirname(dataFile), { recursive: true });
  const previous = await readJson(manifestFile);
  let dataset;
  try {
    dataset = await fetchHoyolabMarkers(fetchImpl);
  } catch (error) {
    return { updated: false, stale: true, reason: `数据请求失败：${error.message}`, manifest: previous };
  }

  const content = JSON.stringify({ markers: dataset.markers, routes: dataset.routes });
  const hash = createHash('sha256').update(content).digest('hex');
  if (previous.hash === hash && !force) return { updated: false, stale: false, reason: '数据未变化', manifest: previous };
  const version = dataset.version || `sha256:${hash.slice(0, 16)}`;
  const body = JSON.stringify({ version, markers: dataset.markers, routes: dataset.routes }, null, 2);

  const next = {
    source: HOYOLAB_SOURCE,
    version,
    hash,
    count: dataset.markers.length,
    routeCount: dataset.routes.length,
    etag: dataset.etag,
    updatedAt: new Date().toISOString()
  };
  const dataTmp = `${dataFile}.tmp`;
  const manifestTmp = `${manifestFile}.tmp`;
  await writeFile(dataTmp, body, 'utf8');
  await writeFile(manifestTmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(dataTmp, dataFile);
  await rename(manifestTmp, manifestFile);
  return { updated: true, stale: false, reason: force && previous.hash === hash ? '强制刷新完成，数据内容未变化' : '更新成功', manifest: next };
}
