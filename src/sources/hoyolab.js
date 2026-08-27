import { fetchWithTimeout } from '../http.js';

const HOST = 'https://sg-public-api-static.hoyolab.com';
export const HOYOLAB_SOURCE = 'hoyolab:ys_obc:map:2:zh-cn';

async function getJson(url, fetchImpl) {
  const response = await fetchWithTimeout(fetchImpl, url, { timeoutMs: 20000 });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.retcode !== 0) throw new Error(`retcode ${body.retcode}: ${body.message}`);
  return { body, response };
}

export function flattenLabels(tree = []) {
  const labels = new Map();
  for (const group of tree) for (const leaf of group.children || []) {
    const aliases = [leaf.alias_name].filter(Boolean).flatMap(v => String(v).split(/[，,、\s]+/)).filter(Boolean);
    labels.set(Number(leaf.id), { name: String(leaf.name), aliases, category: String(group.name || ''), icon: String(leaf.icon || ''), routes: leaf.recommend_route_list || [] });
  }
  return labels;
}

export async function fetchHoyolabMarkers(fetchImpl = fetch) {
  const base = `${HOST}/common/map_user/ys_obc`;
  const pointUrl = `${base}/v1/map/point/list?map_id=2&app_sn=ys_obc&lang=zh-cn`;
  const labelUrl = `${base}/v2/map/label/tree?map_id=2&app_sn=ys_obc&lang=zh-cn`;
  const [{ body: pointsBody, response }, { body: labelsBody }] = await Promise.all([getJson(pointUrl, fetchImpl), getJson(labelUrl, fetchImpl)]);
  const labels = flattenLabels(labelsBody.data?.tree || []);
  const markers = (pointsBody.data?.point_list || []).map(point => {
    const label = labels.get(Number(point.label_id));
    if (!label) return null;
    return { id: `hoyolab:${point.id}`, type: label.category || 'unknown', labelId: Number(point.label_id), name: label.name, aliases: label.aliases, x: Number(point.x_pos), y: Number(point.y_pos), region: `area:${point.area_id}`, areaId: Number(point.area_id), layer: Number(point.z_level || 0) === 0 ? 'surface' : `z:${point.z_level}`, zLevel: Number(point.z_level || 0), icon: label.icon, source: 'hoyolab' };
  }).filter(Boolean);
  if (!markers.length) throw new Error('官方点位响应中没有可用记录');
  return {
    markers,
    version: response.headers.get('last-modified') || response.headers.get('etag') || null,
    etag: response.headers.get('etag') || undefined,
    routes: [...labels.values()].flatMap(x => x.routes),
  };
}

