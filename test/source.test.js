import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenLabels } from '../src/sources/hoyolab.js';

test('官方标签树展开中文名称', () => { const map=flattenLabels([{name:'怪物',children:[{id:50,name:'遗迹守卫',alias_name:'遗迹 机器人'}]}]); assert.equal(map.get(50).name,'遗迹守卫'); assert.deepEqual(map.get(50).aliases,['遗迹','机器人']); });
