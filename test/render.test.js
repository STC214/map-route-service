import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRouteSvg } from '../src/render.js';

test('路线 SVG 渲染包含编号和名称', () => { const svg=renderRouteSvg({group:'璃月',points:[{name:'水晶矿',x:1,y:2}]}); assert.match(svg, /水晶矿/); assert.match(svg, />1<\/text>/); });
