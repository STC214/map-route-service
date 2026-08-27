import test from 'node:test';
import assert from 'node:assert/strict';
import { pointToMapPixel } from '../src/basemap.js';

test('官方 CRS 使用 origin 与 padding 加点位坐标',()=>{assert.deepEqual(pointToMapPixel({x:-100,y:200},{origin:[1000,500],padding:[20,30]}),{x:920,y:730});});
