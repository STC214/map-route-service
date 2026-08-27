export async function fetchWithTimeout(fetchImpl, url, { timeoutMs = 15000, ...options } = {}) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) abort();
    else externalSignal.addEventListener('abort', abort, { once: true });
  }
  let rejectTimeout;
  const timeout = new Promise((_, reject) => { rejectTimeout = reject; });
  const timer = setTimeout(() => {
    const error = new Error(`请求超时（${timeoutMs}ms）：${url}`);
    controller.abort(error);
    rejectTimeout(error);
  }, timeoutMs);
  timer.unref?.();
  try {
    return await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), timeout]);
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) throw new Error(`请求超时（${timeoutMs}ms）：${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abort);
  }
}
