import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

// ── Types ──────────────────────────────────────────────────────

export interface Product {
  [key: string]: unknown;
  id: number;
  source_product_id: number | null;
  title: string;
  cost_price: number;
  selling_price: number;
  profit_margin: number;
  description: string;
  images: string;   // JSON-stringified array
  category: string;
  tags: string;
  platform: string;
  status: 'draft' | 'ready' | 'listed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface Listing {
  [key: string]: unknown;
  id: number;
  product_id: number;
  taobao_item_id: string | null;
  status: 'pending' | 'listed' | 'failed';
  csv_path: string | null;
  listed_at: string | null;
  created_at: string;
}

export interface SourceProduct {
  [key: string]: unknown;
  id: number;
  platform: string;
  source_id: string;
  title: string;
  price: number;
  images: string;
  description: string;
  specs: string;
  url: string;
  created_at: string;
}

export interface SettingsEntry {
  [key: string]: string;
  key: string;
  value: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginateOptions {
  page?: number;
  pageSize?: number;
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Helpers ────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

// ── CRUD ───────────────────────────────────────────────────────

export function readTable<T = unknown>(name: string): T[] {
  ensureDir();
  const file = join(DATA_DIR, `${name}.json`);
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, 'utf-8');
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function writeTable<T = unknown>(name: string, data: T[]): void {
  ensureDir();
  const file = join(DATA_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

export function query<T extends Record<string, unknown>>(
  table: string,
  filters: Record<string, unknown> = {}
): T[] {
  let rows = readTable<T>(table);
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && val !== '') {
      rows = rows.filter(r => r[key] === val);
    }
  }
  return rows;
}

export function findById<T extends { id: number }>(table: string, id: number): T | null {
  const rows = readTable<T>(table);
  return rows.find(r => r.id === id) || null;
}

export function insert<T extends Record<string, unknown>>(table: string, record: Partial<T>): T & { id: number } {
  const rows = readTable<T & { id: number }>(table);
  const maxId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) : 0;
  const newRecord = { id: maxId + 1, ...record } as T & { id: number };
  rows.push(newRecord);
  writeTable(table, rows);
  return newRecord;
}

export function update<T extends { id: number }>(
  table: string,
  id: number,
  updates: Partial<T>
): T | null {
  const rows = readTable<T>(table);
  const idx = rows.findIndex(r => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...updates, id };
  writeTable(table, rows);
  return rows[idx];
}

export function remove<T extends { id: number }>(table: string, id: number): boolean {
  const rows = readTable<T>(table);
  const idx = rows.findIndex(r => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeTable(table, rows);
  return true;
}

export function paginate<T extends Record<string, unknown>>(
  table: string,
  options: PaginateOptions
): PaginatedResult<T> {
  const { page = 1, pageSize = 20, filters = {}, sortBy = 'id', sortOrder = 'desc' } = options;
  let rows = readTable<T>(table);
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && val !== '') {
      if (key === 'keyword') {
        const kw = String(val).toLowerCase();
        rows = rows.filter(r => String(r['title'] ?? '').toLowerCase().includes(kw));
      } else {
        rows = rows.filter(r => r[key] === val);
      }
    }
  }
  rows.sort((a, b) => {
    const va = a[sortBy] ?? '';
    const vb = b[sortBy] ?? '';
    if (sortOrder === 'desc') return va < vb ? 1 : va > vb ? -1 : 0;
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export function initDefaults(): void {
  const settings = readTable<SettingsEntry>('settings');
  const defaults: Record<string, string> = {
    price_multiplier: '1.8',
    price_fixed_add: '5',
    default_category: '中药茶/中药饮品',
    default_freight_template: '包邮',
  };
  const existing = new Map(settings.map(s => [s.key, s]));
  for (const [key, value] of Object.entries(defaults)) {
    if (!existing.has(key)) {
      settings.push({ key, value });
    }
  }
  writeTable('settings', settings);
}
