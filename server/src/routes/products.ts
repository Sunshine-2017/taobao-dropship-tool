import { Router, Request, Response } from 'express';
import { paginate, findById, insert, update, remove, readTable } from '../db.js';
import { applyPricing } from '../services/pricing.js';
import type { Product, SourceProduct } from '../db.js';

const router = Router();

// List products with pagination and filters
router.get('/', (req: Request, res: Response) => {
  const { page, pageSize, status, platform, category, keyword, sortBy, sortOrder } = req.query;
  const filters: Record<string, unknown> = {};
  if (status) filters.status = status;
  if (platform) filters.platform = platform;
  if (category) filters.category = category;
  if (keyword) filters.keyword = keyword;

  const result = paginate<Product>('my_products', {
    page: parseInt(String(page)) || 1,
    pageSize: parseInt(String(pageSize)) || 20,
    filters,
    sortBy: (sortBy as string) || 'updated_at',
    sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
  });
  res.json(result);
});

// Get single product
router.get('/:id', (req: Request, res: Response) => {
  const product = findById<Product>('my_products', parseInt(String(req.params.id)));
  if (!product) return res.status(404).json({ error: '商品不存在' });
  res.json(product);
});

// Create product (manual add)
router.post('/', (req: Request, res: Response) => {
  const { title, cost_price, description, images, category, tags } = req.body;
  const pricing = applyPricing(parseFloat(cost_price) || 0);
  const product = insert<Product>('my_products', {
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
  } as Partial<Product>);
  res.json(product);
});

// Update product
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const existing = findById<Product>('my_products', id);
  if (!existing) return res.status(404).json({ error: '商品不存在' });

  const updates: Partial<Product> = { ...req.body, updated_at: new Date().toISOString() };
  if (updates.cost_price !== undefined) {
    const pricing = applyPricing(parseFloat(String(updates.cost_price)));
    updates.selling_price = pricing.selling_price;
    updates.profit_margin = pricing.profit_margin;
  }
  if (updates.images && Array.isArray(updates.images)) {
    updates.images = JSON.stringify(updates.images);
  }

  const updated = update<Product>('my_products', id, updates);
  res.json(updated);
});

// Delete product
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const ok = remove('my_products', id);
  if (!ok) return res.status(404).json({ error: '商品不存在' });
  res.json({ ok: true });
});

// Batch update price
router.put('/batch/price', (req: Request, res: Response) => {
  const { ids, multiplier, fixed_add } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: '请选择商品' });

  const results: (Product | null)[] = [];
  for (const id of ids) {
    const product = findById<Product>('my_products', parseInt(id));
    if (!product) continue;
    const cost = product.cost_price || 0;
    const selling_price = Math.round((cost * parseFloat(String(multiplier || 1.8)) + parseFloat(String(fixed_add || 5))) * 100) / 100;
    const profit_margin = selling_price > 0 ? Math.round((1 - cost / selling_price) * 10000) / 100 : 0;
    const updated = update<Product>('my_products', parseInt(id), {
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
