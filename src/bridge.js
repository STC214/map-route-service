import { join } from 'node:path';
import { loadDataset, findMarkers, planRoute } from './query.js';
import { renderCachedPng } from './render.js';
import { renderMapPage } from './map-render.js';
import { normalizeText } from './model.js';

export async function buildRouteReply(query, { root, maxPoints = 40, basemap = true, beforePage } = {}) {
  const dataset = await loadDataset(join(root, 'data', 'markers.json'));
  const matches = findMarkers(dataset.markers, query, 5000);
  if (!matches.length) return { ok: false, text: `未找到“${query}”的地图点位`, nodes: [] };
  const needle = normalizeText(query);
  const exact = matches.some(marker => [marker.name, ...(marker.aliases || [])].some(name => normalizeText(name) === needle));
  const distinctNames = [...new Set(matches.map(marker => marker.name))];
  if (!exact && distinctNames.length > 5) {
    const candidates = distinctNames.slice(0, 8);
    return { ok: false, ambiguous: true, candidates, text: `“${query}”匹配到多个目标，请使用更完整名称：\n${candidates.map(name => `· ${name}`).join('\n')}`, nodes: [] };
  }
  const pages = planRoute(matches, { maxPoints });
  const recommended = (dataset.routes || []).filter(route => {
    const names = [route.name, route.path_name, route.content].map(normalizeText);
    const needle = normalizeText(query);
    return names.some(name => name && (name.includes(needle) || needle.includes(name)));
  }).slice(0, 3);
  const nodes = [{ type: 'text', text: `地图路线：${query}\n命中 ${matches.length} 个点位，共 ${pages.length} 张图\n数据版本：${dataset.version}` }];
  let fallbackPages = 0;
  for (let index = 0; index < pages.length; index++) {
    // 页面严格串行；每页开始前给高优先级签到任务一次抢占机会。
    if (typeof beforePage === 'function') await beforePage({ index, page: index + 1, total: pages.length });
    let image;
    const supportsBaseMap = String(pages[index].group || '').startsWith('surface:');
    if (basemap && supportsBaseMap) {
      try { image = await renderMapPage(pages[index], { dataDir: join(root, 'data'), cacheDir: join(root, 'cache'), title: `地图路线：${query}` }); }
      catch (error) { fallbackPages += 1; image = await renderCachedPng(pages[index], { cacheDir: join(root, 'cache'), key: 'route-fallback', options: { title: `地图路线：${query}（底图回退）` } }); image.fallbackReason = error.message; }
    } else {
      image = await renderCachedPng(pages[index], { cacheDir: join(root, 'cache'), key: basemap ? 'route-layer-fallback' : 'route', options: { title: `地图路线：${query}${basemap ? '（分层地图回退）' : ''}` } });
      if (basemap) { fallbackPages += 1; image.fallbackReason = '地下或附加地图层使用坐标路线图'; }
    }
    nodes.push({ type: 'image', file: image.path, page: index + 1, total: pages.length, cached: image.cached, fallback: Boolean(image.fallbackReason), fallbackReason: image.fallbackReason });
  }
  const routeText = recommended.length
    ? `\n官方推荐路线：\n${recommended.map(route => `${route.path_name || route.name}：${route.url}`).join('\n')}`
    : '';
  nodes.push({ type: 'text', text: `数据来源：官方静态地图点位；结果使用本地缓存顺序渲染。${fallbackPages ? `\n${fallbackPages} 张图片因附加地图层或切片覆盖不足使用坐标路线图。` : ''}${routeText}` });
  return { ok: true, query, count: matches.length, pages: pages.length, fallbackPages, recommended, nodes };
}
