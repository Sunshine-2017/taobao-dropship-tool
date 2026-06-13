import { Router, Request, Response } from 'express';
import { readTable, writeTable } from '../db.js';
import type { SettingsEntry } from '../db.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const settings = readTable<SettingsEntry>('settings');
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  res.json(map);
});

router.put('/', (req: Request, res: Response) => {
  const updates: Record<string, string> = req.body;
  const settings = readTable<SettingsEntry>('settings');
  const keyMap = new Map(settings.map(s => [s.key, s]));

  for (const [key, value] of Object.entries(updates)) {
    const existing = keyMap.get(key);
    if (existing) {
      existing.value = String(value);
    } else {
      settings.push({ key, value: String(value) });
    }
  }
  writeTable('settings', settings);
  res.json({ ok: true });
});

export default router;
