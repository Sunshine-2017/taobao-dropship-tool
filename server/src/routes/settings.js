import { Router } from 'express';
import { readTable, writeTable } from '../db.js';

const router = Router();

// Get all settings
router.get('/', (req, res) => {
  const settings = readTable('settings');
  const map = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  res.json(map);
});

// Update settings
router.put('/', (req, res) => {
  const updates = req.body;
  const settings = readTable('settings');
  const keyMap = new Map(settings.map(s => [s.key, s]));

  for (const [key, value] of Object.entries(updates)) {
    if (keyMap.has(key)) {
      keyMap.get(key).value = String(value);
    } else {
      settings.push({ key, value: String(value) });
    }
  }

  writeTable('settings', settings);
  res.json({ ok: true });
});

export default router;
