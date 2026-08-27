let tail = Promise.resolve();
let active = 0;
let waiting = 0;

export function getRenderQueueStatus() {
  return { active, waiting };
}

export async function enqueueRender(work) {
  waiting += 1;
  const previous = tail.catch(() => {});
  let release;
  tail = new Promise(resolve => { release = resolve; });
  await previous;
  waiting -= 1;
  active += 1;
  try {
    return await work();
  } finally {
    active -= 1;
    release();
  }
}
