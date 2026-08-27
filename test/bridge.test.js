import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRouteReply } from '../src/bridge.js';

test('机器人桥接生成文本节点和 PNG 节点', async () => { const root=await mkdtemp(join(tmpdir(),'map-route-')); await mkdir(join(root,'data')); await writeFile(join(root,'data','markers.json'),JSON.stringify({version:'v1',markers:[{name:'水晶矿',aliases:[],x:1,y:2,layer:'surface',region:'璃月'}]})); const reply=await buildRouteReply('水晶矿',{root,basemap:false}); assert.equal(reply.ok,true); assert.equal(reply.nodes[1].type,'image'); assert.match(reply.nodes[1].file,/\.png$/); });

test('多页路线逐页调用签到等待钩子', async () => {
  const root = await mkdtemp(join(tmpdir(), 'map-route-pages-'));
  await mkdir(join(root, 'data'));
  await writeFile(join(root, 'data', 'markers.json'), JSON.stringify({
    version: 'v1',
    markers: [
      { name: '水晶矿', aliases: [], x: 1, y: 2, layer: 'surface', region: '璃月' },
      { name: '水晶矿', aliases: [], x: 3, y: 4, layer: 'surface', region: '蒙德' },
    ],
  }));
  let calls = 0;
  const reply = await buildRouteReply('水晶矿', { root, basemap: false, beforePage: async () => { calls++; } });
  assert.equal(reply.pages, 2);
  assert.equal(calls, 2);
});


test('宽泛查询返回候选名称而不是混合绘图', async () => {
  const root = await mkdtemp(join(tmpdir(), 'map-route-candidates-'));
  await mkdir(join(root, 'data'));
  const markers = Array.from({ length: 6 }, (_, index) => ({ name: `测试材料${index + 1}`, aliases: [], x: index, y: index, layer: 'surface', region: '区域' }));
  await writeFile(join(root, 'data', 'markers.json'), JSON.stringify({ version: 'v1', markers }));
  const reply = await buildRouteReply('测试', { root, basemap: false });
  assert.equal(reply.ambiguous, true);
  assert.equal(reply.candidates.length, 6);
  assert.equal(reply.nodes.length, 0);
});
