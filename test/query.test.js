import test from 'node:test';
import assert from 'node:assert/strict';
import { findMarkers, planRoute } from '../src/query.js';
import { normalizeText, parseMarkers } from '../src/model.js';

test('名称规范化和点位解析', () => { assert.equal(normalizeText('遗迹-守卫'), '遗迹守卫'); const rows=parseMarkers([{id:1,type:'monster',name:'遗迹守卫',lng:1,lat:2}],'v'); assert.equal(rows[0].sourceVersion,'v'); });
test('名称查询支持前缀', () => { const rows=[{name:'幽光萤石',aliases:[],x:0,y:0,layer:'surface',region:'璃月'}]; assert.equal(findMarkers(rows,'幽光')[0].name,'幽光萤石'); });
test('路线按区域分页', () => { const rows=Array.from({length:45},(_,i)=>({name:`p${i}`,x:i,y:0,layer:'surface',region:'璃月'})); const pages=planRoute(rows,{maxPoints:40}); assert.equal(pages.length,2); assert.equal(pages[0].points.length,40); });

test('精确别名只返回对应目标', () => {
  const markers = [
    { name: '水晶块', aliases: ['水晶矿'], x: 1, y: 1 },
    { name: '魔水晶矿', aliases: [], x: 2, y: 2 },
  ];
  assert.deepEqual(findMarkers(markers, '水晶矿').map(marker => marker.name), ['水晶块']);
});
