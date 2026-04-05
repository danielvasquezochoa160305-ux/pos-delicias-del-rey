const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'pos.db'));

// Habilitar WAL para mejor rendimiento
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Crear tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    price REAL NOT NULL,
    stock REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'unidad',
    low_stock_alert REAL NOT NULL DEFAULT 5,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subtotal REAL NOT NULL,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'efectivo',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  );

  CREATE TABLE IF NOT EXISTS cash_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('ingreso','egreso')),
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

// Insertar productos de muestra si la tabla está vacía
const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (count.c === 0) {
  const insert = db.prepare(`
    INSERT INTO products (name, category, price, stock, unit, low_stock_alert)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const samples = [
    ['Café americano', 'Bebidas', 25, 100, 'taza', 10],
    ['Café con leche', 'Bebidas', 30, 100, 'taza', 10],
    ['Capuchino', 'Bebidas', 35, 100, 'taza', 10],
    ['Té negro', 'Bebidas', 20, 50, 'taza', 10],
    ['Agua natural 500ml', 'Bebidas', 15, 24, 'botella', 6],
    ['Croissant', 'Panadería', 28, 20, 'pieza', 5],
    ['Muffin', 'Panadería', 25, 15, 'pieza', 5],
    ['Sándwich jamón', 'Comida', 55, 10, 'pieza', 3],
    ['Ensalada de frutas', 'Comida', 45, 8, 'porción', 3],
    ['Jugo naranja', 'Bebidas', 35, 10, 'vaso', 5],
  ];
  for (const s of samples) insert.run(...s);
}

module.exports = db;
