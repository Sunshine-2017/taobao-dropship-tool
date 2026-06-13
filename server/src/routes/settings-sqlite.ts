import { Router, Request, Response } from 'express';
import { getDb } from '../sqlite.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const d = getDb();
  const rows = d.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json(map);
});

router.put('/', (req: Request, res: Response) => {
  const d = getDb();
  const updates: Record<string, string> = req.body;
  const stmt = d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = d.transaction((items: [string, string][]) => {
    for (const [k, v] of items) stmt.run(k, v);
  });
  tx(Object.entries(updates));
  res.json({ ok: true });
});

export default router;
