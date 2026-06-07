import { Router } from 'express';
import { readTable, findById, insert } from '../db.js';
import { extractProductInfo } from '../services/url-extractor.js';
import { applyPricing } from '../services/pricing.js';
import { search1688 } from '../services/sourcing-search.js';

const router = Router();

// Search 1688 for products
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

    res.json({
      ok: true,
      keyword: result.keyword,
      products: result.products,
      totalResults: result.totalResults,
    });
  } catch (err) {
    console.error('[搜索] 搜索失败:', err.message);
    res.status(500).json({
      ok: false,
      error: '1688搜索暂时不可用，请稍后重试',
      products: [],
    });
  }
});

// Extract product info from a URL (best effort)
router.post('/extract-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: '请输入商品链接' });

  try {
    const info = await extractProductInfo(url);
    if (info) {
      const saved = insert('source_products', {
        platform: info.platform || detectPlatform(url),
        source_id: info.source_id || '',
        title: info.title || '',
        price: info.price || 0,
        images: JSON.stringify(info.images || []),
        description: info.description || '',
        specs: JSON.stringify(info.specs || {}),
        url,
        created_at: new Date().toISOString(),
      });
      res.json({ ok: true, source: saved, extracted: info });
    } else {
      res.json({ ok: false, platform: detectPlatform(url), message: '无法自动提取信息，请手动填写' });
    }
  } catch {
    res.json({ ok: false, platform: detectPlatform(url), message: '提取失败，请手动填写商品信息' });
  }
});

// Direct manual import — create product in library immediately
router.post('/import-manual', (req, res) => {
  const { products } = req.body;
  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: '请提供商品信息' });
  }

  const imported = [];
  for (const item of products) {
    if (!item.title) continue;
    const costPrice = parseFloat(item.price) || parseFloat(item.cost_price) || 0;
    const pricing = applyPricing(costPrice);

    const source = insert('source_products', {
      platform: item.platform || '1688',
      source_id: item.source_id || '',
      title: item.title,
      price: costPrice,
      images: JSON.stringify(item.images || []),
      description: item.description || '',
      specs: JSON.stringify(item.specs || {}),
      url: item.url || '',
      created_at: new Date().toISOString(),
    });

    const product = insert('my_products', {
      source_product_id: source.id,
      title: item.title,
      cost_price: pricing.cost_price,
      selling_price: pricing.selling_price,
      profit_margin: pricing.profit_margin,
      description: item.description || '',
      images: JSON.stringify(item.images || []),
      category: item.category || '',
      tags: item.tags || '',
      platform: item.platform || '1688',
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    imported.push(product);
  }

  res.json({ ok: true, imported: imported.length, products: imported });
});

// Import from existing source_products into my_products
router.post('/import', (req, res) => {
  const { sourceIds } = req.body;
  if (!sourceIds || !Array.isArray(sourceIds)) {
    return res.status(400).json({ error: '请选择要导入的商品' });
  }

  const imported = [];
  for (const sourceId of sourceIds) {
    const source = findById('source_products', parseInt(sourceId));
    if (!source) continue;

    const existing = readTable('my_products').filter(p => p.source_product_id === parseInt(sourceId));
    if (existing.length > 0) continue;

    const pricing = applyPricing(source.price || 0);
    const product = insert('my_products', {
      source_product_id: source.id,
      title: source.title,
      cost_price: pricing.cost_price,
      selling_price: pricing.selling_price,
      profit_margin: pricing.profit_margin,
      description: source.description || '',
      images: source.images || '[]',
      category: '',
      tags: '',
      platform: source.platform || '',
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    imported.push(product);
  }

  res.json({ ok: true, imported: imported.length, products: imported });
});

function detectPlatform(url) {
  if (url.includes('1688.com')) return '1688';
  if (url.includes('pinduoduo.com') || url.includes('yangkeduo.com')) return 'pdd';
  if (url.includes('jd.com')) return 'jd';
  if (url.includes('taobao.com')) return 'taobao';
  return 'other';
}

export default router;
