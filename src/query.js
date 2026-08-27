import { readFile, stat } from 'node:fs/promises';
import { normalizeText } from './model.js';

const searchIndexes = new WeakMap();
const datasetCache = new Map();

function getSearchIndex(markers) {
  if (searchIndexes.has(markers)) return searchIndexes.get(markers);
  const entries = markers.map(marker => ({ marker, names: [marker.name, ...(marker.aliases || [])].map(normalizeText).filter(Boolean) }));
  const exact = new Map();
  for (const entry of entries) for (const name of entry.names) {
    if (!exact.has(name)) exact.set(name, []);
    exact.get(name).push(entry.marker);
  }
  const index = { entries, exact };
  searchIndexes.set(markers, index);
  return index;
}

export function findMarkers(markers, query, limit = 100) {
  const needle = normalizeText(query);
  if (!needle) return [];
  const index = getSearchIndex(markers);
  if (index.exact.has(needle)) return index.exact.get(needle).slice(0, limit);
  return index.entries.map(({ marker, names }) => {
    let score = 0;
    if (names.some(name => name.startsWith(needle))) score = 80;
    else if (names.some(name => name.includes(needle))) score = 60;
    return { marker, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.marker.name.localeCompare(b.marker.name)).slice(0, limit).map(x => x.marker);
}

export function planRoute(markers, { maxPoints = 40 } = {}) {
  const groups = new Map();
  for (const marker of markers) { const key = `${marker.layer}:${marker.region || '未知区域'}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(marker); }
  const pages = [];
  for (const [group, points] of groups) {
    const remaining = [...points]; const ordered = []; let current = remaining.shift();
    if (current) ordered.push(current);
    while (remaining.length) { let best = 0; let distance = Infinity; for (let i=0;i<remaining.length;i++){const dx=remaining[i].x-current.x,dy=remaining[i].y-current.y,d=dx*dx+dy*dy;if(d<distance){distance=d;best=i;}} current=remaining.splice(best,1)[0]; ordered.push(current); }
    for (let i=0;i<ordered.length;i+=maxPoints) pages.push({ group, points: ordered.slice(i,i+maxPoints) });
  }
  return pages;
}

export function validateDataset(dataset) {
  if (!dataset || typeof dataset !== 'object') throw new Error('本地点位数据不是对象');
  if (!Array.isArray(dataset.markers) || dataset.markers.length === 0) throw new Error('本地点位数据缺少 markers');
  const invalid = dataset.markers.find(marker => !marker?.name || !Number.isFinite(Number(marker.x)) || !Number.isFinite(Number(marker.y)));
  if (invalid) throw new Error(`本地点位数据含无效记录：${invalid.id || 'unknown'}`);
  return dataset;
}

export async function loadDataset(dataFile) {
  const info = await stat(dataFile);
  const cached = datasetCache.get(dataFile);
  if (cached && cached.mtimeMs === info.mtimeMs && cached.size === info.size) return cached.dataset;
  const dataset = validateDataset(JSON.parse(await readFile(dataFile, 'utf8')));
  datasetCache.set(dataFile, { mtimeMs: info.mtimeMs, size: info.size, dataset });
  return dataset;
}

export function clearDatasetCache(dataFile) {
  if (dataFile) datasetCache.delete(dataFile);
  else datasetCache.clear();
}
