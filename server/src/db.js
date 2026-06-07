import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readTable(name) {
  ensureDir();
  const file = join(DATA_DIR, `${name}.json`);
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeTable(name, data) {
  ensureDir();
  const file = join(DATA_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function query(table, filters = {}) {
  let rows = readTable(table);
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && val !== '') {
      rows = rows.filter(r => r[key] === val);
    }
  }
  return rows;
}

function findById(table, id) {
  const rows = readTable(table);
  return rows.find(r => r.id === id) || null;
}

function insert(table, record) {
  const rows = readTable(table);
  const maxId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) : 0;
  const newRecord = { id: maxId + 1, ...record };
  rows.push(newRecord);
  writeTable(table, rows);
  return newRecord;
}

function update(table, id, updates) {
  const rows = readTable(table);
  const idx = rows.findIndex(r => r.id === id);
  if (idx === -1) return null;
  rows[idx] = { ...rows[idx], ...updates, id };
  writeTable(table, rows);
  return rows[idx];
}

function remove(table, id) {
  const rows = readTable(table);
  const idx = rows.findIndex(r => r.id === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  writeTable(table, rows);
  return true;
}

function paginate(table, { page = 1, pageSize = 20, filters = {}, sortBy = 'id', sortOrder = 'desc' }) {
  let rows = readTable(table);
  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null && val !== '') {
      if (key === 'keyword') {
        const kw = val.toLowerCase();
        rows = rows.filter(r => (r.title || '').toLowerCase().includes(kw));
      } else {
        rows = rows.filter(r => r[key] === val);
      }
    }
  }
  rows.sort((a, b) => {
    const va = a[sortBy] ?? '', vb = b[sortBy] ?? '';
    if (sortOrder === 'desc') return va < vb ? 1 : va > vb ? -1 : 0;
    return va < vb ? -1 : va > vb ? 1 : 0;
  });
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

function initDefaults() {
  const settings = readTable('settings');
  const defaults = {
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

export { readTable, writeTable, query, findById, insert, update, remove, paginate, initDefaults };
