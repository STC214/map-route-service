import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { refresh } from './sync.js';
import { findMarkers, loadDataset, planRoute } from './query.js';
import { renderCachedPng } from './render.js';
import { renderMapPage } from './map-render.js';

const root = new URL('../', import.meta.url).pathname.replace(/^\/(\w):/, '$1:');
const dataFile = join(root, 'data', 'markers.json'); const manifestFile = join(root, 'data', 'manifest.json');
await mkdir(join(root, 'data'), { recursive: true });
const [command, ...args] = process.argv.slice(2);
if (command === 'refresh') { console.log(JSON.stringify(await refresh({ dataFile, manifestFile }), null, 2)); process.exit(0); }
let dataset; try { dataset = await loadDataset(dataFile); } catch { console.error('暂无本地数据，请先执行 node src/cli.js refresh'); process.exit(1); }
const matches = findMarkers(dataset.markers, args.join(' '));
if (!matches.length) { console.log('未找到匹配点位；可执行 refresh 更新数据。'); process.exit(0); }
if (command === 'route') {
  console.log(JSON.stringify(planRoute(matches), null, 2));
} else if (command === 'render') {
  const pages = planRoute(matches);
  for (let i = 0; i < pages.length; i++) {
    const result = await renderCachedPng(pages[i], { cacheDir: join(root, 'cache'), key: 'route', options: { title: '地图路线：' + args.join(' ') } });
    console.log(JSON.stringify({ page: i + 1, path: result.path, cached: result.cached }));
  }
} else if (command === 'map') {
  const pages = planRoute(matches);
  for (let i = 0; i < pages.length; i++) {
    let result;
    try { result = await renderMapPage(pages[i], { dataDir: join(root, 'data'), cacheDir: join(root, 'cache'), title: '地图路线：' + args.join(' ') }); }
    catch { result = await renderCachedPng(pages[i], { cacheDir: join(root, 'cache'), key: 'route-fallback', options: { title: '地图路线：' + args.join(' ') + '（底图回退）' } }); }
    console.log(JSON.stringify({ page: i + 1, path: result.path, cached: result.cached }));
  }
} else {
  console.log(JSON.stringify(matches, null, 2));
}

