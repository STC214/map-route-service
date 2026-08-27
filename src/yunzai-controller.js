import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRouteReply } from './bridge.js';
import { refresh } from './sync.js';
import { clearDatasetCache, loadDataset } from './query.js';
import { enqueueRender, getRenderQueueStatus } from './render-queue.js';
import { cleanupCache, inspectCache } from './cache.js';

export function parseRouteQuery(message = '') {
  const text = String(message).trim();
  const patterns = [
    /^#?gs(?:材料|怪物)路线\s*(.+)$/i,
    /^#?gs哪里有\s*(.+)$/i,
    /^#?gs(.+?)路线$/i,
    /^#?地图路线\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return '';
}

export class YunzaiRouteController {
  constructor({ root, buildReply = buildRouteReply, refreshData = refresh } = {}) {
    this.root = root;
    this.buildReply = buildReply;
    this.refreshData = refreshData;
  }

  get dataFile() { return join(this.root, 'data', 'markers.json'); }
  get manifestFile() { return join(this.root, 'data', 'manifest.json'); }

  async ensureData() {
    try {
      await access(this.dataFile);
      await loadDataset(this.dataFile);
      return { ready: true, refreshed: false };
    } catch {
      const result = await this.refresh({ force: true });
      return { ready: !result.stale, refreshed: true, result };
    }
  }

  async refresh({ force = false } = {}) {
    const result = await this.refreshData({ dataFile: this.dataFile, manifestFile: this.manifestFile, force });
    if (result.updated) clearDatasetCache(this.dataFile);
    return result;
  }

  async status() {
    try {
      const manifest = JSON.parse(await readFile(this.manifestFile, 'utf8'));
      await loadDataset(this.dataFile);
      return { ok: true, manifest, queue: getRenderQueueStatus(), cache: await inspectCache(join(this.root, 'cache')) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async cleanupCache(options) {
    return enqueueRender(() => cleanupCache(join(this.root, 'cache'), options));
  }

  async diagnose() {
    const status = await this.status();
    return {
      ok: status.ok,
      data: status.ok ? `${status.manifest.count} 点位 / ${status.manifest.routeCount} 推荐路线` : status.error,
      version: status.manifest?.version || '-',
      queue: status.queue || getRenderQueueStatus(),
      cache: status.cache || await inspectCache(join(this.root, 'cache')),
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
    };
  }

  async query(message, event, segmentApi = globalThis.segment) {
    const query = parseRouteQuery(message);
    if (!query) return false;
    const ready = await this.ensureData();
    if (!ready.ready) {
      await event.reply(`[地图路线]首次数据初始化失败：${ready.result?.reason || '数据源暂不可用'}`);
      return true;
    }

    const result = await enqueueRender(async () => {
      const reply = await this.buildReply(query, {
        root: this.root,
        maxPoints: 40,
        basemap: true,
        beforePage: waitForLotusSignin,
      });
      if (reply.ok) await sendRouteResult(event, reply, segmentApi);
      return reply;
    });
    if (!result.ok) {
      await event.reply(`[地图路线]${result.text}`);
      return true;
    }
    return true;
  }
}

export async function waitForLotusSignin() {
  const coordinator = globalThis.__LOTUS_SIGNIN_COORDINATOR__;
  if (typeof coordinator?.waitForSignin === 'function') await coordinator.waitForSignin();
}

export async function sendRouteResult(event, result, segmentApi = globalThis.segment) {
  const payloads = result.nodes.map(node => {
    if (node.type === 'image') {
      const image = segmentApi?.image;
      return typeof image === 'function'
        ? [`第 ${node.page}/${node.total} 张\n`, image(node.file)]
        : `第 ${node.page}/${node.total} 张：${node.file}`;
    }
    return node.text;
  });
  const imageCount = result.nodes.filter(node => node.type === 'image').length;
  if (imageCount <= 1) {
    await event.reply(payloads.flat());
    return { forward: false };
  }

  const bot = event.bot || globalThis.Bot?.[event.self_id] || globalThis.Bot || {};
  const userId = String(bot.uin || bot.self_id || event.self_id || event.user_id || '0');
  const nickname = String(bot.nickname || bot.name || '地图路线');
  const nodes = payloads.map(message => ({ user_id: userId, nickname, message }));
  let forward;
  if (typeof event.group?.makeForwardMsg === 'function') forward = await event.group.makeForwardMsg(nodes);
  else if (typeof event.friend?.makeForwardMsg === 'function') forward = await event.friend.makeForwardMsg(nodes);
  else if (typeof bot.makeForwardMsg === 'function') forward = await bot.makeForwardMsg(nodes);

  if (forward) {
    await event.reply(forward);
    return { forward: true };
  }
  for (const payload of payloads) await event.reply(payload);
  return { forward: false, fallback: true };
}
