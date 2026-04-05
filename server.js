const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// PRODUCTOS
// ─────────────────────────────────────────────

app.get('/api/products', (req, res) => {
  const products = db.prepare(`
    SELECT * FROM products WHERE active = 1 ORDER BY category, name
  `).all();
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const { name, category, price, stock, unit, low_stock_alert } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'Nombre y precio requeridos' });
  const result = db.prepare(`
    INSERT INTO products (name, category, price, stock, unit, low_stock_alert)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, category || 'General', price, stock || 0, unit || 'unidad', low_stock_alert || 5);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid));
});

app.put('/api/products/:id', (req, res) => {
  const { name, category, price, stock, unit, low_stock_alert } = req.body;
  db.prepare(`
    UPDATE products SET name=?, category=?, price=?, stock=?, unit=?, low_stock_alert=?
    WHERE id=?
  `).run(name, category, price, stock, unit, low_stock_alert, req.params.id);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// VENTAS (FACTURACIÓN)
// ─────────────────────────────────────────────

app.get('/api/sales', (req, res) => {
  const { from, to } = req.query;
  let query = `SELECT * FROM sales`;
  const params = [];
  if (from && to) {
    query += ` WHERE date(created_at) BETWEEN date(?) AND date(?)`;
    params.push(from, to);
  } else if (from) {
    query += ` WHERE date(created_at) >= date(?)`;
    params.push(from);
  }
  query += ` ORDER BY created_at DESC`;
  res.json(db.prepare(query).all(...params));
});

app.get('/api/sales/:id', (req, res) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
  sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(req.params.id);
  res.json(sale);
});

app.post('/api/sales', (req, res) => {
  const { items, payment_method, notes } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No hay productos en la venta' });

  const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const total = subtotal;

  const createSale = db.transaction(() => {
    const sale = db.prepare(`
      INSERT INTO sales (subtotal, total, payment_method, notes)
      VALUES (?, ?, ?, ?)
    `).run(subtotal, total, payment_method || 'efectivo', notes || '');

    const saleId = sale.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, product_name, price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?
    `);

    for (const item of items) {
      insertItem.run(saleId, item.product_id || null, item.product_name, item.price, item.quantity, item.price * item.quantity);
      if (item.product_id) updateStock.run(item.quantity, item.product_id);
    }

    // Registrar ingreso automáticamente en movimientos de caja
    db.prepare(`
      INSERT INTO cash_movements (type, amount, description, category)
      VALUES ('ingreso', ?, ?, 'Ventas')
    `).run(total, `Venta #${saleId}`);

    return saleId;
  });

  const saleId = createSale();
  const result = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  result.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
  res.json(result);
});

// ─────────────────────────────────────────────
// MOVIMIENTOS DE CAJA
// ─────────────────────────────────────────────

app.get('/api/movements', (req, res) => {
  const { from, to } = req.query;
  let query = `SELECT * FROM cash_movements`;
  const params = [];
  if (from && to) {
    query += ` WHERE date(created_at) BETWEEN date(?) AND date(?)`;
    params.push(from, to);
  } else if (from) {
    query += ` WHERE date(created_at) >= date(?)`;
    params.push(from);
  }
  query += ` ORDER BY created_at DESC`;
  res.json(db.prepare(query).all(...params));
});

app.post('/api/movements', (req, res) => {
  const { type, amount, description, category } = req.body;
  if (!type || !amount || !description) return res.status(400).json({ error: 'Tipo, monto y descripción requeridos' });
  const result = db.prepare(`
    INSERT INTO cash_movements (type, amount, description, category)
    VALUES (?, ?, ?, ?)
  `).run(type, amount, description, category || 'General');
  res.json(db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/movements/:id', (req, res) => {
  db.prepare('DELETE FROM cash_movements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// REPORTES / DASHBOARD
// ─────────────────────────────────────────────

app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const ventasHoy = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total
    FROM sales WHERE date(created_at) = date(?)
  `).get(today);

  const ingresoHoy = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM cash_movements
    WHERE type='ingreso' AND date(created_at) = date(?)
  `).get(today);

  const egresoHoy = db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM cash_movements
    WHERE type='egreso' AND date(created_at) = date(?)
  `).get(today);

  const bajoStock = db.prepare(`
    SELECT * FROM products WHERE active=1 AND stock <= low_stock_alert ORDER BY stock ASC LIMIT 10
  `).all();

  const topProductos = db.prepare(`
    SELECT product_name, SUM(quantity) as qty, SUM(subtotal) as total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE date(s.created_at) >= date('now', '-7 days')
    GROUP BY product_name ORDER BY total DESC LIMIT 5
  `).all();

  const ventasSemana = db.prepare(`
    SELECT date(created_at) as dia, COUNT(*) as ventas, SUM(total) as total
    FROM sales
    WHERE date(created_at) >= date('now', '-6 days')
    GROUP BY dia ORDER BY dia
  `).all();

  res.json({
    ventasHoy: ventasHoy.count,
    totalHoy: ventasHoy.total,
    ingresoHoy: ingresoHoy.total,
    egresoHoy: egresoHoy.total,
    balanceHoy: ingresoHoy.total - egresoHoy.total,
    bajoStock,
    topProductos,
    ventasSemana,
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ POS Cafetería corriendo en http://localhost:${PORT}\n`);
});
