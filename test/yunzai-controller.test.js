import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRouteQuery, sendRouteResult, waitForLotusSignin } from '../src/yunzai-controller.js';

test('解析地图路线指令且不接管无关消息', () => {
  assert.equal(parseRouteQuery('#gs遗迹守卫路线'), '遗迹守卫');
  assert.equal(parseRouteQuery('#gs怪物路线 遗迹守卫'), '遗迹守卫');
  assert.equal(parseRouteQuery('#gs哪里有 幽光萤石'), '幽光萤石');
  assert.equal(parseRouteQuery('#更新面板'), '');
});

test('多图只发送一条合并转发消息', async () => {
  const replies = [];
  let forwarded;
  const event = {
    user_id: 1,
    bot: { uin: 2, nickname: '测试机器人' },
    group: { async makeForwardMsg(nodes) { forwarded = nodes; return { type: 'forward', nodes }; } },
    async reply(payload) { replies.push(payload); },
  };
  const result = {
    nodes: [
      { type: 'text', text: '摘要' },
      { type: 'image', file: '1.png', page: 1, total: 2 },
      { type: 'image', file: '2.png', page: 2, total: 2 },
      { type: 'text', text: '来源' },
    ],
  };
  const sent = await sendRouteResult(event, result, { image: file => ({ type: 'image', file }) });
  assert.equal(sent.forward, true);
  assert.equal(forwarded.length, 4);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].type, 'forward');
});

test('每页渲染前等待荷花签到协调器', async () => {
  let waited = 0;
  globalThis.__LOTUS_SIGNIN_COORDINATOR__ = { async waitForSignin() { waited++; } };
  await waitForLotusSignin();
  assert.equal(waited, 1);
  delete globalThis.__LOTUS_SIGNIN_COORDINATOR__;
});

test('Yunzai 入口导出可加载插件并注册定时刷新', async () => {
  globalThis.plugin = class FakePlugin {
    constructor(options) { Object.assign(this, options); }
  };
  const module = await import(`../index.js?test=${Date.now()}`);
  const App = module.apps.mapRoute;
  const app = new App();
  assert.equal(app.priority, 35);
  assert.match(app.task[0].cron, /^0 10 4/);
  assert.ok(app.rule.some(rule => rule.fnc === 'route'));
  delete globalThis.plugin;
});
