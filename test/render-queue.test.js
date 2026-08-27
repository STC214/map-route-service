import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueueRender, getRenderQueueStatus } from '../src/render-queue.js';

test('并发地图任务按进入顺序串行执行', async () => {
  const events = [];
  const first = enqueueRender(async () => { events.push('a:start'); await new Promise(resolve => setTimeout(resolve, 20)); events.push('a:end'); });
  const second = enqueueRender(async () => { events.push('b:start'); events.push('b:end'); });
  await Promise.all([first, second]);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
  assert.deepEqual(getRenderQueueStatus(), { active: 0, waiting: 0 });
});
