import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDb } from '../sqlite.js';
import { generateTaobaoCSV } from '../services/taobao-csv.js';
import { startAutoListTask, getTaskStatus, cancelTask } from '../services/auto-list-runner.js';
import type { Listing, Product } from '../db.js';

const router = Router();

function rowToListing(row: Record<string, unknown>): Listing {
  return row as unknown as Listing;
}

function rowToProduct(row: Record<string, unknown>): Product {
  return row as unknown as Product;
}

// ── List listings ────────────────────────────────────────────────
router.get('/', (req: Request, res: Response) => {
  const d = getDb();
  const { page = '1', pageSize = '20', status } = req.query as Record<string, string>;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (status) { conditions.push('status = ?'); params.push(status); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
  const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;

  const countRow = d.prepare(`SELECT COUNT(*) as count FROM listings ${where}`).get(...params) as { count: number };
  const rows = d.prepare(`SELECT * FROM listings ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

  res.json({
    items: rows.map(r => rowToListing(r as Record<string, unknown>)),
    total: countRow.count,
    page: parseInt(page),
    pageSize: limit,
    totalPages: Math.ceil(countRow.count / limit),
  });
});

// ── Generate CSV ─────────────────────────────────────────────────
router.post('/generate-csv', (req: Request, res: Response) => {
  const d = getDb();
  const { productIds, keyword } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要上架的商品' });
  }

  const products: Product[] = [];
  const getStmt = d.prepare('SELECT * FROM my_products WHERE id = ?');
  for (const id of productIds) {
    const row = getStmt.get(parseInt(id)) as Record<string, unknown> | undefined;
    if (row) products.push(rowToProduct(row));
  }
  if (products.length === 0) return res.status(400).json({ error: '未找到有效商品' });

  const csvPath = generateTaobaoCSV(products, keyword as string);

  const insertStmt = d.prepare("INSERT INTO listings (product_id, taobao_item_id, status, csv_path, listed_at, created_at) VALUES (?, NULL, 'pending', ?, NULL, datetime('now'))");
  const updateStmt = d.prepare("UPDATE my_products SET status = 'ready', updated_at = datetime('now') WHERE id = ?");
  const listings: Listing[] = [];

  const tx = d.transaction(() => {
    for (const product of products) {
      const r = insertStmt.run(product.id, csvPath);
      updateStmt.run(product.id);
      listings.push(rowToListing(d.prepare('SELECT * FROM listings WHERE id = ?').get(r.lastInsertRowid) as Record<string, unknown>));
    }
  });
  tx();

  res.json({
    ok: true,
    csvPath,
    fileName: csvPath.split('/').pop()!.split('\\').pop(),
    count: listings.length,
    listings,
  });
});

// ── Download CSV ─────────────────────────────────────────────────
router.get('/download/:fileName', (req: Request, res: Response) => {
  const filePath = join(process.cwd(), 'data', 'exports', String(req.params.fileName));
  res.download(filePath, String(req.params.fileName));
});

// ── Update listing status ────────────────────────────────────────
router.put('/:id', (req: Request, res: Response) => {
  const d = getDb();
  const id = parseInt(String(req.params.id));
  const existing = d.prepare('SELECT * FROM listings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const now = "datetime('now')";
  const updates = req.body;
  const fields = Object.keys(updates).filter(k => k !== 'id').map(k => `${k} = ?`);
  if (updates.status === 'listed') fields.push(`listed_at = ${now}`);
  if (fields.length === 0) return res.json(rowToListing(existing));

  const values = Object.keys(updates).filter(k => k !== 'id').map(k => updates[k]);
  d.prepare(`UPDATE listings SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);

  if (updates.status === 'listed') {
    d.prepare(`UPDATE my_products SET status = 'listed', updated_at = ${now} WHERE id = ?`).run(existing.product_id);
  }

  const updated = d.prepare('SELECT * FROM listings WHERE id = ?').get(id) as Record<string, unknown>;
  res.json(rowToListing(updated));
});

// ── Delete listing ───────────────────────────────────────────────
router.delete('/:id', (req: Request, res: Response) => {
  const d = getDb();
  const id = parseInt(String(req.params.id));
  const existing = d.prepare('SELECT * FROM listings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  d.prepare("UPDATE my_products SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(existing.product_id);
  d.prepare('DELETE FROM listings WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── Auto-list status ─────────────────────────────────────────────
router.get('/auto-list-status', async (_req: Request, res: Response) => {
  const profileDir = join(process.cwd(), 'data', 'taobao-profile');
  res.json({
    ok: true,
    hasProfile: existsSync(profileDir),
    hasScreenshots: existsSync(join(process.cwd(), 'data', 'screenshots')),
    message: existsSync(profileDir) ? '浏览器Profile已存在（可能已登录）' : '首次使用需要登录淘宝',
  });
});

// ── Auto-list to Taobao (background) ────────────────────────────────
router.post('/auto-list', async (req: Request, res: Response) => {
  const d = getDb();
  const { productIds, category: overrideCategory, prices: overridePrices } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要上架的商品' });
  }

  const getStmt = d.prepare('SELECT * FROM my_products WHERE id = ?');
  const products: Product[] = [];
  for (const id of productIds) {
    const row = getStmt.get(parseInt(id)) as Record<string, unknown> | undefined;
    if (row) products.push(rowToProduct(row));
  }
  if (products.length === 0) return res.status(400).json({ error: '未找到有效商品' });

  // Start background task and return taskId immediately
  const { taskId } = startAutoListTask(products, overrideCategory || null, overridePrices || null);
  res.json({ ok: true, taskId, message: '上架任务已启动', productCount: products.length });
});

// ── Poll auto-list task status ───────────────────────────────────────
router.get('/auto-list-task/:taskId', (req: Request, res: Response) => {
  const task = getTaskStatus(String(req.params.taskId));
  if (!task) return res.status(404).json({ error: '任务不存在' });
  res.json(task);
});

// ── Cancel auto-list task ───────────────────────────────────────────
router.post('/auto-list-task/:taskId/cancel', (req: Request, res: Response) => {
  const ok = cancelTask(String(req.params.taskId));
  res.json({ ok, message: ok ? '正在取消' : '任务不存在或已完成' });
});

export default router;
