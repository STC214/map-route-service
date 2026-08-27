const DEFAULT_SOURCE = 'https://game-data.lemonapi.com/gim/markers_all.v5.json';

export function normalizeText(value = '') {
  return String(value).toLocaleLowerCase('zh-CN').replace(/[\s\-_·・,.，。:：/]/g, '');
}

export function normalizeMarker(raw, sourceVersion = '') {
  const meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const name = raw.name ?? meta.name ?? meta.title ?? '';
  return {
    id: String(raw.id ?? raw.mid ?? `${raw.type}:${raw.lng}:${raw.lat}`),
    type: String(raw.type ?? 'unknown'),
    name: String(name),
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
    x: Number(raw.lng ?? raw.x ?? 0), y: Number(raw.lat ?? raw.y ?? 0),
    region: String(meta.region ?? meta.area ?? ''), layer: String(meta.layer ?? 'surface'),
    source: 'appsample', sourceVersion
  };
}

export function parseMarkers(payload, sourceVersion = '') {
  const rows = Array.isArray(payload) ? payload : (payload.markers ?? payload.data ?? []);
  if (!Array.isArray(rows)) throw new Error('点位 JSON 必须是数组或含 markers/data 数组');
  const markers = rows.map(row => normalizeMarker(row, sourceVersion)).filter(m => m.name && Number.isFinite(m.x) && Number.isFinite(m.y));
  if (!markers.length) throw new Error('点位 JSON 校验失败：没有有效点位');
  return markers;
}

export { DEFAULT_SOURCE };

