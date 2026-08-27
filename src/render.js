import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

function esc(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }

export function renderRouteSvg(page, { width = 1200, height = 760, title = '地图路线' } = {}) {
  const points = page.points || [];
  const xs = points.map(p => p.x); const ys = points.map(p => p.y);
  const minX = Math.min(...xs, 0), maxX = Math.max(...xs, 1), minY = Math.min(...ys, 0), maxY = Math.max(...ys, 1);
  const sx = x => 60 + ((x-minX)/(maxX-minX || 1))*(width-120);
  const sy = y => 110 + ((y-minY)/(maxY-minY || 1))*(height-160);
  const coords = points.map(p => [sx(p.x), sy(p.y)]);
  const line = coords.map(([x,y]) => `${x},${y}`).join(' ');
  const markers = coords.map(([x,y],i) => `<g><circle cx="${x}" cy="${y}" r="16" fill="#1677ff" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y+6}" text-anchor="middle" fill="#fff" font-size="14" font-weight="700">${i+1}</text><text x="${x+22}" y="${y+5}" fill="#263238" font-size="15">${esc(points[i].name)}</text></g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#eef3f8"/><rect x="20" y="20" width="${width-40}" height="${height-40}" rx="18" fill="#fff" stroke="#c6d4e1"/><text x="50" y="62" fill="#17324d" font-size="28" font-weight="700">${esc(title)}</text><text x="50" y="90" fill="#607d8b" font-size="16">${esc(page.group || '未知区域')} · ${points.length} 个点位 · 本地数据</text>${line ? `<polyline points="${line}" fill="none" stroke="#56a3ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}${markers}</svg>`;
}

export async function renderCached(page, { cacheDir, key, options } = {}) {
  await mkdir(cacheDir, { recursive: true });
  const hash = createHash('sha256').update(JSON.stringify({ page, options })).digest('hex').slice(0, 24);
  const target = `${cacheDir}/${key || 'route'}-${hash}.svg`;
  try { return { path: target, cached: true, svg: await readFile(target, 'utf8') }; } catch {}
  const tmp = `${target}.tmp`; const svg = renderRouteSvg(page, options); await writeFile(tmp, svg, 'utf8'); await rename(tmp, target);
  return { path: target, cached: false, svg };
}

export async function renderCachedPng(page, { cacheDir, key, options } = {}) {
  const svgResult = await renderCached(page, { cacheDir, key, options });
  const target = svgResult.path.replace(/\.svg$/, '.png');
  try { await readFile(target); return { path: target, cached: true }; } catch {}
  const tmp = `${target}.tmp`;
  await sharp(Buffer.from(svgResult.svg)).png({ compressionLevel: 9 }).toFile(tmp);
  await rename(tmp, target);
  return { path: target, cached: false };
}
