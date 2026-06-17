import { Router } from 'express';
import { getDb } from '../sqlite.js';
const router = Router();
router.get('/', (_req, res) => {
    const d = getDb();
    const rows = d.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const r of rows)
        map[r.key] = r.value;
    res.json(map);
});
router.put('/', (req, res) => {
    const d = getDb();
    const updates = req.body;
    const stmt = d.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const tx = d.transaction((items) => {
        for (const [k, v] of items)
            stmt.run(k, v);
    });
    tx(Object.entries(updates));
    res.json({ ok: true });
});
export default router;
//# sourceMappingURL=settings-sqlite.js.map