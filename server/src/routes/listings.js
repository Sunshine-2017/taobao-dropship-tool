import { Router } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { paginate, findById, insert, update, remove } from '../db.js';
import { generateTaobaoCSV } from '../services/taobao-csv.js';
import { batchListToTaobao } from '../services/taobao-auto-list.js';

const router = Router();

// List listings
router.get('/', (req, res) => {
  const { page, pageSize, status } = req.query;
  const result = paginate('listings', {
    page: parseInt(page) || 1,
    pageSize: parseInt(pageSize) || 20,
    filters: { ...(status ? { status } : {}) },
    sortBy: 'created_at',
    sortOrder: 'desc',
  });
  res.json(result);
});

// Generate CSV for selected products
router.post('/generate-csv', (req, res) => {
  const { productIds, keyword } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要上架的商品' });
  }

  const products = [];
  for (const id of productIds) {
    const product = findById('my_products', parseInt(id));
    if (product) products.push(product);
  }

  if (products.length === 0) return res.status(400).json({ error: '未找到有效商品' });

  const csvPath = generateTaobaoCSV(products, keyword);

  // Record listing entries
  const listings = [];
  for (const product of products) {
    const listing = insert('listings', {
      product_id: product.id,
      taobao_item_id: null,
      status: 'pending',
      csv_path: csvPath,
      listed_at: null,
      created_at: new Date().toISOString(),
    });
    listings.push(listing);

    // Update product status to 'ready'
    update('my_products', product.id, { status: 'ready', updated_at: new Date().toISOString() });
  }

  res.json({
    ok: true,
    csvPath,
    fileName: csvPath.split('/').pop().split('\\').pop(),
    count: listings.length,
    listings,
  });
});

// Download CSV file
router.get('/download/:fileName', (req, res) => {
  const filePath = join(process.cwd(), 'data', 'exports', req.params.fileName);
  res.download(filePath, req.params.fileName);
});

// Update listing status
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = findById('listings', id);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const updated = update('listings', id, {
    ...req.body,
    ...(req.body.status === 'listed' ? { listed_at: new Date().toISOString() } : {}),
  });

  // Sync product status
  if (updated && req.body.status === 'listed') {
    update('my_products', existing.product_id, { status: 'listed', updated_at: new Date().toISOString() });
  }

  res.json(updated);
});

// Delete listing
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = findById('listings', id);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  // Revert product status back to draft when listing is removed
  if (existing.product_id) {
    update('my_products', existing.product_id, { status: 'draft', updated_at: new Date().toISOString() });
  }

  const ok = remove('listings', id);
  res.json({ ok });
});

// Health check for auto-list readiness
router.get('/auto-list-status', async (req, res) => {
  const profileDir = join(process.cwd(), 'data', 'taobao-profile');
  const hasProfile = existsSync(profileDir);
  const screenshots = existsSync(join(process.cwd(), 'data', 'screenshots'));
  res.json({
    ok: true,
    hasProfile,
    hasScreenshots: screenshots,
    message: hasProfile ? '浏览器Profile已存在（可能已登录）' : '首次使用需要登录淘宝',
  });
});

// Auto-list products directly to Taobao via browser automation
router.post('/auto-list', async (req, res) => {
  const { productIds } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要上架的商品' });
  }

  const products = [];
  for (const id of productIds) {
    const product = findById('my_products', parseInt(id));
    if (product) products.push(product);
  }

  if (products.length === 0) return res.status(400).json({ error: '未找到有效商品' });

  // Run synchronously — user gets real feedback
  try {
    const result = await batchListToTaobao(products);

    // Record listings based on per-product results
    const productResults = result.results || [];
    for (const pr of productResults) {
      const product = products.find(p => p.id === pr.id);
      if (!product) continue;

      insert('listings', {
        product_id: product.id,
        taobao_item_id: pr.taobaoItemId || null,
        status: pr.success ? 'listed' : 'failed',
        csv_path: null,
        listed_at: pr.success ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      });
      update('my_products', product.id, {
        status: pr.success ? 'listed' : 'draft',
        updated_at: new Date().toISOString(),
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
