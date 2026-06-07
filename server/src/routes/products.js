import { Router } from 'express';
import { paginate, findById, insert, update, remove } from '../db.js';
import { applyPricing } from '../services/pricing.js';

const router = Router();

// List products with pagination and filters
router.get('/', (req, res) => {
  const { page, pageSize, status, platform, category, keyword, sortBy, sortOrder } = req.query;
  const filters = {};
  if (status) filters.status = status;
  if (platform) filters.platform = platform;
  if (category) filters.category = category;
  if (keyword) filters.keyword = keyword;

  const result = paginate('my_products', {
    page: parseInt(page) || 1,
    pageSize: parseInt(pageSize) || 20,
    filters,
    sortBy: sortBy || 'updated_at',
    sortOrder: sortOrder || 'desc',
  });
  res.json(result);
});

// Get single product
router.get('/:id', (req, res) => {
  const product = findById('my_products', parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: '商品不存在' });
  res.json(product);
});

// Create product (manual add)
router.post('/', (req, res) => {
  const { title, cost_price, description, images, category, tags } = req.body;
  const pricing = applyPricing(parseFloat(cost_price) || 0);
  const product = insert('my_products', {
    source_product_id: null,
    title: title || '',
    cost_price: pricing.cost_price,
    selling_price: pricing.selling_price,
    profit_margin: pricing.profit_margin,
    description: description || '',
    images: JSON.stringify(images || []),
    category: category || '',
    tags: tags || '',
    status: 'draft',
    platform: 'manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  res.json(product);
});

// Update product
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = findById('my_products', id);
  if (!existing) return res.status(404).json({ error: '商品不存在' });

  const updates = { ...req.body, updated_at: new Date().toISOString() };
  // Recalculate pricing if cost changed
  if (updates.cost_price !== undefined) {
    const pricing = applyPricing(parseFloat(updates.cost_price));
    updates.selling_price = pricing.selling_price;
    updates.profit_margin = pricing.profit_margin;
  }
  if (updates.images && Array.isArray(updates.images)) {
    updates.images = JSON.stringify(updates.images);
  }

  const updated = update('my_products', id, updates);
  res.json(updated);
});

// Delete product
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const ok = remove('my_products', id);
  if (!ok) return res.status(404).json({ error: '商品不存在' });
  res.json({ ok: true });
});

// Batch update price
router.put('/batch/price', (req, res) => {
  const { ids, multiplier, fixed_add } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: '请选择商品' });

  const results = [];
  for (const id of ids) {
    const product = findById('my_products', parseInt(id));
    if (!product) continue;
    const cost = product.cost_price || 0;
    const selling_price = Math.round((cost * parseFloat(multiplier || 1.8) + parseFloat(fixed_add || 5)) * 100) / 100;
    const profit_margin = selling_price > 0 ? Math.round((1 - cost / selling_price) * 10000) / 100 : 0;
    const updated = update('my_products', parseInt(id), {
      selling_price,
      profit_margin,
      cost_price: cost,
      updated_at: new Date().toISOString(),
    });
    results.push(updated);
  }
  res.json({ ok: true, count: results.length });
});

export default router;
