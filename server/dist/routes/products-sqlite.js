import { Router } from 'express';
import { getDb } from '../sqlite.js';
import { applyPricing } from '../services/pricing.js';
import { generateBatchEditExcel } from '../services/taobao-batch-edit.js';
const router = Router();
function rowToProduct(row) {
    return row;
}
// ── List products ──────────────────────────────────────────────
router.get('/', (req, res) => {
    const d = getDb();
    const { page = '1', pageSize = '20', status, platform, category, keyword, sortBy = 'updated_at', sortOrder = 'desc', } = req.query;
    const conditions = [];
    const params = [];
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    if (platform) {
        conditions.push('platform = ?');
        params.push(platform);
    }
    if (category) {
        conditions.push('category = ?');
        params.push(category);
    }
    if (keyword) {
        conditions.push('title LIKE ?');
        params.push(`%${keyword}%`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderCol = ['updated_at', 'created_at', 'id', 'selling_price', 'cost_price'].includes(sortBy)
        ? sortBy : 'updated_at';
    const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(Math.max(parseInt(pageSize) || 20, 1), 100);
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit;
    const countRow = d.prepare(`SELECT COUNT(*) as count FROM my_products ${where}`).get(...params);
    const rows = d.prepare(`SELECT * FROM my_products ${where} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`).all(...params, limit, offset);
    res.json({
        items: rows.map(r => rowToProduct(r)),
        total: countRow.count,
        page: parseInt(page),
        pageSize: limit,
        totalPages: Math.ceil(countRow.count / limit),
    });
});
// ── Get single product ─────────────────────────────────────────
router.get('/:id', (req, res) => {
    const d = getDb();
    const row = d.prepare('SELECT * FROM my_products WHERE id = ?').get(parseInt(String(req.params.id)));
    if (!row)
        return res.status(404).json({ error: '商品不存在' });
    res.json(rowToProduct(row));
});
// ── Create product ─────────────────────────────────────────────
router.post('/', (req, res) => {
    const d = getDb();
    const { title, cost_price, description, images, category, tags } = req.body;
    const pricing = applyPricing(parseFloat(cost_price) || 0);
    const stmt = d.prepare(`
    INSERT INTO my_products (source_product_id, title, cost_price, selling_price, profit_margin,
      description, images, category, tags, status, platform, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'manual', datetime('now'), datetime('now'))
  `);
    const result = stmt.run(null, title || '', pricing.cost_price, pricing.selling_price, pricing.profit_margin, description || '', JSON.stringify(images || []), category || '', tags || '');
    const row = d.prepare('SELECT * FROM my_products WHERE id = ?').get(result.lastInsertRowid);
    res.json(rowToProduct(row));
});
// ── Update product ─────────────────────────────────────────────
router.put('/:id', (req, res) => {
    const d = getDb();
    const id = parseInt(String(req.params.id));
    const existing = d.prepare('SELECT * FROM my_products WHERE id = ?').get(id);
    if (!existing)
        return res.status(404).json({ error: '商品不存在' });
    const updates = { ...req.body };
    if (updates.cost_price !== undefined) {
        const pricing = applyPricing(parseFloat(String(updates.cost_price)));
        updates.selling_price = pricing.selling_price;
        updates.profit_margin = pricing.profit_margin;
    }
    if (Array.isArray(updates.images)) {
        updates.images = JSON.stringify(updates.images);
    }
    const fields = Object.keys(updates)
        .filter(k => k !== 'id')
        .map(k => `${k} = ?`);
    if (fields.length === 0) {
        res.json(rowToProduct(existing));
        return;
    }
    fields.push("updated_at = datetime('now')");
    const values = Object.keys(updates)
        .filter(k => k !== 'id')
        .map(k => updates[k]);
    d.prepare(`UPDATE my_products SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
    const updated = d.prepare('SELECT * FROM my_products WHERE id = ?').get(id);
    res.json(rowToProduct(updated));
});
// ── Delete product ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const d = getDb();
    const result = d.prepare('DELETE FROM my_products WHERE id = ?').run(parseInt(String(req.params.id)));
    if (result.changes === 0)
        return res.status(404).json({ error: '商品不存在' });
    res.json({ ok: true });
});
// ── Batch update price ─────────────────────────────────────────
router.put('/batch/price', (req, res) => {
    const d = getDb();
    const { ids, multiplier, fixed_add } = req.body;
    if (!ids || !Array.isArray(ids))
        return res.status(400).json({ error: '请选择商品' });
    const mul = parseFloat(String(multiplier || 1.8));
    const add = parseFloat(String(fixed_add || 5));
    const stmt = d.prepare("UPDATE my_products SET selling_price = ROUND((cost_price * ? + ?) * 100) / 100, profit_margin = CASE WHEN ROUND((cost_price * ? + ?) * 100) / 100 > 0 THEN ROUND((1 - cost_price / (ROUND((cost_price * ? + ?) * 100) / 100)) * 10000) / 100 ELSE 0 END, updated_at = datetime('now') WHERE id = ?");
    const updateMany = d.transaction((ids) => {
        let count = 0;
        for (const id of ids) {
            const r = stmt.run(mul, add, mul, add, mul, add, id);
            count += r.changes;
        }
        return count;
    });
    const count = updateMany(ids.map(Number));
    res.json({ ok: true, count });
});
export default router;
// ── Export batch-edit Excel ──────────────────────────────────────────────
router.post('/export-batch-edit', (req, res) => {
    const d = getDb();
    const { ids } = req.body;
    let rows;
    if (ids && Array.isArray(ids) && ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        rows = d.prepare(`SELECT * FROM my_products WHERE id IN (${placeholders})`).all(...ids.map(Number));
    }
    else {
        rows = d.prepare('SELECT * FROM my_products ORDER BY updated_at DESC LIMIT 500').all();
    }
    if (rows.length === 0) {
        return res.status(400).json({ error: '没有可导出的商品' });
    }
    const batchRows = rows.map(r => ({
        id: r.id,
        title: r.title,
        price: r.selling_price,
        outerId: `SKU-${r.id}`,
    }));
    const filePath = generateBatchEditExcel(batchRows);
    res.json({ ok: true, file: filePath, count: batchRows.length });
});
//# sourceMappingURL=products-sqlite.js.map