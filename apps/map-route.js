const BasePlugin = globalThis.plugin;

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { YunzaiRouteController } from '../src/yunzai-controller.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export class MapRouteApp extends BasePlugin {
  constructor() {
    super({
      name: '[地图路线] 本地点位路线',
      dsc: '本地点位查询、顺序渲染和合并转发',
      event: 'message',
      priority: 35,
      rule: [
        { reg: '^#?gs(?:材料|怪物)路线\\s*.+$', fnc: 'route' },
        { reg: '^#?gs哪里有\\s*.+$', fnc: 'route' },
        { reg: '^#?gs.+?路线$', fnc: 'route' },
        { reg: '^#?地图路线\\s*.+$', fnc: 'route' },
        { reg: '^#?gs地图刷新(?:强制)?$', fnc: 'refreshData', permission: 'master' },
        { reg: '^#?gs地图状态$', fnc: 'showStatus' },
        { reg: '^#?gs地图缓存清理$', fnc: 'clearCache', permission: 'master' },
        { reg: '^#?gs地图诊断$', fnc: 'diagnose', permission: 'master' },
        { reg: '^#?gs地图帮助$', fnc: 'help' },
      ],
    });
    this.controller = new YunzaiRouteController({ root });
    this.task = [{ name: '地图路线数据每日增量刷新', cron: '0 10 4 * * ? *', fnc: this.scheduledRefresh.bind(this), log: false }];
  }

  async init() {
    const result = await this.controller.ensureData();
    if (!result.ready) globalThis.logger?.warn?.(`[地图路线]首次数据初始化失败：${result.result?.reason || '未知错误'}`);
  }

  async route() {
    try {
      return await this.controller.query(this.e?.msg, this.e, globalThis.segment);
    } catch (error) {
      globalThis.logger?.error?.(`[地图路线]查询失败：${error.stack || error.message}`);
      await this.reply(`[地图路线]查询处理失败：${error.message}`);
      return true;
    }
  }

  async refreshData() {
    const force = /强制/.test(this.e?.msg || '');
    const result = await this.controller.refresh({ force });
    await this.reply(`[地图路线]${result.reason}${result.manifest?.count ? `\n点位：${result.manifest.count}\n版本：${result.manifest.version}` : ''}`);
    return true;
  }

  async scheduledRefresh() {
    const result = await this.controller.refresh();
    await this.controller.cleanupCache();
    globalThis.logger?.[result.stale ? 'warn' : 'mark']?.(`[地图路线]定时刷新：${result.reason}`);
    return !result.stale;
  }

  async showStatus() {
    const result = await this.controller.status();
    if (!result.ok) await this.reply('[地图路线]尚无本地数据，请由主人发送 #gs地图刷新。');
    else {
      const data = result.manifest;
      await this.reply(`[地图路线]本地数据正常\n点位：${data.count}\n推荐路线：${data.routeCount}\n版本：${data.version}\n更新时间：${data.updatedAt}\n缓存：${result.cache.files} 个文件 / ${formatBytes(result.cache.bytes)}\n渲染队列：运行 ${result.queue.active}，等待 ${result.queue.waiting}`);
    }
    return true;
  }

  async clearCache() {
    const result = await this.controller.cleanupCache({ maxBytes: 0, maxAgeDays: 0 });
    await this.reply(`[地图路线]缓存清理完成：${result.removedFiles} 个文件，释放 ${formatBytes(result.removedBytes)}。点位数据保留。`);
    return true;
  }

  async diagnose() {
    const result = await this.controller.diagnose();
    await this.reply(`[地图路线]诊断${result.ok ? '正常' : '异常'}\n数据：${result.data}\n版本：${result.version}\n缓存：${result.cache.files} 个 / ${formatBytes(result.cache.bytes)}\n队列：运行 ${result.queue.active}，等待 ${result.queue.waiting}\n环境：Node ${result.node} · ${result.platform}`);
    return true;
  }

  async help() {
    await this.reply([
      '[地图路线]指令',
      '#gs目标路线',
      '#gs材料路线 目标',
      '#gs怪物路线 目标',
      '#gs哪里有 目标',
      '#地图路线 目标',
      '#gs地图状态',
      '#gs地图刷新（主人）',
      '#gs地图刷新强制（主人）',
      '#gs地图缓存清理（主人）',
      '#gs地图诊断（主人）',
    ].join('\n'));
    return true;
  }
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
