import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { getDb } from '../sqlite.js';
import { generateTaobaoCSV } from '../services/taobao-csv.js';
// @ts-expect-error — JS module, will be migrated to TS soon
import { batchListToTaobao } from '../services/taobao-auto-list.js';
const router = Router();
function rowToListing(row) {
    return row;
}
function rowToProduct(row) {
    return row;
}
// ── List listings ────────────────────────────────────────────────
router.get('/', (req, res) => {
    const d = getDb();
    const { page = '1', pageSize = '20', status } = req.query;
    const conditions = [];
    const params = [];
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;
    const countRow = d.prepare(`SELECT COUNT(*) as count FROM listings ${where}`).get(...params);
    const rows = d.prepare(`SELECT * FROM listings ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({
        items: rows.map(r => rowToListing(r)),
        total: countRow.count,
        page: parseInt(page),
        pageSize: limit,
        totalPages: Math.ceil(countRow.count / limit),
    });
});
// ── Generate CSV ─────────────────────────────────────────────────
router.post('/generate-csv', (req, res) => {
    const d = getDb();
    const { productIds, keyword } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: '请选择要上架的商品' });
    }
    const products = [];
    const getStmt = d.prepare('SELECT * FROM my_products WHERE id = ?');
    for (const id of productIds) {
        const row = getStmt.get(parseInt(id));
        if (row)
            products.push(rowToProduct(row));
    }
    if (products.length === 0)
        return res.status(400).json({ error: '未找到有效商品' });
    const csvPath = generateTaobaoCSV(products, keyword);
    const insertStmt = d.prepare("INSERT INTO listings (product_id, taobao_item_id, status, csv_path, listed_at, created_at) VALUES (?, NULL, 'pending', ?, NULL, datetime('now'))");
    const updateStmt = d.prepare("UPDATE my_products SET status = 'ready', updated_at = datetime('now') WHERE id = ?");
    const listings = [];
    const tx = d.transaction(() => {
        for (const product of products) {
            const r = insertStmt.run(product.id, csvPath);
            updateStmt.run(product.id);
            listings.push(rowToListing(d.prepare('SELECT * FROM listings WHERE id = ?').get(r.lastInsertRowid)));
        }
    });
    tx();
    res.json({
        ok: true,
        csvPath,
        fileName: csvPath.split('/').pop().split('\\').pop(),
        count: listings.length,
        listings,
    });
});
// ── Download CSV ─────────────────────────────────────────────────
router.get('/download/:fileName', (req, res) => {
    const filePath = join(process.cwd(), 'data', 'exports', String(req.params.fileName));
    res.download(filePath, String(req.params.fileName));
});
// ── Update listing status ────────────────────────────────────────
router.put('/:id', (req, res) => {
    const d = getDb();
    const id = parseInt(String(req.params.id));
    const existing = d.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    if (!existing)
        return res.status(404).json({ error: '记录不存在' });
    const now = "datetime('now')";
    const updates = req.body;
    const fields = Object.keys(updates).filter(k => k !== 'id').map(k => `${k} = ?`);
    if (updates.status === 'listed')
        fields.push(`listed_at = ${now}`);
    if (fields.length === 0)
        return res.json(rowToListing(existing));
    const values = Object.keys(updates).filter(k => k !== 'id').map(k => updates[k]);
    d.prepare(`UPDATE listings SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    if (updates.status === 'listed') {
        d.prepare(`UPDATE my_products SET status = 'listed', updated_at = ${now} WHERE id = ?`).run(existing.product_id);
    }
    const updated = d.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    res.json(rowToListing(updated));
});
// ── Delete listing ───────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const d = getDb();
    const id = parseInt(String(req.params.id));
    const existing = d.prepare('SELECT * FROM listings WHERE id = ?').get(id);
    if (!existing)
        return res.status(404).json({ error: '记录不存在' });
    d.prepare("UPDATE my_products SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(existing.product_id);
    d.prepare('DELETE FROM listings WHERE id = ?').run(id);
    res.json({ ok: true });
});
// ── Auto-list status ─────────────────────────────────────────────
router.get('/auto-list-status', async (_req, res) => {
    const profileDir = join(process.cwd(), 'data', 'taobao-profile');
    res.json({
        ok: true,
        hasProfile: existsSync(profileDir),
        hasScreenshots: existsSync(join(process.cwd(), 'data', 'screenshots')),
        message: existsSync(profileDir) ? '浏览器Profile已存在（可能已登录）' : '首次使用需要登录淘宝',
    });
});
// ── Auto-list to Taobao ──────────────────────────────────────────
router.post('/auto-list', async (req, res) => {
    const d = getDb();
    const { productIds, category, prices } = req.body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: '请选择要上架的商品' });
    }
    const getStmt = d.prepare('SELECT * FROM my_products WHERE id = ?');
    const products = [];
    for (const id of productIds) {
        const row = getStmt.get(parseInt(id));
        if (row)
            products.push(rowToProduct(row));
    }
    if (products.length === 0)
        return res.status(400).json({ error: '未找到有效商品' });
    try {
        const result = await batchListToTaobao(products, category, prices);
        const insertStmt = d.prepare("INSERT INTO listings (product_id, taobao_item_id, status, csv_path, listed_at, created_at) VALUES (?, ?, ?, NULL, ?, datetime('now'))");
        const updateStmt = d.prepare(`UPDATE my_products SET status = ?, updated_at = datetime('now') WHERE id = ?`);
        const tx = d.transaction(() => {
            for (const pr of (result.results || [])) {
                const product = products.find(p => p.id === pr.id);
                if (!product)
                    continue;
                insertStmt.run(product.id, pr.taobaoItemId || null, pr.success ? 'listed' : 'failed', pr.success ? "datetime('now')" : null);
                updateStmt.run(pr.success ? 'listed' : 'draft', product.id);
            }
        });
        tx();
        res.json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(500).json({ success: false, message });
    }
});
export default router;
//# sourceMappingURL=listings-sqlite.js.map