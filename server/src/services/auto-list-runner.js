/**
 * Background auto-list task runner
 *
 * Manages async auto-list tasks so the API returns immediately
 * while the browser automation runs in the background.
 * Frontend polls GET /api/listings/auto-list-task/:taskId for progress.
 */

import { batchListToTaobao } from './taobao-auto-list.js';

// In-memory task store (tasks are ephemeral — survive only as long as the process)
const tasks = new Map();
let nextId = 1;

/**
 * Create and start a background auto-list task.
 * Returns immediately with a taskId.
 *
 * @param {Array} products — product objects
 * @param {string|null} overrideCategory
 * @param {Object|null} overridePrices
 * @returns {{ taskId: string }}
 */
export function startAutoListTask(products, overrideCategory, overridePrices) {
  const taskId = `auto_${Date.now()}_${nextId++}`;

  const task = {
    id: taskId,
    status: 'running',    // running | complete | error
    progress: '正在启动浏览器...',
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    error: null,
    cancel: false,
  };
  tasks.set(taskId, task);

  // Run in background — don't await
  runTask(taskId, products, overrideCategory, overridePrices).catch(() => {});

  return { taskId };
}

/**
 * Get current task status.
 * @param {string} taskId
 * @returns {Object|null}
 */
export function getTaskStatus(taskId) {
  const t = tasks.get(taskId);
  if (!t) return null;
  return {
    id: t.id,
    status: t.status,
    progress: t.progress,
    startedAt: t.startedAt,
    completedAt: t.completedAt,
    result: t.result,
    error: t.error,
  };
}

/**
 * Progress callback used inside the auto-list module.
 * Called by setTaskProgress() which is injected into the batchListToTaobao scope.
 */
export function setTaskProgress(taskId, message) {
  const t = tasks.get(taskId);
  if (t) {
    t.progress = message;
    // Truncate progress in logs
    console.log(`[Task ${taskId.slice(-8)}] ${message}`);
  }
}

/**
 * Cancel a running task by setting its cancel flag.
 * The actual cancellation depends on the running code checking this flag
 * between operations.
 */
export function cancelTask(taskId) {
  const t = tasks.get(taskId);
  if (t && t.status === 'running') {
    t.cancel = true;
    t.progress = '正在取消...';
    return true;
  }
  return false;
}

// ── Internal ────────────────────────────────────────────────────────

async function runTask(taskId, products, overrideCategory, overridePrices) {
  const t = tasks.get(taskId);
  if (!t) return;

  try {
    setTaskProgress(taskId, `准备为 ${products.length} 件商品上架...`);

    const result = await batchListToTaobao(products, overrideCategory, overridePrices, {
      taskId,
      onProgress: (msg) => setTaskProgress(taskId, msg),
    });

    if (tasks.get(taskId)?.cancel) {
      t.status = 'cancelled';
      t.progress = '用户取消';
    } else {
      t.status = 'complete';
      t.result = result;
      const ok = result.results?.filter(r => r.success).length || 0;
      t.progress = `${ok}/${products.length} 件上架成功`;
    }
  } catch (err) {
    t.status = 'error';
    t.error = err.message;
    t.progress = `错误: ${err.message}`;
    console.error(`[Task ${taskId.slice(-8)}] Error:`, err);
  }

  t.completedAt = new Date().toISOString();
  console.log(`[Task ${taskId.slice(-8)}] Done: ${t.status}`);
}
