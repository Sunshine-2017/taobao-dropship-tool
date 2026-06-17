import { Router } from 'express';
import { getDb } from '../sqlite.js';
import { extractProductInfo } from '../services/url-extractor.js';
import { applyPricing } from '../services/pricing.js';
// @ts-expect-error — JS module, legacy
import { search1688 } from '../services/sourcing-search.js';
const router = Router();
function rowToProduct(row) {
    return row;
}
function rowToSource(row) {
    return row;
}
// ── Search 1688 ──────────────────────────────────────────────────
router.post('/search', async (req, res) => {
    const { keyword, minPrice, maxPrice, limit, province } = req.body;
    if (!keyword || !keyword.trim()) {
        return res.status(400).json({ error: '请输入搜索关键词' });
    }
    try {
        const result = await search1688(keyword.trim(), {
            minPrice: minPrice ? parseFloat(minPrice) : undefined,
            maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
            limit: parseInt(limit) || 20,
            province: province || undefined,
        });
        res.json({ ok: true, keyword: result.keyword, products: result.products, totalResults: result.totalResults, source: result.source || 'real' });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[搜索] 搜索失败:', message);
        res.status(500).json({ ok: false, error: '1688搜索暂时不可用', products: [] });
    }
});
// ── Extract URL ──────────────────────────────────────────────────
router.post('/extract-url', async (req, res) => {
    const d = getDb();
    const { url } = req.body;
    if (!url)
        return res.status(400).json({ error: '请输入商品链接' });
    try {
        const info = await extractProductInfo(url);
        if (info) {
            const stmt = d.prepare("INSERT INTO source_products (platform, source_id, title, price, images, description, specs, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))");
            const r = stmt.run(info.platform || detectPlatform(url), info.source_id || '', info.title || '', info.price || 0, JSON.stringify(info.images || []), info.description || '', JSON.stringify(info.specs || {}), url);
            const saved = d.prepare('SELECT * FROM source_products WHERE id = ?').get(r.lastInsertRowid);
            res.json({ ok: true, source: rowToSource(saved), extracted: info });
        }
        else {
            res.json({ ok: false, platform: detectPlatform(url), message: '无法自动提取信息，请手动填写' });
        }
    }
    catch {
        res.json({ ok: false, platform: detectPlatform(url), message: '提取失败，请手动填写商品信息' });
    }
});
// ── Import manual ────────────────────────────────────────────────
router.post('/import-manual', (req, res) => {
    const d = getDb();
    const { products } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ error: '请提供商品信息' });
    }
    const sourceStmt = d.prepare("INSERT INTO source_products (platform, source_id, title, price, images, description, specs, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))");
    const productStmt = d.prepare("INSERT INTO my_products (source_product_id, title, cost_price, selling_price, profit_margin, description, images, category, tags, platform, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))");
    const imported = [];
    const tx = d.transaction(() => {
        for (const item of products) {
            if (!item.title)
                continue;
            const costPrice = parseFloat(item.price) || parseFloat(item.cost_price) || 0;
            const pricing = applyPricing(costPrice);
            const sr = sourceStmt.run(item.platform || '1688', item.source_id || '', item.title, costPrice, JSON.stringify(item.images || []), item.description || '', JSON.stringify(item.specs || {}), item.url || '');
            const pr = productStmt.run(sr.lastInsertRowid, item.title, pricing.cost_price, pricing.selling_price, pricing.profit_margin, item.description || '', JSON.stringify(item.images || []), item.category || '', item.tags || '', item.platform || '1688');
            imported.push(rowToProduct(d.prepare('SELECT * FROM my_products WHERE id = ?').get(pr.lastInsertRowid)));
        }
    });
    tx();
    res.json({ ok: true, imported: imported.length, products: imported });
});
// ── Import from source ───────────────────────────────────────────
router.post('/import', (req, res) => {
    const d = getDb();
    const { sourceIds } = req.body;
    if (!sourceIds || !Array.isArray(sourceIds))
        return res.status(400).json({ error: '请选择要导入的商品' });
    const imported = [];
    const getSource = d.prepare('SELECT * FROM source_products WHERE id = ?');
    const checkExisting = d.prepare('SELECT COUNT(*) as count FROM my_products WHERE source_product_id = ?');
    const insertStmt = d.prepare("INSERT INTO my_products (source_product_id, title, cost_price, selling_price, profit_margin, description, images, category, tags, platform, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))");
    const tx = d.transaction(() => {
        for (const sourceId of sourceIds) {
            const source = getSource.get(parseInt(sourceId));
            if (!source)
                continue;
            const existing = checkExisting.get(parseInt(sourceId));
            if (existing.count > 0)
                continue;
            const pricing = applyPricing(source.price || 0);
            const pr = insertStmt.run(source.id, source.title, pricing.cost_price, pricing.selling_price, pricing.profit_margin, source.description || '', source.images || '', '', '', source.platform || '');
            imported.push(rowToProduct(d.prepare('SELECT * FROM my_products WHERE id = ?').get(pr.lastInsertRowid)));
        }
    });
    tx();
    res.json({ ok: true, imported: imported.length, products: imported });
});
function detectPlatform(url) {
    if (url.includes('1688.com'))
        return '1688';
    if (url.includes('pinduoduo.com') || url.includes('yangkeduo.com'))
        return 'pdd';
    if (url.includes('jd.com'))
        return 'jd';
    if (url.includes('taobao.com'))
        return 'taobao';
    return 'other';
}
export default router;
//# sourceMappingURL=sourcing-sqlite.js.map