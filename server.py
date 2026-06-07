import sqlite3
import json
import os
import urllib.request
import urllib.parse
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__, static_folder='public')
DB_PATH = os.path.join(os.path.dirname(__file__), 'pos.db')

# ─── DB HELPERS ──────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    with get_db() as conn:
        conn.executescript("""
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
        CREATE TABLE IF NOT EXISTS cash_registers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL DEFAULT 'abierta' CHECK(status IN ('abierta','cerrada')),
            opening_balance REAL NOT NULL DEFAULT 0,
            counted_cash REAL,
            total_sales REAL NOT NULL DEFAULT 0,
            total_cash_sales REAL NOT NULL DEFAULT 0,
            total_in REAL NOT NULL DEFAULT 0,
            total_out REAL NOT NULL DEFAULT 0,
            expected_cash REAL,
            difference REAL,
            notes TEXT NOT NULL DEFAULT '',
            opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            closed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS comandas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL DEFAULT '',
            items TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','listo','entregado','cancelado')),
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS pos_terminals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#3b82f6',
            icon TEXT NOT NULL DEFAULT '🛒',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        INSERT OR IGNORE INTO pos_terminals (id, name, color, icon) VALUES (1, 'Punto de Venta', '#3b82f6', '🛒');
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );
        INSERT OR IGNORE INTO settings (key, value) VALUES ('whatsapp_phone', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('whatsapp_apikey', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('whatsapp_enabled', '0');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('greenapi_instance', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('greenapi_token', '');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('greenapi_enabled', '0');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('negocio_nombre', 'Mi Cafetería');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('pin_admin', '1623');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('pin_worker', '0000');
        CREATE TABLE IF NOT EXISTS returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            total REAL NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            payment_method TEXT NOT NULL DEFAULT 'efectivo',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (sale_id) REFERENCES sales(id)
        );
        CREATE TABLE IF NOT EXISTS return_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            return_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            price REAL NOT NULL,
            quantity REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (return_id) REFERENCES returns(id)
        );
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('ingreso','costo','gasto_operativo','gasto_admin','otro_ingreso','otro_gasto')),
            active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            account_id INTEGER NOT NULL,
            description TEXT NOT NULL,
            entry_type TEXT NOT NULL CHECK(entry_type IN ('ingreso','egreso')),
            amount REAL NOT NULL,
            reference TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        );
        INSERT OR IGNORE INTO accounts (id,code,name,type) VALUES
        -- INGRESOS
        (1,'4001','Ventas Punto de Venta','ingreso'),
        (2,'4002','Ventas Institucional','ingreso'),
        -- COSTOS DE VENTAS
        (3,'5001','Compras Punto de Venta','costo'),
        (4,'5002','Cacaos','costo'),
        (5,'5003','Buñuelos','costo'),
        (6,'5004','Gaseosas y Desechables','costo'),
        (7,'5005','Fritos','costo'),
        (8,'5006','Otros Costos','costo'),
        -- GASTOS FIJOS Y VARIABLES
        (9,'6001','Nómina','gasto_operativo'),
        (10,'6002','Arriendo','gasto_operativo'),
        (11,'6003','Servicios Públicos','gasto_operativo'),
        (12,'6004','Internet','gasto_operativo'),
        (13,'6005','Prestaciones Sociales','gasto_operativo'),
        (14,'6006','Mercadeo','gasto_operativo'),
        (15,'6007','Fletes','gasto_operativo'),
        (16,'6008','Fletes Buñuelos','gasto_operativo'),
        (17,'6009','Fumigación','gasto_operativo'),
        (18,'6010','Dotación','gasto_operativo'),
        (19,'6011','Depreciación','gasto_operativo'),
        (20,'6012','Declaración','gasto_operativo'),
        (21,'6013','Licencia POS','gasto_operativo'),
        -- GASTOS FINANCIEROS (gasto_admin)
        (22,'7001','Préstamo','gasto_admin'),
        (23,'7002','4x10000','gasto_admin'),
        -- OTROS GASTOS (códigos 8xxx)
        (24,'8001','Compra de Equipos','otro_gasto'),
        (25,'8002','Almuerzos / Alimentación','otro_gasto'),
        (26,'8003','Compra Muebles y Enseres','otro_gasto'),
        (27,'8004','Otros','otro_gasto'),
        -- IMPUESTOS (códigos 9xxx — separados en ERI)
        (28,'9001','Impuestos','otro_gasto');
        CREATE TABLE IF NOT EXISTS losses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            product_name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit TEXT NOT NULL DEFAULT 'unidad',
            reason TEXT NOT NULL,
            responsible TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS cash_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('ingreso','egreso')),
            amount REAL NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'General',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS workers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            cargo TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS worker_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            funcion TEXT NOT NULL,
            area TEXT NOT NULL DEFAULT '',
            assigned_to TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','realizado')),
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            completed_at TEXT
        );
        """)

        # Tabla de documentos de trabajadores
        conn.execute("""
        CREATE TABLE IF NOT EXISTS worker_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            worker_id INTEGER NOT NULL,
            filename TEXT NOT NULL DEFAULT '',
            original_name TEXT NOT NULL DEFAULT '',
            doc_type TEXT NOT NULL DEFAULT 'general',
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (worker_id) REFERENCES workers(id)
        )""")

        # Agrega columna image si no existe (migración)
        try:
            conn.execute('ALTER TABLE products ADD COLUMN image TEXT DEFAULT NULL')
        except Exception:
            pass

        # Migración: agregar note_type a worker_notes
        try:
            conn.execute("ALTER TABLE worker_notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'nota'")
        except Exception:
            pass

        # Migración: agregar sale_value a losses
        try:
            conn.execute("ALTER TABLE losses ADD COLUMN sale_value REAL NOT NULL DEFAULT 0")
        except Exception:
            pass

        # Migración: agregar category a losses
        try:
            conn.execute("ALTER TABLE losses ADD COLUMN category TEXT NOT NULL DEFAULT ''")
        except Exception:
            pass

        # Seed trabajadores fijos
        for wname, wcargo in [('Camila', 'Empleada'), ('Daniela', 'Empleada'), ('Juan', 'Empleado')]:
            exists = conn.execute('SELECT id FROM workers WHERE name=?', (wname,)).fetchone()
            if not exists:
                conn.execute('INSERT INTO workers (name, cargo) VALUES (?,?)', (wname, wcargo))

        # Migración: reemplazar cuentas genéricas con cuentas específicas de la cafetería
        try:
            old_codes = conn.execute("SELECT code FROM accounts WHERE code IN ('4001','4002','5001','5002','6001','6002','6003','6004','6005','7001','7002','7003','7004','8001','9001','9002','9003')").fetchall()
            old_names = [r[0] for r in old_codes]
            # Verificar si aún tenemos las cuentas genéricas (por nombre de la primera)
            first_acc = conn.execute("SELECT name FROM accounts WHERE code='4001'").fetchone()
            if first_acc and first_acc[0] in ('Ventas de productos',):
                # Son cuentas genéricas — reemplazar si no hay journal_entries
                entry_count = conn.execute("SELECT COUNT(*) FROM journal_entries WHERE account_id <= 17").fetchone()[0]
                if entry_count == 0:
                    conn.execute("DELETE FROM accounts WHERE id <= 17")
            # Insertar/actualizar cuentas específicas
            new_accounts = [
                (1,'4001','Ventas Punto de Venta','ingreso'),
                (2,'4002','Ventas Institucional','ingreso'),
                (3,'5001','Compras Punto de Venta','costo'),
                (4,'5002','Cacaos','costo'),
                (5,'5003','Buñuelos','costo'),
                (6,'5004','Gaseosas y Desechables','costo'),
                (7,'5005','Fritos','costo'),
                (8,'5006','Otros Costos','costo'),
                (9,'6001','Nómina','gasto_operativo'),
                (10,'6002','Arriendo','gasto_operativo'),
                (11,'6003','Servicios Públicos','gasto_operativo'),
                (12,'6004','Internet','gasto_operativo'),
                (13,'6005','Prestaciones Sociales','gasto_operativo'),
                (14,'6006','Mercadeo','gasto_operativo'),
                (15,'6007','Fletes','gasto_operativo'),
                (16,'6008','Fletes Buñuelos','gasto_operativo'),
                (17,'6009','Fumigación','gasto_operativo'),
                (18,'6010','Dotación','gasto_operativo'),
                (19,'6011','Depreciación','gasto_operativo'),
                (20,'6012','Declaración','gasto_operativo'),
                (21,'6013','Licencia POS','gasto_operativo'),
                (22,'7001','Préstamo','gasto_admin'),
                (23,'7002','4x10000','gasto_admin'),
                (24,'8001','Compra de Equipos','otro_gasto'),
                (25,'8002','Almuerzos / Alimentación','otro_gasto'),
                (26,'8003','Compra Muebles y Enseres','otro_gasto'),
                (27,'8004','Otros','otro_gasto'),
                (28,'9001','Impuestos','otro_gasto'),
            ]
            for acc in new_accounts:
                conn.execute("INSERT OR IGNORE INTO accounts (id,code,name,type) VALUES (?,?,?,?)", acc)
                conn.execute("UPDATE accounts SET name=?, type=? WHERE id=? AND name != ?", (acc[2], acc[3], acc[0], acc[2]))
        except Exception as e:
            print('Account migration note:', e)
            pass

        count = conn.execute('SELECT COUNT(*) FROM products').fetchone()[0]
        if count == 0:
            samples = [
                ('Café americano','Bebidas',25,100,'taza',10),
                ('Café con leche','Bebidas',30,100,'taza',10),
                ('Capuchino','Bebidas',35,100,'taza',10),
                ('Té negro','Bebidas',20,50,'taza',10),
                ('Agua natural 500ml','Bebidas',15,24,'botella',6),
                ('Croissant','Panadería',28,20,'pieza',5),
                ('Muffin','Panadería',25,15,'pieza',5),
                ('Sándwich jamón','Comida',55,10,'pieza',3),
                ('Ensalada de frutas','Comida',45,8,'porción',3),
                ('Jugo naranja','Bebidas',35,10,'vaso',5),
            ]
            conn.executemany(
                'INSERT INTO products (name,category,price,stock,unit,low_stock_alert) VALUES (?,?,?,?,?,?)',
                samples
            )

def row_to_dict(row):
    return dict(row) if row else None

def rows_to_list(rows):
    return [dict(r) for r in rows]

# ─── STATIC ──────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/uploads/<path:path>')
def send_upload(path):
    return send_from_directory('public/uploads', path)

@app.route('/css/<path:path>')
def send_css(path):
    return send_from_directory('public/css', path)

@app.route('/js/<path:path>')
def send_js(path):
    return send_from_directory('public/js', path)

# ─── PRODUCTS ────────────────────────────────────────
@app.route('/api/products', methods=['GET'])
def get_products():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM products WHERE active=1 ORDER BY category, name').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/products', methods=['POST'])
def create_product():
    d = request.json
    if not d.get('name') or d.get('price') is None:
        return jsonify({'error': 'Nombre y precio requeridos'}), 400
    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO products (name,category,price,cost,stock,unit,low_stock_alert,infinite_stock) VALUES (?,?,?,?,?,?,?,?)',
            (d['name'], d.get('category','General'), d['price'], d.get('cost',0),
             d.get('stock',0), d.get('unit','unidad'), d.get('low_stock_alert',5), 1 if d.get('infinite_stock') else 0)
        )
        row = conn.execute('SELECT * FROM products WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/products/<int:pid>/image', methods=['POST'])
def upload_product_image(pid):
    if 'image' not in request.files:
        return jsonify({'error': 'No se recibió imagen'}), 400
    file = request.files['image']
    if not file.filename:
        return jsonify({'error': 'No se seleccionó archivo'}), 400
    ext = file.filename.rsplit('.', 1)[-1].lower()
    if ext not in ('jpg', 'jpeg', 'png', 'gif', 'webp'):
        return jsonify({'error': 'Formato no permitido. Usa jpg, png, gif o webp'}), 400
    upload_dir = os.path.join(os.path.dirname(__file__), 'public', 'uploads', 'products')
    os.makedirs(upload_dir, exist_ok=True)
    filename = f'product_{pid}.{ext}'
    # Eliminar imagen anterior con distinta extensión
    for old_ext in ('jpg', 'jpeg', 'png', 'gif', 'webp'):
        old_path = os.path.join(upload_dir, f'product_{pid}.{old_ext}')
        if os.path.exists(old_path) and old_ext != ext:
            os.remove(old_path)
    file.save(os.path.join(upload_dir, filename))
    with get_db() as conn:
        conn.execute('UPDATE products SET image=? WHERE id=?', (filename, pid))
        row = conn.execute('SELECT * FROM products WHERE id=?', (pid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/products/<int:pid>', methods=['PUT'])
def update_product(pid):
    d = request.json
    with get_db() as conn:
        conn.execute(
            'UPDATE products SET name=?,category=?,price=?,cost=?,stock=?,unit=?,low_stock_alert=?,infinite_stock=? WHERE id=?',
            (d['name'],d['category'],d['price'],d.get('cost',0),d['stock'],d['unit'],d['low_stock_alert'],1 if d.get('infinite_stock') else 0,pid)
        )
        row = conn.execute('SELECT * FROM products WHERE id=?', (pid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/products/<int:pid>', methods=['DELETE'])
def delete_product(pid):
    with get_db() as conn:
        conn.execute('UPDATE products SET active=0 WHERE id=?', (pid,))
    return jsonify({'ok': True})

# ─── SALES ───────────────────────────────────────────
@app.route('/api/sales', methods=['GET'])
def get_sales():
    from_d = request.args.get('from')
    to_d = request.args.get('to')
    with get_db() as conn:
        if from_d and to_d:
            rows = conn.execute(
                "SELECT * FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC",
                (from_d, to_d)
            ).fetchall()
        else:
            rows = conn.execute('SELECT * FROM sales ORDER BY created_at DESC').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/sales/<int:sid>', methods=['GET'])
def get_sale(sid):
    with get_db() as conn:
        sale = conn.execute('SELECT * FROM sales WHERE id=?', (sid,)).fetchone()
        if not sale:
            return jsonify({'error': 'Venta no encontrada'}), 404
        items = conn.execute('SELECT * FROM sale_items WHERE sale_id=?', (sid,)).fetchall()
    result = row_to_dict(sale)
    result['items'] = rows_to_list(items)
    return jsonify(result)

@app.route('/api/sales', methods=['POST'])
def create_sale():
    d = request.json
    items = d.get('items', [])
    if not items:
        return jsonify({'error': 'No hay productos en la venta'}), 400

    subtotal = sum(i['price'] * i['quantity'] for i in items)
    total = subtotal

    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO sales (subtotal,total,payment_method,notes) VALUES (?,?,?,?)',
            (subtotal, total, d.get('payment_method','efectivo'), d.get('notes',''))
        )
        sale_id = cur.lastrowid

        for item in items:
            conn.execute(
                'INSERT INTO sale_items (sale_id,product_id,product_name,price,quantity,subtotal) VALUES (?,?,?,?,?,?)',
                (sale_id, item.get('product_id'), item['product_name'],
                 item['price'], item['quantity'], item['price'] * item['quantity'])
            )
            if item.get('product_id'):
                conn.execute(
                    'UPDATE products SET stock = MAX(0, stock - ?) WHERE id=? AND infinite_stock=0',
                    (item['quantity'], item['product_id'])
                )

        conn.execute(
            "INSERT INTO cash_movements (type,amount,description,category) VALUES ('ingreso',?,?,?)",
            (total, f'Venta #{sale_id}', 'Ventas')
        )

        sale = conn.execute('SELECT * FROM sales WHERE id=?', (sale_id,)).fetchone()
        sale_items = conn.execute('SELECT * FROM sale_items WHERE sale_id=?', (sale_id,)).fetchall()

    result = row_to_dict(sale)
    result['items'] = rows_to_list(sale_items)
    return jsonify(result)

# ─── MOVEMENTS ───────────────────────────────────────
@app.route('/api/movements', methods=['GET'])
def get_movements():
    from_d = request.args.get('from')
    to_d = request.args.get('to')
    with get_db() as conn:
        if from_d and to_d:
            rows = conn.execute(
                "SELECT * FROM cash_movements WHERE date(created_at) BETWEEN date(?) AND date(?) ORDER BY created_at DESC",
                (from_d, to_d)
            ).fetchall()
        else:
            rows = conn.execute('SELECT * FROM cash_movements ORDER BY created_at DESC').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/movements', methods=['POST'])
def create_movement():
    d = request.json
    if not d.get('type') or not d.get('amount') or not d.get('description'):
        return jsonify({'error': 'Tipo, monto y descripción requeridos'}), 400
    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO cash_movements (type,amount,description,category) VALUES (?,?,?,?)',
            (d['type'], d['amount'], d['description'], d.get('category','General'))
        )
        row = conn.execute('SELECT * FROM cash_movements WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/movements/<int:mid>', methods=['DELETE'])
def delete_movement(mid):
    with get_db() as conn:
        conn.execute('DELETE FROM cash_movements WHERE id=?', (mid,))
    return jsonify({'ok': True})

# ─── DASHBOARD ───────────────────────────────────────
@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    today = datetime.now().strftime('%Y-%m-%d')
    with get_db() as conn:
        ventas = conn.execute(
            "SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM sales WHERE date(created_at)=date(?)",
            (today,)
        ).fetchone()
        ingreso = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as total FROM cash_movements WHERE type='ingreso' AND date(created_at)=date(?)",
            (today,)
        ).fetchone()
        egreso = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as total FROM cash_movements WHERE type='egreso' AND date(created_at)=date(?)",
            (today,)
        ).fetchone()
        bajo_stock = conn.execute(
            'SELECT * FROM products WHERE active=1 AND stock<=low_stock_alert ORDER BY stock ASC LIMIT 10'
        ).fetchall()
        top_productos = conn.execute("""
            SELECT si.product_name, SUM(si.quantity) as qty, SUM(si.subtotal) as total
            FROM sale_items si JOIN sales s ON s.id=si.sale_id
            WHERE date(s.created_at) >= date('now','-7 days')
            GROUP BY si.product_name ORDER BY total DESC LIMIT 5
        """).fetchall()
        ventas_semana = conn.execute("""
            SELECT date(created_at) as dia, COUNT(*) as ventas, SUM(total) as total
            FROM sales WHERE date(created_at) >= date('now','-6 days')
            GROUP BY dia ORDER BY dia
        """).fetchall()

    return jsonify({
        'ventasHoy': ventas['count'],
        'totalHoy': ventas['total'],
        'ingresoHoy': ingreso['total'],
        'egresoHoy': egreso['total'],
        'balanceHoy': ingreso['total'] - egreso['total'],
        'bajoStock': rows_to_list(bajo_stock),
        'topProductos': rows_to_list(top_productos),
        'ventasSemana': rows_to_list(ventas_semana),
    })

# ─── CIERRES DE CAJA ─────────────────────────────────
@app.route('/api/registers', methods=['GET'])
def get_registers():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM cash_registers ORDER BY opened_at DESC LIMIT 30').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/registers/current', methods=['GET'])
def get_current_register():
    with get_db() as conn:
        row = conn.execute("SELECT * FROM cash_registers WHERE status='abierta' ORDER BY opened_at DESC LIMIT 1").fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/registers', methods=['POST'])
def open_register():
    d = request.json or {}
    with get_db() as conn:
        # Solo puede haber una caja abierta
        existing = conn.execute("SELECT id FROM cash_registers WHERE status='abierta'").fetchone()
        if existing:
            return jsonify({'error': 'Ya hay una caja abierta'}), 400
        cur = conn.execute(
            'INSERT INTO cash_registers (opening_balance, notes) VALUES (?,?)',
            (d.get('opening_balance', 0), d.get('notes', ''))
        )
        row = conn.execute('SELECT * FROM cash_registers WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/registers/current/summary', methods=['GET'])
def current_register_summary():
    with get_db() as conn:
        reg = conn.execute("SELECT * FROM cash_registers WHERE status='abierta' ORDER BY opened_at DESC LIMIT 1").fetchone()
        if not reg:
            return jsonify({'error': 'No hay caja abierta'}), 404
        opened_at = reg['opened_at']
        sales_by_method_rows = conn.execute(
            "SELECT payment_method, COALESCE(SUM(total),0) as total, COUNT(*) as count FROM sales WHERE created_at >= ? GROUP BY payment_method",
            (opened_at,)
        ).fetchall()
        mov_in = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as t FROM cash_movements WHERE type='ingreso' AND description NOT LIKE 'Venta #%' AND created_at >= ?",
            (opened_at,)
        ).fetchone()
        mov_out = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as t FROM cash_movements WHERE type='egreso' AND created_at >= ?",
            (opened_at,)
        ).fetchone()
        total_orders = conn.execute(
            "SELECT COUNT(*) as c, COALESCE(SUM(total),0) as t FROM sales WHERE created_at >= ?",
            (opened_at,)
        ).fetchone()
    sbm = {r['payment_method']: {'total': r['total'], 'count': r['count']} for r in sales_by_method_rows}
    return jsonify({
        'opening_balance': reg['opening_balance'],
        'opened_at': reg['opened_at'],
        'sales_by_method': sbm,
        'manual_in': mov_in['t'],
        'manual_out': mov_out['t'],
        'total_orders': total_orders['c'],
        'total_amount': total_orders['t'],
    })

@app.route('/api/registers/<int:rid>/close', methods=['PUT'])
def close_register(rid):
    d = request.json or {}
    counted_cash = d.get('counted_cash', 0)
    notes = d.get('notes', '')
    with get_db() as conn:
        reg = conn.execute('SELECT * FROM cash_registers WHERE id=?', (rid,)).fetchone()
        if not reg or reg['status'] == 'cerrada':
            return jsonify({'error': 'Caja no encontrada o ya cerrada'}), 400

        opened_at = reg['opened_at']
        # Calcular totales desde apertura
        sales = conn.execute(
            "SELECT COALESCE(SUM(total),0) as t, COALESCE(SUM(CASE WHEN payment_method='efectivo' THEN total ELSE 0 END),0) as cash_t FROM sales WHERE created_at >= ?",
            (opened_at,)
        ).fetchone()
        mov_in = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as t FROM cash_movements WHERE type='ingreso' AND description NOT LIKE 'Venta #%' AND created_at >= ?",
            (opened_at,)
        ).fetchone()
        mov_out = conn.execute(
            "SELECT COALESCE(SUM(amount),0) as t FROM cash_movements WHERE type='egreso' AND created_at >= ?",
            (opened_at,)
        ).fetchone()

        total_sales = sales['t']
        total_cash_sales = sales['cash_t']
        total_in = mov_in['t']
        total_out = mov_out['t']
        expected_cash = reg['opening_balance'] + total_cash_sales + total_in - total_out
        difference = counted_cash - expected_cash

        # Ventas agrupadas por método de pago
        sales_by_method_rows = conn.execute(
            "SELECT payment_method, COALESCE(SUM(total),0) as total FROM sales WHERE created_at >= ? GROUP BY payment_method",
            (opened_at,)
        ).fetchall()
        sales_by_method = {r['payment_method']: r['total'] for r in sales_by_method_rows}

        conn.execute("""
            UPDATE cash_registers SET
                status='cerrada', counted_cash=?, total_sales=?, total_cash_sales=?,
                total_in=?, total_out=?, expected_cash=?, difference=?, notes=?,
                closed_at=datetime('now','localtime')
            WHERE id=?
        """, (counted_cash, total_sales, total_cash_sales, total_in, total_out,
              expected_cash, difference, notes, rid))

        # Registrar el efectivo contado como egreso de cierre
        closed_date = datetime.now().strftime('%d/%m/%Y')
        turno_label = notes.split(' — ')[0] if notes else 'Turno'
        cierre_desc = f"CIERRE DE CAJA {closed_date} — {turno_label}"
        conn.execute(
            "INSERT INTO cash_movements (type, amount, description, category) VALUES ('egreso', ?, ?, 'Cierre de caja')",
            (counted_cash, cierre_desc)
        )
        # Si hay diferencia, registrarla también
        if difference != 0:
            diff_desc = f"Diferencia de efectivo — {closed_date}"
            diff_type = 'ingreso' if difference > 0 else 'egreso'
            conn.execute(
                "INSERT INTO cash_movements (type, amount, description, category) VALUES (?, ?, ?, 'Cierre de caja')",
                (diff_type, abs(difference), diff_desc)
            )

        # ── Asientos contables automáticos del cierre ──
        today_str = datetime.now().strftime('%Y-%m-%d')
        ref_cierre = f'Cierre {closed_date} — {turno_label}'

        acc_ventas = conn.execute("SELECT id FROM accounts WHERE code='4001'").fetchone()
        if acc_ventas and total_sales > 0:
            conn.execute("""
                INSERT INTO journal_entries (date, account_id, description, entry_type, amount, reference)
                VALUES (?, ?, ?, 'ingreso', ?, ?)
            """, (today_str, acc_ventas['id'],
                  f'Ventas del turno — {turno_label}', total_sales, ref_cierre))

        if total_out > 0:
            acc_egresos = conn.execute("SELECT id FROM accounts WHERE code='8004'").fetchone()
            if acc_egresos:
                conn.execute("""
                    INSERT INTO journal_entries (date, account_id, description, entry_type, amount, reference)
                    VALUES (?, ?, ?, 'egreso', ?, ?)
                """, (today_str, acc_egresos['id'],
                      f'Egresos del turno — {turno_label}', total_out, ref_cierre))

        # Pérdidas del turno
        losses_total = conn.execute(
            "SELECT COALESCE(SUM(quantity * 1),0) as cnt, COUNT(*) as c FROM losses WHERE created_at >= ?",
            (opened_at,)
        ).fetchone()

        row = conn.execute('SELECT * FROM cash_registers WHERE id=?', (rid,)).fetchone()

        # Configuración WhatsApp
        cfg = {r['key']: r['value'] for r in conn.execute('SELECT key,value FROM settings').fetchall()}

    result = row_to_dict(row)
    result['sales_by_method'] = sales_by_method
    result['total_in'] = total_in
    result['total_out'] = total_out

    # Enviar WhatsApp via Green API si está habilitado
    if cfg.get('greenapi_enabled') == '1' and cfg.get('whatsapp_phone') and cfg.get('greenapi_instance') and cfg.get('greenapi_token'):
        nombre = cfg.get('negocio_nombre', 'Cafetería')
        fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
        diff_sign = '+' if difference >= 0 else ''
        metodos_str = ' | '.join([f'{k}: ${v:,.0f}' for k, v in sales_by_method.items()]) or 'Sin ventas'
        msg = (
            f'🏪 {nombre} — Cierre de caja\n'
            f'📅 {fecha}\n\n'
            f'💰 Ventas totales: ${total_sales:,.0f}\n'
            f'   {metodos_str}\n'
            f'💸 Egresos: ${total_out:,.0f}\n\n'
            f'📦 Fondo inicial: ${result["opening_balance"]:,.0f}\n'
            f'✅ Efectivo esperado: ${result["expected_cash"]:,.0f}\n'
            f'🔢 Efectivo contado: ${counted_cash:,.0f}\n'
            f'{"🟢" if difference >= 0 else "🔴"} Diferencia: {diff_sign}${difference:,.0f}'
        )
        import threading
        threading.Thread(target=send_whatsapp, args=(cfg['whatsapp_phone'], cfg['greenapi_instance'], cfg['greenapi_token'], msg), daemon=True).start()

    return jsonify(result)

# ─── COMANDAS ────────────────────────────────────────
@app.route('/api/comandas', methods=['GET'])
def get_comandas():
    status = request.args.get('status')
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM comandas WHERE status=? ORDER BY created_at DESC", (status,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM comandas ORDER BY created_at DESC LIMIT 50"
            ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d['items'] = json.loads(d['items'])
        result.append(d)
    return jsonify(result)

@app.route('/api/comandas', methods=['POST'])
def create_comanda():
    d = request.json
    items = d.get('items', [])
    if not items:
        return jsonify({'error': 'La comanda no tiene productos'}), 400
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO comandas (customer_name, items, notes) VALUES (?,?,?)",
            (d.get('customer_name',''), json.dumps(items), d.get('notes',''))
        )
        row = conn.execute('SELECT * FROM comandas WHERE id=?', (cur.lastrowid,)).fetchone()
    result = dict(row)
    result['items'] = json.loads(result['items'])
    return jsonify(result)

@app.route('/api/comandas/<int:cid>/status', methods=['PUT'])
def update_comanda_status(cid):
    d = request.json
    new_status = d.get('status')
    if new_status not in ('pendiente','listo','entregado','cancelado'):
        return jsonify({'error': 'Estado inválido'}), 400
    with get_db() as conn:
        conn.execute('UPDATE comandas SET status=? WHERE id=?', (new_status, cid))
        row = conn.execute('SELECT * FROM comandas WHERE id=?', (cid,)).fetchone()
    result = dict(row)
    result['items'] = json.loads(result['items'])
    return jsonify(result)

# ─── DEVOLUCIONES ────────────────────────────────────
@app.route('/api/returns', methods=['GET'])
def get_returns():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM returns ORDER BY created_at DESC LIMIT 50').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/returns', methods=['POST'])
def create_return():
    d = request.json or {}
    sale_id = d.get('sale_id')
    items = d.get('items', [])
    reason = d.get('reason', '')
    if not sale_id or not items:
        return jsonify({'error': 'Venta e ítems requeridos'}), 400
    with get_db() as conn:
        sale = conn.execute('SELECT * FROM sales WHERE id=?', (sale_id,)).fetchone()
        if not sale:
            return jsonify({'error': 'Venta no encontrada'}), 404
        total = sum(i['price'] * i['quantity'] for i in items)
        cur = conn.execute(
            'INSERT INTO returns (sale_id, total, reason, payment_method) VALUES (?,?,?,?)',
            (sale_id, total, reason, sale['payment_method'])
        )
        ret_id = cur.lastrowid
        for item in items:
            conn.execute(
                'INSERT INTO return_items (return_id, product_id, product_name, price, quantity, subtotal) VALUES (?,?,?,?,?,?)',
                (ret_id, item.get('product_id'), item['product_name'],
                 item['price'], item['quantity'], item['price'] * item['quantity'])
            )
            # Restaurar stock
            if item.get('product_id'):
                conn.execute('UPDATE products SET stock = stock + ? WHERE id=?',
                             (item['quantity'], item['product_id']))
        # Registrar egreso (devolución de dinero al cliente)
        conn.execute(
            "INSERT INTO cash_movements (type, amount, description, category) VALUES ('egreso',?,?,?)",
            (total, f'Devolución — Venta #{sale_id}', 'Devoluciones')
        )
        row = conn.execute('SELECT * FROM returns WHERE id=?', (ret_id,)).fetchone()
    return jsonify(row_to_dict(row))

# ─── CONTABILIDAD ─────────────────────────────────────
@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM accounts WHERE active=1 ORDER BY code').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/accounts', methods=['POST'])
def create_account():
    d = request.json or {}
    if not d.get('name') or not d.get('code') or not d.get('type'):
        return jsonify({'error': 'Código, nombre y tipo requeridos'}), 400
    with get_db() as conn:
        cur = conn.execute('INSERT INTO accounts (code,name,type) VALUES (?,?,?)',
                           (d['code'], d['name'], d['type']))
        row = conn.execute('SELECT * FROM accounts WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/journal', methods=['GET'])
def get_journal():
    from_d = request.args.get('from')
    to_d = request.args.get('to')
    limit = int(request.args.get('limit', 200))
    with get_db() as conn:
        if from_d and to_d:
            rows = conn.execute("""
                SELECT j.*, a.code, a.name as account_name, a.type as account_type
                FROM journal_entries j JOIN accounts a ON a.id=j.account_id
                WHERE date(j.date) BETWEEN date(?) AND date(?) ORDER BY j.date DESC, j.id DESC LIMIT ?
            """, (from_d, to_d, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT j.*, a.code, a.name as account_name, a.type as account_type
                FROM journal_entries j JOIN accounts a ON a.id=j.account_id
                ORDER BY j.date DESC, j.id DESC LIMIT ?
            """, (limit,)).fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/journal', methods=['POST'])
def create_journal_entry():
    d = request.json or {}
    if not d.get('account_id') or not d.get('amount') or not d.get('description') or not d.get('date'):
        return jsonify({'error': 'Cuenta, monto, descripción y fecha requeridos'}), 400
    with get_db() as conn:
        acc = conn.execute('SELECT * FROM accounts WHERE id=?', (d['account_id'],)).fetchone()
        if not acc:
            return jsonify({'error': 'Cuenta no encontrada'}), 404
        entry_type = 'ingreso' if acc['type'] in ('ingreso','otro_ingreso') else 'egreso'
        cur = conn.execute(
            'INSERT INTO journal_entries (date,account_id,description,entry_type,amount,reference) VALUES (?,?,?,?,?,?)',
            (d['date'], d['account_id'], d['description'], entry_type, d['amount'], d.get('reference',''))
        )
        row = conn.execute("""
            SELECT j.*, a.code, a.name as account_name, a.type as account_type
            FROM journal_entries j JOIN accounts a ON a.id=j.account_id WHERE j.id=?
        """, (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/journal/<int:jid>', methods=['DELETE'])
def delete_journal_entry(jid):
    with get_db() as conn:
        conn.execute('DELETE FROM journal_entries WHERE id=?', (jid,))
    return jsonify({'ok': True})

@app.route('/api/ledger', methods=['GET'])
def get_ledger():
    from_d = request.args.get('from')
    to_d = request.args.get('to')
    account_id = request.args.get('account_id')
    with get_db() as conn:
        accounts = conn.execute('SELECT * FROM accounts WHERE active=1 ORDER BY code').fetchall()
        result = []
        for acc in accounts:
            if account_id and str(acc['id']) != str(account_id):
                continue
            params = [acc['id']]
            where = 'account_id=?'
            if from_d and to_d:
                where += ' AND date(date) BETWEEN date(?) AND date(?)'
                params += [from_d, to_d]
            entries = conn.execute(
                f'SELECT * FROM journal_entries WHERE {where} ORDER BY date ASC, id ASC', params
            ).fetchall()
            total_in  = sum(e['amount'] for e in entries if e['entry_type']=='ingreso')
            total_out = sum(e['amount'] for e in entries if e['entry_type']=='egreso')
            result.append({
                'account': dict(acc),
                'entries': rows_to_list(entries),
                'total_ingreso': total_in,
                'total_egreso': total_out,
                'saldo': total_in - total_out
            })
    return jsonify(result)

@app.route('/api/acc-ventas-dia', methods=['GET'])
def get_acc_ventas_dia():
    from_d = request.args.get('from')
    to_d   = request.args.get('to')
    with get_db() as conn:
        if from_d and to_d:
            rows = conn.execute("""
                SELECT
                    date(created_at) as dia,
                    COUNT(*) as num_ventas,
                    COALESCE(SUM(total),0) as total,
                    COALESCE(SUM(CASE WHEN payment_method='efectivo' THEN total ELSE 0 END),0) as efectivo,
                    COALESCE(SUM(CASE WHEN payment_method='transferencia' THEN total ELSE 0 END),0) as transferencia
                FROM sales
                WHERE date(created_at) BETWEEN date(?) AND date(?)
                GROUP BY date(created_at)
                ORDER BY dia DESC
            """, (from_d, to_d)).fetchall()
        else:
            rows = conn.execute("""
                SELECT
                    date(created_at) as dia,
                    COUNT(*) as num_ventas,
                    COALESCE(SUM(total),0) as total,
                    COALESCE(SUM(CASE WHEN payment_method='efectivo' THEN total ELSE 0 END),0) as efectivo,
                    COALESCE(SUM(CASE WHEN payment_method='transferencia' THEN total ELSE 0 END),0) as transferencia
                FROM sales
                GROUP BY date(created_at)
                ORDER BY dia DESC
                LIMIT 60
            """).fetchall()
        result = rows_to_list(rows)
    return jsonify({
        'rows': result,
        'total_ventas': sum(r['num_ventas'] for r in result),
        'total_monto': sum(r['total'] for r in result),
        'total_efectivo': sum(r['efectivo'] for r in result),
        'total_transferencia': sum(r['transferencia'] for r in result),
    })

@app.route('/api/available-months', methods=['GET'])
def get_available_months():
    from datetime import datetime
    meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
             'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    now = datetime.now()
    cur_year = now.year
    cur_month = now.month

    # Collect all months with data
    with get_db() as conn:
        rows = conn.execute("""
            SELECT strftime('%Y-%m', date) as ym FROM journal_entries GROUP BY ym
            UNION
            SELECT strftime('%Y-%m', created_at) as ym FROM sales GROUP BY ym
        """).fetchall()
    data_months = {r['ym'] for r in rows}

    # All 12 months of current year + any months with data from other years
    all_yms = set()
    for m in range(1, 13):
        all_yms.add(f"{cur_year}-{str(m).zfill(2)}")
    # Add past-year months that have data
    for ym in data_months:
        y = int(ym.split('-')[0])
        if y != cur_year:
            all_yms.add(ym)

    months = []
    for ym in sorted(all_yms, reverse=True):
        y, m = ym.split('-')
        months.append({'ym': ym, 'year': int(y), 'month': int(m),
                       'label': f"{meses[int(m)-1]} {y}"})
    return jsonify(months)

@app.route('/api/acc-summary', methods=['GET'])
def get_acc_summary():
    from_d = request.args.get('from')
    to_d   = request.args.get('to')
    with get_db() as conn:
        if from_d and to_d:
            sales_row = conn.execute(
                "SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM sales WHERE date(created_at) BETWEEN date(?) AND date(?)",
                (from_d, to_d)
            ).fetchone()
            egresos_row = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM cash_movements WHERE type='egreso' AND date(created_at) BETWEEN date(?) AND date(?)",
                (from_d, to_d)
            ).fetchone()
            ingresos_mov = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM cash_movements WHERE type='ingreso' AND date(created_at) BETWEEN date(?) AND date(?)",
                (from_d, to_d)
            ).fetchone()
        else:
            sales_row = conn.execute(
                "SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total FROM sales"
            ).fetchone()
            egresos_row = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM cash_movements WHERE type='egreso'"
            ).fetchone()
            ingresos_mov = conn.execute(
                "SELECT COALESCE(SUM(amount),0) as total FROM cash_movements WHERE type='ingreso'"
            ).fetchone()
        # Dinero en caja = total ingresos movimientos - total egresos (sin filtro de fecha, saldo acumulado)
        caja_ing = conn.execute("SELECT COALESCE(SUM(amount),0) as t FROM cash_movements WHERE type='ingreso'").fetchone()
        caja_egr = conn.execute("SELECT COALESCE(SUM(amount),0) as t FROM cash_movements WHERE type='egreso'").fetchone()
    return jsonify({
        'total_ventas': sales_row['total'],
        'num_ventas': sales_row['count'],
        'total_egresos': egresos_row['total'],
        'total_ingresos_mov': ingresos_mov['total'],
        'dinero_en_caja': caja_ing['t'] - caja_egr['t'],
    })

@app.route('/api/income-statement', methods=['GET'])
def get_income_statement():
    from_d = request.args.get('from')
    to_d = request.args.get('to')
    with get_db() as conn:
        params_base = []
        date_filter = ''
        if from_d and to_d:
            date_filter = ' AND date(j.date) BETWEEN date(?) AND date(?)'
            params_base = [from_d, to_d]

        def get_by_type(acc_type, code_prefix=None):
            code_cond = f" AND a.code LIKE '{code_prefix}%'" if code_prefix else ''
            rows = conn.execute(f"""
                SELECT a.id, a.code, a.name, COALESCE(SUM(j.amount),0) as total
                FROM accounts a
                LEFT JOIN journal_entries j ON j.account_id=a.id{date_filter}
                WHERE a.type=? AND a.active=1{code_cond}
                GROUP BY a.id ORDER BY a.code
            """, params_base + [acc_type]).fetchall()
            return rows_to_list(rows)

        ingresos        = get_by_type('ingreso')
        costos          = get_by_type('costo')
        gastos_op       = get_by_type('gasto_operativo')
        gastos_fin      = get_by_type('gasto_admin')        # 7xxx — Gastos Financieros
        otros_gastos    = get_by_type('otro_gasto', '8')    # 8xxx — Otros Gastos
        impuestos_list  = get_by_type('otro_gasto', '9')    # 9xxx — Impuestos

        total_ingresos  = sum(r['total'] for r in ingresos)
        total_costos    = sum(r['total'] for r in costos)
        total_gastos_op = sum(r['total'] for r in gastos_op)
        total_gastos_fin= sum(r['total'] for r in gastos_fin)
        total_otros     = sum(r['total'] for r in otros_gastos)
        total_impuestos = sum(r['total'] for r in impuestos_list)

        ganancia_bruta          = total_ingresos - total_costos
        pct_bruta               = round(ganancia_bruta / total_ingresos * 100, 2) if total_ingresos else 0
        ganancia_antes_gastos_fin = ganancia_bruta - total_gastos_op
        pct_antes_gastos_fin    = round(ganancia_antes_gastos_fin / total_ingresos * 100, 2) if total_ingresos else 0
        ganancia_antes_imp      = ganancia_antes_gastos_fin - total_gastos_fin - total_otros
        ganancia_neta           = ganancia_antes_imp - total_impuestos
        pct_neta                = round(ganancia_neta / total_ingresos * 100, 2) if total_ingresos else 0

    return jsonify({
        'ingresos': ingresos, 'total_ingresos': total_ingresos,
        'costos': costos, 'total_costos': total_costos,
        'gastos_operativos': gastos_op, 'total_gastos_op': total_gastos_op,
        'gastos_financieros': gastos_fin, 'total_gastos_fin': total_gastos_fin,
        'otros_gastos': otros_gastos, 'total_otros': total_otros,
        'impuestos': impuestos_list, 'total_impuestos': total_impuestos,
        'ganancia_bruta': ganancia_bruta, 'pct_bruta': pct_bruta,
        'ganancia_antes_gastos_fin': ganancia_antes_gastos_fin, 'pct_antes_gastos_fin': pct_antes_gastos_fin,
        'ganancia_antes_impuestos': ganancia_antes_imp,
        'ganancia_neta': ganancia_neta, 'pct_neta': pct_neta,
        # backward compat for dashboard
        'total_gastos_admin': total_gastos_fin,
        'utilidad_bruta': ganancia_bruta,
        'utilidad_operativa': ganancia_antes_gastos_fin,
        'utilidad_neta': ganancia_neta,
    })

# ─── PÉRDIDAS ────────────────────────────────────────
@app.route('/api/losses', methods=['GET'])
def get_losses():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM losses ORDER BY created_at DESC').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/losses', methods=['POST'])
def create_loss():
    d = request.json or {}
    if not d.get('product_name') or not d.get('quantity') or not d.get('reason') or not d.get('responsible'):
        return jsonify({'error': 'Producto, cantidad, motivo y responsable son requeridos'}), 400
    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO losses (product_id, product_name, quantity, unit, reason, responsible, notes, sale_value, category) VALUES (?,?,?,?,?,?,?,?,?)',
            (d.get('product_id'), d['product_name'], d['quantity'],
             d.get('unit', 'unidad'), d['reason'], d['responsible'], d.get('notes', ''),
             d.get('sale_value', 0), d.get('category', ''))
        )
        # Descontar del inventario si el producto tiene id
        if d.get('product_id'):
            conn.execute(
                'UPDATE products SET stock = MAX(0, stock - ?) WHERE id=?',
                (d['quantity'], d['product_id'])
            )
        row = conn.execute('SELECT * FROM losses WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/losses/<int:lid>', methods=['DELETE'])
def delete_loss(lid):
    with get_db() as conn:
        loss = conn.execute('SELECT * FROM losses WHERE id=?', (lid,)).fetchone()
        if not loss:
            return jsonify({'error': 'Pérdida no encontrada'}), 404
        # Restaurar stock
        if loss['product_id']:
            conn.execute(
                'UPDATE products SET stock = stock + ? WHERE id=?',
                (loss['quantity'], loss['product_id'])
            )
        conn.execute('DELETE FROM losses WHERE id=?', (lid,))
    return jsonify({'ok': True})

# ─── TERMINALES POS ──────────────────────────────────
@app.route('/api/terminals', methods=['GET'])
def get_terminals():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM pos_terminals WHERE active=1 ORDER BY id').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/terminals', methods=['POST'])
def create_terminal():
    d = request.json or {}
    if not d.get('name'):
        return jsonify({'error': 'Nombre requerido'}), 400
    with get_db() as conn:
        cur = conn.execute('INSERT INTO pos_terminals (name, color, icon) VALUES (?,?,?)',
                           (d['name'], d.get('color','#3b82f6'), d.get('icon','🛒')))
        row = conn.execute('SELECT * FROM pos_terminals WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/terminals/<int:tid>', methods=['DELETE'])
def delete_terminal(tid):
    with get_db() as conn:
        conn.execute('UPDATE pos_terminals SET active=0 WHERE id=?', (tid,))
    return jsonify({'ok': True})

# ─── SETTINGS ────────────────────────────────────────
@app.route('/api/settings', methods=['GET'])
def get_settings():
    with get_db() as conn:
        rows = conn.execute('SELECT key, value FROM settings').fetchall()
    return jsonify({r['key']: r['value'] for r in rows})

@app.route('/api/settings', methods=['POST'])
def save_settings():
    d = request.json or {}
    with get_db() as conn:
        for key, value in d.items():
            conn.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', (key, str(value)))
    return jsonify({'ok': True})

@app.route('/api/settings/test-whatsapp', methods=['POST'])
def test_whatsapp():
    d = request.json or {}
    phone    = d.get('phone', '').strip()
    instance = d.get('greenapi_instance', '').strip()
    token    = d.get('greenapi_token', '').strip()
    if not phone or not instance or not token:
        return jsonify({'error': 'Completa el número, ID de instancia y token'}), 400
    try:
        import json as _json
        chat_id = phone.lstrip('+').replace(' ', '') + '@c.us'
        url = f'https://api.green-api.com/waInstance{instance}/sendMessage/{token}'
        payload = _json.dumps({'chatId': chat_id, 'message': '✅ Prueba exitosa — POS Delicias del Rey conectado.'}).encode()
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        resp = urllib.request.urlopen(req, timeout=15)
        result = _json.loads(resp.read().decode())
        print(f'[GreenAPI] Respuesta: {result}')
        return jsonify({'ok': True, 'result': result})
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'[GreenAPI] HTTP Error {e.code}: {body}')
        return jsonify({'error': f'Error {e.code}: {body}'}), 400
    except Exception as e:
        print(f'[GreenAPI] Error: {e}')
        return jsonify({'error': str(e)}), 500

# ─── TRABAJADORES ────────────────────────────────────
@app.route('/api/workers', methods=['GET'])
def get_workers():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM workers WHERE active=1 ORDER BY name').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/workers', methods=['POST'])
def create_worker():
    d = request.json or {}
    if not d.get('name'):
        return jsonify({'error': 'El nombre es requerido'}), 400
    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO workers (name, cargo, phone) VALUES (?,?,?)',
            (d['name'], d.get('cargo',''), d.get('phone',''))
        )
        row = conn.execute('SELECT * FROM workers WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/workers/<int:wid>', methods=['DELETE'])
def delete_worker(wid):
    with get_db() as conn:
        conn.execute('UPDATE workers SET active=0 WHERE id=?', (wid,))
    return jsonify({'ok': True})

@app.route('/api/workers/<int:wid>/notes', methods=['GET'])
def get_worker_notes(wid):
    with get_db() as conn:
        rows = conn.execute(
            'SELECT * FROM worker_notes WHERE worker_id=? ORDER BY created_at DESC', (wid,)
        ).fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/workers/<int:wid>/notes', methods=['POST'])
def create_worker_note(wid):
    d = request.json or {}
    if not d.get('content'):
        return jsonify({'error': 'El contenido es requerido'}), 400
    with get_db() as conn:
        worker = conn.execute('SELECT id FROM workers WHERE id=? AND active=1', (wid,)).fetchone()
        if not worker:
            return jsonify({'error': 'Trabajador no encontrado'}), 404
        note_type = d.get('note_type', 'nota')
        cur = conn.execute(
            'INSERT INTO worker_notes (worker_id, content, note_type) VALUES (?,?,?)',
            (wid, d['content'], note_type)
        )
        row = conn.execute('SELECT * FROM worker_notes WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/workers/notes/<int:nid>', methods=['DELETE'])
def delete_worker_note(nid):
    with get_db() as conn:
        conn.execute('DELETE FROM worker_notes WHERE id=?', (nid,))
    return jsonify({'ok': True})

@app.route('/api/workers/<int:wid>/stats', methods=['GET'])
def get_worker_stats(wid):
    with get_db() as conn:
        worker = conn.execute('SELECT * FROM workers WHERE id=?', (wid,)).fetchone()
        if not worker:
            return jsonify({'error': 'Not found'}), 404
        name = worker['name']
        # Descuadres (cierres con diferencia negativa donde fue responsable)
        desc = conn.execute(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(ABS(difference)),0) as total FROM cash_registers WHERE status='cerrada' AND notes LIKE ? AND difference < 0",
            (f'%{name}%',)
        ).fetchone()
        # Pérdidas registradas
        perd = conn.execute(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(sale_value),0) as valor FROM losses WHERE responsible LIKE ?",
            (f'%{name}%',)
        ).fetchone()
        # Tareas pendientes
        tareas_pend = conn.execute(
            "SELECT COUNT(*) as cnt FROM tasks WHERE assigned_to LIKE ? AND status='pendiente'",
            (f'%{name}%',)
        ).fetchone()
        tareas_total = conn.execute(
            "SELECT COUNT(*) as cnt FROM tasks WHERE assigned_to LIKE ?",
            (f'%{name}%',)
        ).fetchone()
        # Notas
        notas_cnt = conn.execute(
            "SELECT COUNT(*) as cnt FROM worker_notes WHERE worker_id=?", (wid,)
        ).fetchone()
        # Últimos descuadres
        ultimos = conn.execute(
            "SELECT opened_at, closed_at, difference, notes FROM cash_registers WHERE status='cerrada' AND notes LIKE ? AND difference < 0 ORDER BY closed_at DESC LIMIT 5",
            (f'%{name}%',)
        ).fetchall()
        # Lista de pérdidas del trabajador
        perdidas_list = conn.execute(
            "SELECT product_name, quantity, unit, reason, category, sale_value, created_at FROM losses WHERE responsible LIKE ? ORDER BY created_at DESC",
            (f'%{name}%',)
        ).fetchall()
    return jsonify({
        'descuadres': {'count': desc['cnt'], 'total': desc['total']},
        'perdidas': {'count': perd['cnt'], 'valor': perd['valor']},
        'tareas': {'pendientes': tareas_pend['cnt'], 'total': tareas_total['cnt']},
        'notas': notas_cnt['cnt'],
        'ultimos_descuadres': rows_to_list(ultimos),
        'perdidas_list': rows_to_list(perdidas_list)
    })

@app.route('/api/workers/<int:wid>/documents', methods=['GET'])
def get_worker_documents(wid):
    with get_db() as conn:
        rows = conn.execute(
            'SELECT * FROM worker_documents WHERE worker_id=? ORDER BY created_at DESC', (wid,)
        ).fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/workers/<int:wid>/documents', methods=['POST'])
def upload_worker_document(wid):
    import time as _time
    doc_type    = request.form.get('doc_type', 'general')
    description = request.form.get('description', '')
    filename    = ''
    original_name = ''
    upload_dir  = os.path.join(os.path.dirname(__file__), 'public', 'uploads', 'workers')
    os.makedirs(upload_dir, exist_ok=True)
    if 'file' in request.files:
        f = request.files['file']
        if f and f.filename:
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else 'pdf'
            filename = f'worker_{wid}_{int(_time.time())}.{ext}'
            original_name = f.filename
            f.save(os.path.join(upload_dir, filename))
    with get_db() as conn:
        worker = conn.execute('SELECT id FROM workers WHERE id=? AND active=1', (wid,)).fetchone()
        if not worker:
            return jsonify({'error': 'Trabajador no encontrado'}), 404
        cur = conn.execute(
            'INSERT INTO worker_documents (worker_id, filename, original_name, doc_type, description) VALUES (?,?,?,?,?)',
            (wid, filename, original_name, doc_type, description)
        )
        row = conn.execute('SELECT * FROM worker_documents WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/workers/documents/<int:did>', methods=['DELETE'])
def delete_worker_document(did):
    with get_db() as conn:
        doc = conn.execute('SELECT * FROM worker_documents WHERE id=?', (did,)).fetchone()
        if doc and doc['filename']:
            path = os.path.join(os.path.dirname(__file__), 'public', 'uploads', 'workers', doc['filename'])
            if os.path.exists(path):
                os.remove(path)
        conn.execute('DELETE FROM worker_documents WHERE id=?', (did,))
    return jsonify({'ok': True})

# ─── TAREAS ──────────────────────────────────────────
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    with get_db() as conn:
        rows = conn.execute('SELECT * FROM tasks ORDER BY status ASC, created_at DESC').fetchall()
    return jsonify(rows_to_list(rows))

@app.route('/api/tasks', methods=['POST'])
def create_task():
    d = request.json or {}
    if not d.get('funcion'):
        return jsonify({'error': 'La función es requerida'}), 400
    with get_db() as conn:
        cur = conn.execute(
            'INSERT INTO tasks (funcion, area, assigned_to) VALUES (?,?,?)',
            (d['funcion'], d.get('area',''), d.get('assigned_to',''))
        )
        row = conn.execute('SELECT * FROM tasks WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/tasks/<int:tid>/status', methods=['PUT'])
def update_task_status(tid):
    d = request.json or {}
    new_status = d.get('status')
    if new_status not in ('pendiente', 'realizado'):
        return jsonify({'error': 'Estado inválido'}), 400
    completed_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S') if new_status == 'realizado' else None
    with get_db() as conn:
        conn.execute('UPDATE tasks SET status=?, completed_at=? WHERE id=?', (new_status, completed_at, tid))
        row = conn.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
    return jsonify(row_to_dict(row))

@app.route('/api/tasks/<int:tid>', methods=['DELETE'])
def delete_task(tid):
    with get_db() as conn:
        conn.execute('DELETE FROM tasks WHERE id=?', (tid,))
    return jsonify({'ok': True})

# ─── RESET ───────────────────────────────────────────
@app.route('/api/reset', methods=['POST'])
def reset_pos():
    d = request.json or {}
    pin = str(d.get('pin', '')).strip()
    if not pin:
        return jsonify({'error': 'PIN requerido'}), 400

    with get_db() as conn:
        cfg = {r['key']: r['value'] for r in conn.execute('SELECT key,value FROM settings').fetchall()}

    pin_admin  = cfg.get('pin_admin',  '1623')
    pin_worker = cfg.get('pin_worker', '0000')

    if pin == pin_admin:
        # Borrar TODO
        with get_db() as conn:
            conn.executescript("""
                DELETE FROM sale_items;
                DELETE FROM sales;
                DELETE FROM cash_movements;
                DELETE FROM cash_registers;
                DELETE FROM comandas;
                DELETE FROM return_items;
                DELETE FROM returns;
                DELETE FROM journal_entries;
                DELETE FROM losses;
                DELETE FROM products;
                UPDATE SQLITE_SEQUENCE SET seq=0 WHERE name IN
                    ('sales','sale_items','cash_movements','cash_registers',
                     'comandas','returns','return_items','journal_entries',
                     'losses','products');
            """)
            # Reinsertar productos de muestra
            samples = [
                ('Café americano','Bebidas',25,100,'taza',10),
                ('Café con leche','Bebidas',30,100,'taza',10),
                ('Capuchino','Bebidas',35,100,'taza',10),
                ('Té negro','Bebidas',20,50,'taza',10),
                ('Agua natural 500ml','Bebidas',15,24,'botella',6),
                ('Croissant','Panadería',28,20,'pieza',5),
                ('Muffin','Panadería',25,15,'pieza',5),
                ('Sándwich jamón','Comida',55,10,'pieza',3),
                ('Ensalada de frutas','Comida',45,8,'porción',3),
                ('Jugo naranja','Bebidas',35,10,'vaso',5),
            ]
            conn.executemany(
                'INSERT INTO products (name,category,price,stock,unit,low_stock_alert) VALUES (?,?,?,?,?,?)',
                samples
            )
        return jsonify({'ok': True, 'type': 'full'})

    elif pin == pin_worker:
        # Borrar solo inventario
        with get_db() as conn:
            conn.executescript("""
                DELETE FROM products;
                UPDATE SQLITE_SEQUENCE SET seq=0 WHERE name='products';
            """)
            samples = [
                ('Café americano','Bebidas',25,100,'taza',10),
                ('Café con leche','Bebidas',30,100,'taza',10),
                ('Capuchino','Bebidas',35,100,'taza',10),
                ('Té negro','Bebidas',20,50,'taza',10),
                ('Agua natural 500ml','Bebidas',15,24,'botella',6),
                ('Croissant','Panadería',28,20,'pieza',5),
                ('Muffin','Panadería',25,15,'pieza',5),
                ('Sándwich jamón','Comida',55,10,'pieza',3),
                ('Ensalada de frutas','Comida',45,8,'porción',3),
                ('Jugo naranja','Bebidas',35,10,'vaso',5),
            ]
            conn.executemany(
                'INSERT INTO products (name,category,price,stock,unit,low_stock_alert) VALUES (?,?,?,?,?,?)',
                samples
            )
        return jsonify({'ok': True, 'type': 'inventory'})

    else:
        return jsonify({'error': 'PIN incorrecto'}), 401


def send_whatsapp(phone, instance, token, message):
    try:
        import json as _json
        # Formatear chatId: número colombiano → 57XXXXXXXXXX@c.us
        chat_id = phone.lstrip('+').replace(' ', '') + '@c.us'
        url = f'https://api.green-api.com/waInstance{instance}/sendMessage/{token}'
        payload = _json.dumps({'chatId': chat_id, 'message': message}).encode()
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        urllib.request.urlopen(req, timeout=15)
        print(f'[WhatsApp GreenAPI] Mensaje enviado a {chat_id}')
    except Exception as e:
        print(f'[WhatsApp GreenAPI] Error: {e}')

if __name__ == '__main__':
    init_db()
    # Crear índices para acelerar consultas frecuentes
    with get_db() as conn:
        conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
            CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
            CREATE INDEX IF NOT EXISTS idx_movements_created ON cash_movements(created_at);
            CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, category);
            CREATE INDEX IF NOT EXISTS idx_comandas_status ON comandas(status);
        """)
    print('\n✅ POS Cafetería corriendo en http://localhost:3000\n')
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
