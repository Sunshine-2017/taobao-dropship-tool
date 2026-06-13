import { Router, Request, Response } from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { paginate, findById, insert, update, remove } from '../db.js';
import { generateTaobaoCSV } from '../services/taobao-csv.js';
// @ts-expect-error — JS module, will be migrated to TS soon
import { batchListToTaobao } from '../services/taobao-auto-list.js';
import type { Listing, Product } from '../db.js';

const router = Router();

// List listings
router.get('/', (req: Request, res: Response) => {
  const { page, pageSize, status } = req.query;
  const result = paginate<Listing>('listings', {
    page: parseInt(String(page)) || 1,
    pageSize: parseInt(String(pageSize)) || 20,
    filters: { ...(status ? { status } : {}) },
    sortBy: 'created_at',
    sortOrder: 'desc',
  });
  res.json(result);
});

// Generate CSV for selected products
router.post('/generate-csv', (req: Request, res: Response) => {
  const { productIds, keyword } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要上架的商品' });
  }

  const products: Product[] = [];
  for (const id of productIds) {
    const product = findById<Product>('my_products', parseInt(id));
    if (product) products.push(product);
  }

  if (products.length === 0) return res.status(400).json({ error: '未找到有效商品' });

  const csvPath = generateTaobaoCSV(products, keyword as string);

  const listings: Listing[] = [];
  for (const product of products) {
    const listing = insert<Listing>('listings', {
      product_id: product.id,
      taobao_item_id: null,
      status: 'pending',
      csv_path: csvPath,
      listed_at: null,
      created_at: new Date().toISOString(),
    } as Partial<Listing>);
    listings.push(listing as unknown as Listing);

    update<Product>('my_products', product.id, { status: 'ready', updated_at: new Date().toISOString() });
  }

  res.json({
    ok: true,
    csvPath,
    fileName: csvPath.split('/').pop()!.split('\\').pop(),
    count: listings.length,
    listings,
  });
});

// Download CSV file
router.get('/download/:fileName', (req: Request, res: Response) => {
  const fileName = String(req.params.fileName);
  const filePath = join(process.cwd(), 'data', 'exports', fileName);
  res.download(filePath, fileName);
});

// Update listing status
router.put('/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const existing = findById<Listing>('listings', id);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  const updated = update<Listing>('listings', id, {
    ...req.body,
    ...(req.body.status === 'listed' ? { listed_at: new Date().toISOString() } : {}),
  });

  if (updated && req.body.status === 'listed') {
    update<Product>('my_products', existing.product_id, { status: 'listed', updated_at: new Date().toISOString() });
  }

  res.json(updated);
});

// Delete listing
router.delete('/:id', (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const existing = findById<Listing>('listings', id);
  if (!existing) return res.status(404).json({ error: '记录不存在' });

  if (existing.product_id) {
    update<Product>('my_products', existing.product_id, { status: 'draft', updated_at: new Date().toISOString() });
  }

  const ok = remove('listings', id);
  res.json({ ok });
});

// Health check for auto-list readiness
router.get('/auto-list-status', async (_req: Request, res: Response) => {
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
router.post('/auto-list', async (req: Request, res: Response) => {
  const { productIds } = req.body;
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({ error: '请选择要上架的商品' });
  }

  const products: Product[] = [];
  for (const id of productIds) {
    const product = findById<Product>('my_products', parseInt(id));
    if (product) products.push(product);
  }

  if (products.length === 0) return res.status(400).json({ error: '未找到有效商品' });

  try {
    const result = await batchListToTaobao(products);

    const productResults = result.results || [];
    for (const pr of productResults) {
      const product = products.find(p => p.id === pr.id);
      if (!product) continue;

      insert<Listing>('listings', {
        product_id: product.id,
        taobao_item_id: pr.taobaoItemId || null,
        status: pr.success ? 'listed' : 'failed',
        csv_path: null,
        listed_at: pr.success ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      } as Partial<Listing>);
      update<Product>('my_products', product.id, {
        status: pr.success ? 'listed' : 'draft',
        updated_at: new Date().toISOString(),
      });
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, message });
  }
});

export default router;
