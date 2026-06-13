import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DATA_DIR = join(process.cwd(), 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, 'taobao-dropship.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS my_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_product_id INTEGER,
      title TEXT NOT NULL DEFAULT '',
      cost_price REAL NOT NULL DEFAULT 0,
      selling_price REAL NOT NULL DEFAULT 0,
      profit_margin REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      images TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '1688',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','listed','failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      taobao_item_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','listed','failed')),
      csv_path TEXT,
      listed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES my_products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS source_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL DEFAULT '1688',
      source_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      images TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      specs TEXT NOT NULL DEFAULT '{}',
      url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_my_products_status ON my_products(status);
    CREATE INDEX IF NOT EXISTS idx_my_products_updated ON my_products(updated_at);
    CREATE INDEX IF NOT EXISTS idx_listings_product ON listings(product_id);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
  `);
}

// Insert default settings if missing
export function ensureDefaults(): void {
  const d = getDb();
  const defaults: Record<string, string> = {
    price_multiplier: '1.8',
    price_fixed_add: '5',
    default_category: '花茶',
    default_freight_template: '包邮',
  };
  const insertStmt = d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  const insertMany = d.transaction((items: [string, string][]) => {
    for (const [k, v] of items) insertStmt.run(k, v);
  });
  insertMany(Object.entries(defaults));
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined as unknown as Database.Database;
  }
}

// Re-export for convenience
export { db };
