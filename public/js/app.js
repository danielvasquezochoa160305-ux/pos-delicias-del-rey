// ═══════════════════════════════════════════════════════
//  POS CAFETERÍA — app.js
// ═══════════════════════════════════════════════════════

// ─── INICIO DIRECTO ───────────────────────────────
var _turno = 'manana'; // turno activo: 'manana' | 'tarde'
var settings = null;   // configuración global del negocio

var _terminal = null;

async function initTerminalScreen() {
  try {
    settings = await api('GET', '/api/settings');
    const bizName = settings.negocio_nombre || 'Delicias del Rey';
    document.title = bizName;
    document.getElementById('terminal-biz-name').textContent = bizName;
  } catch(e) { console.error(e); }

  _hidePOS();
  document.getElementById('user-screen').style.display = 'flex';

  try {
    const terminals = await api('GET', '/api/terminals');
    const termCards = terminals.map(t => `
      <div class="terminal-card" onclick="selectTerminal(${t.id},'${t.name}','${t.color}','${t.icon}')">
        <span class="terminal-card-dot" style="background:${t.color}"></span>
        <span class="terminal-card-icon">${t.icon}</span>
        <div class="terminal-card-name">${t.name}</div>
      </div>`).join('');
    const contCard = `
      <div class="terminal-card" onclick="document.getElementById('terminal-screen').style.display='none';openMonthSelector()">
        <span class="terminal-card-dot" style="background:#8b5cf6"></span>
        <span class="terminal-card-icon">📒</span>
        <div class="terminal-card-name">Contabilidad</div>
      </div>`;
    document.getElementById('terminal-grid').innerHTML = termCards + contCard;
  } catch(e) { console.error(e); }
}

var _userRole = 'worker'; // 'admin' | 'worker'

function selectTerminal(id, name, color, icon) {
  _terminal = { id, name, color, icon };
  document.getElementById('terminal-screen').style.display = 'none';
  _showPOS();
  applyRolePermissions();
  actualizarBadgeTurno();
  const startPage = _userRole === 'admin' ? 'dashboard' : 'pos';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${startPage}"]`);
  if (navItem) navItem.classList.add('active');
  document.getElementById(`page-${startPage}`)?.classList.add('active');
  if (startPage === 'dashboard') loadDashboard(); else loadPOS();
}

var _pinBuffer = '';
var _pinRole   = '';

function selectUser(role) {
  _pinRole   = role;
  _pinBuffer = '';
  document.getElementById('user-screen').style.display = 'none';
  // Mostrar pantalla de PIN
  document.getElementById('pin-role-icon').textContent = role === 'admin' ? '👑' : '👷';
  document.getElementById('pin-role-name').textContent = role === 'admin' ? 'Administrativo' : 'Trabajador';
  document.getElementById('pin-error').textContent = '';
  updatePinDots();
  document.getElementById('pin-screen').style.display = 'flex';
}

function volverAUsuarios() {
  document.getElementById('pin-screen').style.display = 'none';
  document.getElementById('user-screen').style.display = 'flex';
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    document.getElementById(`pin-d${i}`).classList.toggle('filled', i < _pinBuffer.length);
  }
}

function pinKey(k) {
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += k;
  updatePinDots();
  if (_pinBuffer.length === 4) pinConfirm();
}

function pinBack() {
  _pinBuffer = _pinBuffer.slice(0, -1);
  updatePinDots();
}

async function pinConfirm() {
  if (_pinBuffer.length === 0) return;
  const correctPin = _pinRole === 'admin' ? (settings?.pin_admin || '1623') : (settings?.pin_worker || '0000');
  if (_pinBuffer === correctPin) {
    _userRole = _pinRole;
    document.getElementById('pin-screen').style.display = 'none';
    if (_userRole === 'worker') {
      // Trabajador entra directo al Punto de Venta sin pasar por selección de terminal
      const firstTerminal = (await api('GET', '/api/terminals').catch(()=>[]))[0];
      if (firstTerminal) _terminal = firstTerminal;
      _showPOS();
      applyRolePermissions();
      actualizarBadgeTurno();
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.querySelector('.nav-item[data-page="pos"]')?.classList.add('active');
      document.getElementById('page-pos')?.classList.add('active');
      loadPOS();
    } else {
      document.getElementById('terminal-screen').style.display = 'flex';
    }
  } else {
    document.getElementById('pin-error').textContent = '❌ Contraseña incorrecta';
    const dots = document.getElementById('pin-dots');
    dots.classList.remove('pin-shake');
    void dots.offsetWidth;
    dots.classList.add('pin-shake');
    _pinBuffer = '';
    updatePinDots();
  }
}

function applyRolePermissions() {
  const isAdmin = _userRole === 'admin';
  // Dashboard solo para admin
  const navDash = document.getElementById('nav-dashboard');
  if (navDash) navDash.style.display = isAdmin ? '' : 'none';
  // Configuración solo para admin
  const btnConf = document.getElementById('btn-configuracion');
  if (btnConf) btnConf.style.display = isAdmin ? '' : 'none';
}

function cambiarTerminal() {
  _hidePOS();
  document.getElementById('terminal-screen').style.display = 'none';
  document.getElementById('user-screen').style.display = 'flex';
}

function seleccionarTurnoBtn(btn, turno) {
  _turno = turno;
  document.querySelectorAll('#turno-btn-manana, #turno-btn-tarde').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  actualizarBadgeTurno();
}

function actualizarBadgeTurno() {
  const badge = document.getElementById('sidebar-turno-badge');
  if (!badge) return;
  const info = _turno === 'tarde'
    ? { label: 'Turno tarde', icon: '🌙', color: '#6366f1' }
    : { label: 'Turno mañana', icon: '☀️', color: '#FC4C02' };
  badge.innerHTML = `<span>${info.icon}</span><span style="flex:1">${info.label}</span><span style="font-size:10px;opacity:.6">↩</span>`;
  badge.style.borderColor = info.color + '55';
}

function cambiarTurno() {
  if (!confirm('¿Cambiar de turno?')) return;
  openModal('modal-apertura');
}

function _hidePOS() {
  document.querySelector('.sidebar').style.display = 'none';
  document.querySelector('.main-content').style.display = 'none';
}
function _showPOS() {
  document.querySelector('.sidebar').style.display = '';
  document.querySelector('.main-content').style.display = '';
}

async function openMonthSelector() {
  _hidePOS();
  document.getElementById('month-selector-screen').style.display = 'flex';
  const months = await api('GET', '/api/available-months');
  const MONTH_ICONS = ['🎄','❄️','💐','🌧️','🌻','☀️','🌊','🍂','🌾','🎃','🍂','🎁'];
  const now = new Date();
  const curYM = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('month-sel-grid').innerHTML = months.map(m => `
    <div class="month-card${m.ym === curYM ? ' current' : ''}" onclick="selectMonth('${m.ym}')">
      <span class="month-card-icon">${MONTH_ICONS[m.month - 1]}</span>
      <div class="month-card-name">${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m.month-1]}</div>
      <div class="month-card-year">${m.year}</div>
    </div>`).join('');
}

function closeMonthSelector() {
  document.getElementById('month-selector-screen').style.display = 'none';
  cambiarTerminal();
}

function selectMonth(ym) {
  const [y, m] = ym.split('-');
  const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
  const from = `${ym}-01`;
  const to   = `${ym}-${String(lastDay).padStart(2,'0')}`;
  document.getElementById('month-selector-screen').style.display = 'none';
  document.getElementById('accounting-screen').style.display = 'flex';
  document.getElementById('acc-from').value = from;
  document.getElementById('acc-to').value   = to;
  switchAccTab('dashboard');
}

function openAccountingApp() {
  _hidePOS();
  document.getElementById('accounting-screen').style.display = 'flex';
  setDefaultDates('acc-from', 'acc-to');
  switchAccTab('dashboard');
}

function closeAccountingApp() {
  document.getElementById('accounting-screen').style.display = 'none';
  document.getElementById('month-selector-screen').style.display = 'none';
  cambiarTerminal();
}

// ─── Estado global ───────────────────────────────────
let allProducts = [];
let cart = [];
let currentSaleForPrint = null;
let activeCategory = 'Todos';
let posSearchTerm = '';

// ─── NAVEGACIÓN ──────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const page = item.dataset.page;
    document.getElementById(`page-${page}`).classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'pos') loadPOS();
    if (page === 'sales') { setDefaultDates('sales-from','sales-to'); loadSales(); }
    if (page === 'movements') { setDefaultDates('mov-from','mov-to'); loadMovements(); loadRegisterStatus(); }
    if (page === 'inventory') loadInventory();
    if (page === 'losses') loadLosses();
  });
});


// ─── HELPERS ─────────────────────────────────────────
const fmt = n => '$' + Number(n).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtDate = s => new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 3000);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function setDefaultDates(fromId, toId) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  if (!document.getElementById(fromId).value) document.getElementById(fromId).value = weekAgo;
  if (!document.getElementById(toId).value) document.getElementById(toId).value = today;
}

async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  let r;
  try { r = await fetch(url, opts); }
  catch { throw new Error('Sin conexión con el servidor'); }
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.error || 'Error del servidor'); }
  return r.json();
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
async function loadDashboard() {
  document.getElementById('today-label').textContent = new Date().toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  try {
    const d = await api('GET', '/api/dashboard');
    document.getElementById('dash-ventas').textContent = d.ventasHoy;
    document.getElementById('dash-total').textContent = fmt(d.totalHoy);
    document.getElementById('dash-ingreso').textContent = fmt(d.ingresoHoy);
    document.getElementById('dash-egreso').textContent = fmt(d.egresoHoy);
    document.getElementById('dash-balance').textContent = fmt(d.balanceHoy);

    // Top productos
    const topTbody = document.querySelector('#dash-top-table tbody');
    topTbody.innerHTML = d.topProductos.length ? d.topProductos.map(p => `
      <tr>
        <td>${p.product_name}</td>
        <td>${p.qty}</td>
        <td>${fmt(p.total)}</td>
      </tr>`).join('') : '<tr><td colspan="3" class="empty-state">Sin datos esta semana</td></tr>';

    // Stock bajo
    const stockTbody = document.querySelector('#dash-stock-table tbody');
    stockTbody.innerHTML = d.bajoStock.length ? d.bajoStock.map(p => `
      <tr>
        <td>${p.name}</td>
        <td><span class="badge ${p.stock === 0 ? 'badge-danger' : 'badge-warning'}">${p.stock} ${p.unit}</span></td>
        <td>${p.low_stock_alert}</td>
      </tr>`).join('') : '<tr><td colspan="3" class="empty-state" style="padding:16px;color:#64748b">Sin alertas de stock</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  POS — PUNTO DE VENTA
// ═══════════════════════════════════════════════════════

// Paleta de colores para categorías (pasteles)
const CAT_COLORS = [
  '#a8d8ea','#f9c6c9','#b5ead7','#ffdac1','#c7ceea',
  '#f2c6de','#d4f0c0','#ffe5b4','#e8d5f5','#fce4ec',
  '#b2dfdb','#fff9c4','#f8bbd0','#c8e6c9','#bbdefb',
];
var catColorMap = {};

function getCatColor(cat) {
  if (!catColorMap[cat]) {
    const keys = Object.keys(catColorMap).length;
    catColorMap[cat] = CAT_COLORS[keys % CAT_COLORS.length];
  }
  return catColorMap[cat];
}

// Emoji placeholder por categoría
const CAT_EMOJI = {
  'bebidas': '☕', 'panadería': '🥐', 'comida': '🍽️',
  'fritos': '🍟', 'jugos': '🥤', 'tortas': '🥪',
  'lacteos': '🥛', 'panes': '🍞', 'mecato': '🍿',
  'horneado': '🥧', 'otros': '🛍️', 'todos': '🏪',
};
function getCatEmoji(cat) {
  return CAT_EMOJI[cat.toLowerCase()] || '🍴';
}

async function loadPOS() {
  // Verificar estado de caja
  try {
    const reg = await api('GET', '/api/registers/current');
    setPOSLock(!reg);
  } catch { setPOSLock(true); }

  try {
    allProducts = await api('GET', '/api/products');
    ['Todos', ...new Set(allProducts.map(p => p.category))].forEach(c => getCatColor(c));
    renderCategories();
    renderProducts();
  } catch (e) { toast(e.message, 'error'); }
}

function setPOSLock(locked) {
  document.getElementById('pos-lock').style.display = locked ? 'flex' : 'none';
  document.getElementById('pos-content').style.pointerEvents = locked ? 'none' : '';
  document.getElementById('pos-content').style.opacity = locked ? '0.3' : '';
}

function irAbrirCaja() {
  // Navegar a Caja y abrir modal de apertura
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="movements"]').classList.add('active');
  document.getElementById('page-movements').classList.add('active');
  setDefaultDates('mov-from','mov-to');
  loadMovements();
  loadRegisterStatus();
  setTimeout(() => openModal('modal-apertura'), 150);
}

function renderCategories() {
  const cats = ['Todos', ...new Set(allProducts.map(p => p.category))];
  const container = document.getElementById('pos-categories');
  container.innerHTML = cats.map(c => {
    const bg = getCatColor(c);
    return `<button class="cat-tab ${c === activeCategory ? 'active' : ''}"
      style="background:${bg};color:#333"
      onclick="filterCategory('${c.replace(/'/g,"\\'")}')">
      ${c}
    </button>`;
  }).join('');
}

function filterCategory(cat) {
  activeCategory = cat;
  renderCategories();
  renderProducts();
}

document.getElementById('pos-search').addEventListener('input', function () {
  posSearchTerm = this.value.toLowerCase();
  renderProducts();
});

function renderProducts() {
  const grid = document.getElementById('pos-grid');
  let filtered = allProducts;
  if (activeCategory !== 'Todos') filtered = filtered.filter(p => p.category === activeCategory);
  if (posSearchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(posSearchTerm));

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px"><div class="empty-icon">🔍</div>Sin resultados</div>';
    return;
  }
  grid.innerHTML = filtered.map(p => {
    const bg = getCatColor(p.category);
    const emoji = getCatEmoji(p.category);
    const imgContent = p.image
      ? `<img src="/uploads/products/${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover"/>`
      : `<div class="prod-image-placeholder" style="background:${bg}">${emoji}</div>`;
    return `
    <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}"
         onclick="${p.stock > 0 ? `addToCart(${p.id})` : ''}">
      <div class="prod-image-wrap">${imgContent}</div>
      <button class="prod-info-btn" onclick="event.stopPropagation();showProdInfo(${p.id})">i</button>
      <div class="prod-label">
        <div class="prod-name">${p.name}</div>
        <div class="prod-price">${fmt(p.price)}</div>
      </div>
    </div>`;
  }).join('');
}

function showProdInfo(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  toast(`${p.name} — Stock: ${p.stock} ${p.unit}`, '');
}

function addToCart(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;
  const existing = cart.find(i => i.product_id === productId);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ product_id: product.id, product_name: product.name, price: product.price, quantity: 1 });
  }
  renderCart();
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(i => i.product_id !== productId);
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.product_id !== productId);
  renderCart();
}

function clearCart() {
  cart = [];
  // Resetear salsas
  window._salsas = { rosada: 0, aji: 0, tartara: 0, roja: 0 };
  ['rosada','aji','tartara','roja'].forEach(k => {
    const el = document.getElementById('salsa-' + k);
    if (el) { el.querySelector('.salsa-qty').textContent = '0'; el.classList.remove('has-qty'); }
  });
  // Resetear consumo a "aquí"
  window._consumoTipo = 'aqui';
  document.querySelectorAll('.consumo-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  // Resetear nombre cliente
  const clienteInput = document.querySelector('#tab-cliente input');
  if (clienteInput) clienteInput.value = '';
  renderCart();
}

// Tabs del carrito
function selectConsumo(btn, tipo) {
  document.querySelectorAll('.consumo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  window._consumoTipo = tipo;
}
window._consumoTipo = 'aqui';

window._salsas = { rosada: 0, aji: 0, tartara: 0, roja: 0 };

function changeSalsa(nombre, delta) {
  const current = window._salsas[nombre] || 0;
  const nuevo = Math.max(0, current + delta);
  window._salsas[nombre] = nuevo;
  const item = document.getElementById('salsa-' + nombre);
  item.querySelector('.salsa-qty').textContent = nuevo;
  item.classList.toggle('has-qty', nuevo > 0);
}

function switchCartTab(btn, panelId) {
  document.querySelectorAll('.cart-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cart-tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId).classList.add('active');
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const payPanel = document.getElementById('cart-pay-panel');
  if (!cart.length) {
    container.innerHTML = `
      <div class="cart-empty-state">
        <div class="cart-empty-icon">🛒</div>
        <p>Comience a añadir productos</p>
      </div>`;
    payPanel.style.display = 'none';
    return;
  }
  payPanel.style.display = 'flex';
  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div style="flex:1">
        <div class="cart-item-name">${item.product_name}</div>
        <div class="cart-item-price">${fmt(item.price)} c/u</div>
      </div>
      <div class="qty-controls">
        <button class="qty-btn" onclick="changeQty(${item.product_id}, -1)">−</button>
        <span class="qty-val">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty(${item.product_id}, 1)">+</button>
      </div>
      <div class="cart-item-sub">${fmt(item.price * item.quantity)}</div>
      <button class="cart-remove" onclick="removeFromCart(${item.product_id})">×</button>
    </div>
  `).join('');
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  document.getElementById('cart-total').textContent = fmt(total);
  if (document.getElementById('modal-cobro')?.classList.contains('open')) calcCobroChange();
}

// ─── MODAL DE COBRO ──────────────────────────────────
function openCobroModal() {
  if (!cart.length) { toast('Agrega productos al carrito', 'error'); return; }
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  // Resetear estado
  document.getElementById('cobro-total-display').textContent = fmt(total);
  document.getElementById('cobro-recibido').value = '';
  document.getElementById('cobro-change-amount').textContent = fmt(0);
  document.getElementById('cobro-change-box').style.opacity = '0.4';
  document.getElementById('cobro-notes').value = document.getElementById('sale-notes')?.value || '';
  document.getElementById('cobro-efectivo-section').style.display = 'block';
  // Resetear botón confirmar (puede quedar en "Procesando..." de la venta anterior)
  const btnConfirm = document.getElementById('cobro-confirm-btn');
  btnConfirm.disabled = false;
  btnConfirm.textContent = '✓ Confirmar cobro';

  // Seleccionar efectivo por defecto
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.pay-method-btn[data-method="efectivo"]').classList.add('active');

  // Botones de monto rápido
  const quickAmounts = calcQuickAmounts(total);
  document.getElementById('cobro-quick-btns').innerHTML = quickAmounts.map(a =>
    `<button class="cobro-quick-btn" onclick="setCobroAmount(${a})">${fmt(a)}</button>`
  ).join('');

  openModal('modal-cobro');
  setTimeout(() => document.getElementById('cobro-recibido').focus(), 100);
}

function calcQuickAmounts(total) {
  return [5000, 10000, 20000, 50000, 100000];
}

function setCobroAmount(amount) {
  document.getElementById('cobro-recibido').value = amount;
  calcCobroChange();
}

function selectPayMethod(btn) {
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const isEfectivo = btn.dataset.method === 'efectivo';
  document.getElementById('cobro-efectivo-section').style.display = isEfectivo ? 'block' : 'none';
}

function calcCobroChange() {
  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const received = parseFloat(document.getElementById('cobro-recibido').value) || 0;
  const change = received - total;
  const box = document.getElementById('cobro-change-box');
  document.getElementById('cobro-change-amount').textContent = fmt(Math.max(0, change));
  box.style.opacity = received > 0 ? '1' : '0.4';
  box.style.background = change < 0 ? '#fee2e2' : '#dcfce7';
  document.getElementById('cobro-change-amount').style.color = change < 0 ? '#dc2626' : '#16a34a';
}

async function confirmCobro() {
  const activeMethod = document.querySelector('.pay-method-btn.active');
  const payment_method = activeMethod ? activeMethod.dataset.method : 'efectivo';
  const notes = document.getElementById('cobro-notes').value;

  if (payment_method === 'efectivo') {
    const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
    const received = parseFloat(document.getElementById('cobro-recibido').value) || 0;
    if (received > 0 && received < total) {
      toast('El monto recibido es menor al total', 'error'); return;
    }
  }

  try {
    const btn = document.getElementById('cobro-confirm-btn');
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    // Capturar consumo y salsas antes de limpiar carrito
    const consumoLabels = { aqui:'Para consumir aquí', frente:'Al frente', llevar:'Para llevar' };
    const _consumo = consumoLabels[window._consumoTipo] || 'Para consumir aquí';
    const salsaLabels = { rosada:'Rosada', aji:'Ají', tartara:'Tártara', roja:'Roja' };
    const _salsas = Object.entries(window._salsas||{}).filter(([,q])=>q>0).map(([k,q])=>`${salsaLabels[k]} x${q}`).join(', ');
    const _clienteNombre = document.getElementById('tab-cliente')?.querySelector('input')?.value.trim() || '';
    const _cartSnapshot = [...cart];

    const sale = await api('POST', '/api/sales', { items: cart, payment_method, notes });
    currentSaleForPrint = sale;
    closeModal('modal-cobro');
    toast(`Venta #${sale.id} registrada ✓`, 'success');
    clearCart();
    allProducts = await api('GET', '/api/products');
    renderProducts();
  } catch (e) {
    toast(e.message, 'error');
    const btn = document.getElementById('cobro-confirm-btn');
    btn.disabled = false;
    btn.textContent = '✓ Confirmar cobro';
  }
}

// ═══════════════════════════════════════════════════════
//  VENTAS
// ═══════════════════════════════════════════════════════
async function loadSales() {
  const from = document.getElementById('sales-from').value;
  const to = document.getElementById('sales-to').value;
  try {
    let url = '/api/sales';
    if (from && to) url += `?from=${from}&to=${to}`;
    const sales = await api('GET', url);
    const tbody = document.querySelector('#sales-table tbody');
    if (!sales.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state" style="padding:24px;text-align:center">Sin ventas en este período</td></tr>';
      return;
    }
    tbody.innerHTML = sales.map(s => `
      <tr>
        <td><strong>#${s.id}</strong></td>
        <td>${fmtDate(s.created_at)}</td>
        <td><strong>${fmt(s.total)}</strong></td>
        <td><span class="badge badge-blue">${s.payment_method}</span></td>
        <td>${s.notes || '—'}</td>
        <td style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="viewSale(${s.id})">Ver</button>
          <button class="btn btn-outline btn-sm" style="color:#dc2626;border-color:#dc2626" onclick="openReturnModal(${s.id})">↩ Devolver</button>
        </td>
      </tr>
    `).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function viewSale(id) {
  try {
    const sale = await api('GET', `/api/sales/${id}`);
    currentSaleForPrint = sale;
    showSaleReceipt(sale, true);
  } catch (e) { toast(e.message, 'error'); }
}

function showSaleReceipt(sale, fromHistory = false) {
  document.getElementById('modal-sale-title').textContent = `Venta #${sale.id}`;
  const body = document.getElementById('modal-sale-body');
  body.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:#64748b">Fecha:</span><strong>${fmtDate(sale.created_at)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="color:#64748b">Método:</span><span class="badge badge-blue">${sale.payment_method}</span>
      </div>
      ${sale.notes ? `<div style="display:flex;justify-content:space-between"><span style="color:#64748b">Notas:</span><em>${sale.notes}</em></div>` : ''}
    </div>
    <table class="data-table">
      <thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${sale.items.map(i => `
          <tr>
            <td>${i.product_name}</td>
            <td>${i.quantity}</td>
            <td>${fmt(i.price)}</td>
            <td>${fmt(i.subtotal)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div style="text-align:right;margin-top:14px;font-size:18px;font-weight:700">
      Total: ${fmt(sale.total)}
    </div>
  `;
  openModal('modal-sale-detail');
}

function openFacturaModal() {
  if (!cart.length) { toast('Agrega productos primero', 'error'); return; }
  const now = new Date();
  const fechaStr = now.toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' });
  const horaStr  = now.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  const folio    = 'F-' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') + '-' + String(Math.floor(Math.random()*9000)+1000);
  const nombre   = document.getElementById('tab-cliente')?.querySelector('input')?.value.trim() || '';
  const consumoLabels = { aqui: 'Para consumir aquí', frente: 'Al frente', llevar: 'Para llevar' };
  const consumo  = consumoLabels[window._consumoTipo] || 'Para consumir aquí';
  const salsaLabels = { rosada:'Rosada', aji:'Ají', tartara:'Tártara', roja:'Roja' };
  const salsasStr = Object.entries(window._salsas||{}).filter(([,q])=>q>0).map(([k,q])=>`${salsaLabels[k]} x${q}`).join(', ');
  const total    = cart.reduce((s,i) => s + i.price * i.quantity, 0);

  const itemsRows = cart.map((i,idx) => `
    <tr>
      <td>${idx+1}</td>
      <td>${i.product_name}</td>
      <td>${i.quantity}</td>
      <td>${fmt(i.price)}</td>
      <td>${fmt(i.price * i.quantity)}</td>
    </tr>`).join('');

  const extrasHTML = (consumo || salsasStr) ? `
    <div class="factura-extras">
      <label>Detalles del pedido</label>
      ${consumo ? `<div>🍽 ${consumo}</div>` : ''}
      ${salsasStr ? `<div>🫙 Salsas: ${salsasStr}</div>` : ''}
    </div>` : '';

  document.getElementById('modal-factura-body').innerHTML = `
    <div class="factura" id="factura-preview">
      <div class="factura-header">
        <div>
          <div class="factura-brand-name">Delicias del Rey</div>
          <div class="factura-brand-sub">Cafetería · Punto de Venta</div>
        </div>
        <div class="factura-meta">
          <div class="factura-title">Factura</div>
          <div class="factura-num">${folio}</div>
          <div class="factura-date">${fechaStr} &nbsp;·&nbsp; ${horaStr}</div>
        </div>
      </div>

      <div class="factura-info">
        <div class="factura-info-block">
          <label>Cliente</label>
          <div>${nombre || 'Consumidor Final'}</div>
        </div>
        <div class="factura-info-block" style="text-align:right">
          <label>Forma de consumo</label>
          <div>${consumo}</div>
        </div>
      </div>

      <table class="factura-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Descripción</th>
            <th>Cant.</th>
            <th>P. Unit.</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>

      ${extrasHTML}

      <div class="factura-totals">
        <div class="factura-totals-box">
          <div class="factura-totals-row total">
            <span>TOTAL</span>
            <span>${fmt(total)}</span>
          </div>
        </div>
      </div>

      <div class="factura-footer">
        <strong>¡Gracias por su preferencia!</strong>
        Delicias del Rey · ${fechaStr}
      </div>
    </div>`;

  openModal('modal-factura');
}

function imprimirFactura() {
  const content = document.getElementById('factura-preview');
  if (!content) return;
  document.getElementById('ticket-content').innerHTML = content.outerHTML;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

function imprimirTicketTermico(sale, items, consumo, salsas, cliente, payMethod) {
  const now = new Date(sale.created_at || Date.now());
  const fecha = now.toLocaleDateString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric' });
  const hora  = now.toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
  const negocio = settings?.negocio_nombre || 'Delicias del Rey';
  const linea = '--------------------------------';
  const total = items.reduce((s,i) => s + i.price * i.quantity, 0);

  const itemsHtml = items.map(i => `
    <tr>
      <td style="padding:2px 0">${i.product_name}</td>
      <td style="text-align:right;white-space:nowrap;padding:2px 0">${i.quantity} x ${fmt(i.price)}</td>
    </tr>
    <tr>
      <td colspan="2" style="text-align:right;padding:0 0 4px">${fmt(i.price * i.quantity)}</td>
    </tr>`).join('');

  document.getElementById('ticket-content').innerHTML = `
    <div class="t80">
      <div class="t80-header">
        <div class="t80-logo">${negocio}</div>
        <div class="t80-sub">Cafetería · Punto de Venta</div>
        <div class="t80-sep">${linea}</div>
        <div>Ticket #${sale.id}</div>
        <div>${fecha} &nbsp; ${hora}</div>
        ${cliente ? `<div>Cliente: ${cliente}</div>` : ''}
      </div>
      <div class="t80-sep">${linea}</div>
      <table class="t80-items">${itemsHtml}</table>
      <div class="t80-sep">${linea}</div>
      <table class="t80-total">
        <tr><td><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(total)}</b></td></tr>
        <tr><td>Pago</td><td style="text-align:right">${payMethod}</td></tr>
      </table>
      ${consumo || salsas ? `
      <div class="t80-sep">${linea}</div>
      ${consumo ? `<div>${consumo}</div>` : ''}
      ${salsas ? `<div>Salsas: ${salsas}</div>` : ''}` : ''}
      <div class="t80-sep">${linea}</div>
      <div class="t80-footer">¡Gracias por su preferencia!</div>
    </div>`;

  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

function printReceipt() {
  const sale = currentSaleForPrint;
  if (!sale) return;
  imprimirTicketTermico(sale, sale.items, '', '', '', sale.payment_method);
}

// ═══════════════════════════════════════════════════════
//  MOVIMIENTOS DE CAJA
// ═══════════════════════════════════════════════════════
async function loadMovements() {
  const from = document.getElementById('mov-from').value;
  const to = document.getElementById('mov-to').value;
  try {
    let url = '/api/movements';
    if (from && to) url += `?from=${from}&to=${to}`;
    const movs = await api('GET', url);

    // Movimientos manuales: egresos + ingresos (excluye ingresos automáticos de ventas y cierres)
    const manuales = movs.filter(m =>
      m.type === 'egreso' || (m.type === 'ingreso' && !m.description.startsWith('Venta #'))
    );
    const totalOut = manuales.filter(m => m.type === 'egreso').reduce((s, m) => s + m.amount, 0);
    const totalIn  = manuales.filter(m => m.type === 'ingreso').reduce((s, m) => s + m.amount, 0);
    document.getElementById('mov-total-out').textContent = fmt(totalOut);
    document.getElementById('mov-total-in').textContent  = fmt(totalIn);

    const tbody = document.querySelector('#movements-table tbody');
    if (!manuales.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Sin movimientos en este período</td></tr>';
      return;
    }
    tbody.innerHTML = manuales.map(m => {
      const isIngreso = m.type === 'ingreso';
      return `<tr>
        <td>${fmtDate(m.created_at)}</td>
        <td><span class="badge ${isIngreso ? 'badge-success' : 'badge-danger'}">${isIngreso ? 'ingreso' : 'egreso'}</span></td>
        <td>${m.description}</td>
        <td><span class="badge badge-blue">${m.category}</span></td>
        <td><strong style="color:${isIngreso ? '#16a34a' : '#dc2626'}">${isIngreso ? '+' : '-'}${fmt(m.amount)}</strong></td>
        <td><button class="btn-icon" title="Eliminar" onclick="deleteMovement(${m.id})">🗑️</button></td>
      </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function openMovModal(tipo) {
  const t = tipo || 'egreso';
  document.getElementById('mov-type').value = t;
  document.getElementById('mov-amount').value = '';
  document.getElementById('mov-desc').value = '';
  document.getElementById('mov-cat').value = '';
  // Cambiar título del modal según tipo
  const title = document.querySelector('#modal-movement .modal-header h3');
  if (title) title.textContent = t === 'ingreso' ? 'Ingreso manual' : 'Egreso';
  openModal('modal-movement');
}

async function saveMovement() {
  const type = document.getElementById('mov-type').value;
  const amount = parseFloat(document.getElementById('mov-amount').value);
  const description = document.getElementById('mov-desc').value.trim();
  const category = document.getElementById('mov-cat').value.trim() || 'General';
  if (!description || !amount || amount <= 0) { toast('Completa todos los campos', 'error'); return; }
  try {
    await api('POST', '/api/movements', { type, amount, description, category });
    closeModal('modal-movement');
    toast('Movimiento registrado', 'success');
    loadMovements();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteMovement(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  try {
    await api('DELETE', `/api/movements/${id}`);
    toast('Movimiento eliminado');
    loadMovements();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  INVENTARIO
// ═══════════════════════════════════════════════════════
async function loadInventory() {
  try {
    const products = await api('GET', '/api/products');
    const tbody = document.querySelector('#inventory-table tbody');
    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state" style="padding:24px;text-align:center">Sin productos</td></tr>';
      return;
    }
    tbody.innerHTML = products.map(p => {
      const stockStatus = p.infinite_stock ? 'badge-success' : p.stock === 0 ? 'badge-danger' : p.stock <= p.low_stock_alert ? 'badge-warning' : 'badge-success';
      const stockLabel  = p.infinite_stock ? '∞ Infinito' : p.stock === 0 ? 'Sin stock' : p.stock <= p.low_stock_alert ? 'Stock bajo' : 'OK';
      const thumb = p.image
        ? `<img src="/uploads/products/${p.image}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;margin-right:8px;vertical-align:middle"/>`
        : `<span style="display:inline-block;width:36px;height:36px;background:#f1f5f9;border-radius:6px;margin-right:8px;vertical-align:middle;text-align:center;line-height:36px;font-size:18px">${getCatEmoji(p.category)}</span>`;
      const margen = p.cost > 0 ? Math.round((p.price - p.cost) / p.price * 100) : null;
      const margenHtml = margen !== null
        ? `<span style="color:${margen >= 30 ? '#16a34a' : margen >= 10 ? '#d97706' : '#dc2626'};font-weight:700">${margen}%</span>`
        : '<span style="color:#94a3b8">—</span>';
      return `
        <tr>
          <td style="display:flex;align-items:center">${thumb}<strong>${p.name}</strong></td>
          <td>${p.category}</td>
          <td>${fmt(p.price)}</td>
          <td>${p.cost > 0 ? fmt(p.cost) : '<span style="color:#94a3b8">—</span>'}</td>
          <td>${margenHtml}</td>
          <td>${p.stock} ${p.unit}</td>
          <td><span class="badge ${stockStatus}">${stockLabel}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})">Editar</button>
            <button class="btn-icon" onclick="deleteProduct(${p.id})" title="Eliminar">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function toggleInfiniteStock(checkbox) {
  document.getElementById('prod-stock-section').style.display = checkbox.checked ? 'none' : '';
}

function openProductModal(product = null) {
  document.getElementById('modal-product-title').textContent = product ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('prod-id').value = product?.id || '';
  document.getElementById('prod-name').value = product?.name || '';
  document.getElementById('prod-category').value = product?.category || '';
  document.getElementById('prod-unit').value = product?.unit || 'unidad';
  document.getElementById('prod-price').value   = product?.price || '';
  document.getElementById('prod-cost').value    = product?.cost  || '';
  const isInfinite = !!product?.infinite_stock;
  document.getElementById('prod-infinite').checked = isInfinite;
  document.getElementById('prod-stock-section').style.display = isInfinite ? 'none' : '';
  document.getElementById('prod-stock').value = product?.stock ?? '';
  document.getElementById('prod-alert').value = product?.low_stock_alert || 5;
  // Imagen
  document.getElementById('prod-image-file').value = '';
  const preview = document.getElementById('prod-img-preview');
  const placeholder = document.getElementById('prod-img-placeholder');
  if (product?.image) {
    preview.src = `/uploads/products/${product.image}?t=${Date.now()}`;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } else {
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
  }
  openModal('modal-product');
}

function previewProductImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('prod-img-preview');
    preview.src = e.target.result;
    preview.style.display = 'block';
    document.getElementById('prod-img-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function editProduct(id) {
  try {
    const products = await api('GET', '/api/products');
    const p = products.find(x => x.id === id);
    if (p) openProductModal(p);
  } catch (e) { toast(e.message, 'error'); }
}

async function saveProduct() {
  const id = document.getElementById('prod-id').value;
  const name = document.getElementById('prod-name').value.trim();
  const category = document.getElementById('prod-category').value.trim() || 'General';
  const unit = document.getElementById('prod-unit').value.trim() || 'unidad';
  const price = parseFloat(document.getElementById('prod-price').value);
  const cost  = parseFloat(document.getElementById('prod-cost').value)  || 0;
  const infinite_stock = document.getElementById('prod-infinite').checked;
  const stock = infinite_stock ? 0 : (parseFloat(document.getElementById('prod-stock').value) || 0);
  const low_stock_alert = parseFloat(document.getElementById('prod-alert').value) || 5;
  if (!name || !price || price <= 0) { toast('Nombre y precio de venta son requeridos', 'error'); return; }
  try {
    let saved;
    if (id) {
      saved = await api('PUT', `/api/products/${id}`, { name, category, price, cost, stock, unit, low_stock_alert, infinite_stock });
      toast('Producto actualizado', 'success');
    } else {
      saved = await api('POST', '/api/products', { name, category, price, cost, stock, unit, low_stock_alert, infinite_stock });
      toast('Producto creado', 'success');
    }
    // Subir imagen si se seleccionó una
    const fileInput = document.getElementById('prod-image-file');
    if (fileInput.files[0]) {
      const formData = new FormData();
      formData.append('image', fileInput.files[0]);
      await fetch(`/api/products/${saved.id}/image`, { method: 'POST', body: formData });
    }
    closeModal('modal-product');
    loadInventory();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try {
    await api('DELETE', `/api/products/${id}`);
    toast('Producto eliminado');
    loadInventory();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  COMANDAS
// ═══════════════════════════════════════════════════════
let currentComandaForPrint = null;
let comandasVisible = false;

function toggleComandasPanel() {
  comandasVisible = !comandasVisible;
  document.getElementById('view-products').style.display = comandasVisible ? 'none' : 'flex';
  document.getElementById('view-comandas').style.display = comandasVisible ? 'flex' : 'none';
  document.getElementById('btn-toggle-comandas').style.background = comandasVisible ? '#f59e0b' : '#141414';
  if (comandasVisible) loadComandas();
}

async function createComanda() {
  if (!cart.length) { toast('Agrega productos primero', 'error'); return; }
  const customer_name = document.getElementById('tab-cliente').querySelector('input').value.trim();
  const userNotes = document.getElementById('sale-notes').value.trim();

  // Consumo
  const consumoLabels = { aqui: 'Para consumir aquí', frente: 'Al frente', llevar: 'Para llevar' };
  const consumoText = consumoLabels[window._consumoTipo] || '';

  // Salsas
  const salsaLabels = { rosada: 'Rosada', aji: 'Ají', tartara: 'Tártara', roja: 'Roja' };
  const salsasTexto = Object.entries(window._salsas || {})
    .filter(([, qty]) => qty > 0)
    .map(([k, qty]) => `${salsaLabels[k]} x${qty}`)
    .join(', ');

  const extraLines = [consumoText, salsasTexto ? `Salsas: ${salsasTexto}` : '', userNotes].filter(Boolean).join(' | ');
  const notes = extraLines;

  try {
    const comanda = await api('POST', '/api/comandas', {
      items: cart.map(i => ({ product_name: i.product_name, quantity: i.quantity })),
      customer_name,
      notes,
    });
    currentComandaForPrint = comanda;
    toast(`Comanda #${comanda.id} enviada a cocina`, 'success');
    showComandaModal(comanda);
    updateComandaBadge();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadComandas() {
  try {
    const comandas = await api('GET', '/api/comandas?status=pendiente');
    const listos = await api('GET', '/api/comandas?status=listo');
    const all = [...comandas, ...listos];
    updateComandaBadge(all.length);
    const grid = document.getElementById('comandas-grid');
    if (!all.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">✅</div>Sin comandas activas</div>';
      return;
    }
    grid.innerHTML = all.map(c => renderComandaCard(c)).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function renderComandaCard(c) {
  const time = new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const statusLabel = { pendiente: '🟡 Pendiente', listo: '🟢 Listo', entregado: '✔ Entregado', cancelado: '❌ Cancelado' };
  return `
    <div class="comanda-card ${c.status}" id="comanda-${c.id}">
      <div class="comanda-card-header">
        <span class="comanda-num">Comanda #${c.id}</span>
        <span class="comanda-time">${time}</span>
      </div>
      ${c.customer_name ? `<div class="comanda-customer">👤 ${c.customer_name}</div>` : ''}
      <div class="comanda-items">
        ${c.items.map(i => `<div><strong>${i.quantity}x</strong> ${i.product_name}</div>`).join('')}
      </div>
      ${c.notes ? c.notes.split(' | ').map(line => `<div class="comanda-notes">📌 ${line}</div>`).join('') : ''}
      <div class="comanda-actions">
        ${c.status === 'pendiente' ? `<button class="comanda-status-btn" onclick="setComandaStatus(${c.id},'listo')">✅ Listo</button>` : ''}
        ${c.status === 'listo' ? `<button class="comanda-status-btn active" onclick="setComandaStatus(${c.id},'entregado')">🛎 Entregar</button>` : ''}
        <button class="comanda-status-btn" onclick="viewComanda(${c.id})">🖨</button>
        ${c.status !== 'cancelado' ? `<button class="comanda-status-btn" style="color:var(--danger)" onclick="setComandaStatus(${c.id},'cancelado')">✕</button>` : ''}
      </div>
    </div>`;
}

async function setComandaStatus(id, status) {
  try {
    await api('PUT', `/api/comandas/${id}/status`, { status });
    loadComandas();
    toast(status === 'listo' ? 'Marcado como listo' : status === 'entregado' ? 'Entregado' : 'Cancelado', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function viewComanda(id) {
  try {
    const comandas = await api('GET', '/api/comandas');
    const c = comandas.find(x => x.id === id);
    if (c) { currentComandaForPrint = c; showComandaModal(c); }
  } catch (e) { toast(e.message, 'error'); }
}

function showComandaModal(c) {
  document.getElementById('modal-comanda-title').textContent = `Comanda #${c.id}`;
  const time = new Date(c.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  document.getElementById('modal-comanda-body').innerHTML = `
    <div class="comanda-ticket">
      <div class="comanda-ticket-header">
        <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px">COCINA</div>
        <div class="comanda-ticket-num">#${c.id}</div>
        <div style="font-size:12px;color:#666">${time}</div>
        ${c.customer_name ? `<div style="font-weight:700;margin-top:4px">👤 ${c.customer_name}</div>` : ''}
      </div>
      <table class="comanda-ticket-items">
        ${c.items.map(i => `
          <tr>
            <td class="qty">${i.quantity}</td>
            <td>${i.product_name}</td>
          </tr>`).join('')}
      </table>
      ${c.notes ? `<div class="comanda-ticket-notes">📝 ${c.notes}</div>` : ''}
    </div>`;
  openModal('modal-comanda');
}

function printComanda() {
  const c = currentComandaForPrint;
  if (!c) return;
  const time = new Date(c.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  document.getElementById('ticket-content').innerHTML = `
    <div class="ticket-header">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px">★ COMANDA DE COCINA ★</div>
      <div style="font-size:28px;font-weight:900">#${c.id}</div>
      <div>${time}</div>
      ${c.customer_name ? `<div style="font-weight:bold">${c.customer_name}</div>` : ''}
      <div>────────────────</div>
    </div>
    <table class="ticket-items" style="font-size:14px">
      ${c.items.map(i => `<tr><td style="font-size:20px;font-weight:900;padding-right:8px">${i.quantity}x</td><td>${i.product_name}</td></tr>`).join('')}
    </table>
    ${c.notes ? `<div style="margin-top:10px;padding:6px;border:2px dashed #000"><strong>NOTA:</strong> ${c.notes}</div>` : ''}
  `;
  document.getElementById('print-area').style.display = 'block';
  window.print();
  document.getElementById('print-area').style.display = 'none';
}

async function updateComandaBadge(count = null) {
  if (count === null) {
    try {
      const [p, l] = await Promise.all([
        api('GET', '/api/comandas?status=pendiente'),
        api('GET', '/api/comandas?status=listo'),
      ]);
      count = p.length + l.length;
    } catch { count = 0; }
  }
  const badge = document.getElementById('comanda-badge');
  if (badge) badge.textContent = count;
}

// ═══════════════════════════════════════════════════════
//  CIERRES DE CAJA
// ═══════════════════════════════════════════════════════
let currentRegister = null;

async function loadRegisterStatus() {
  try {
    const reg = await api('GET', '/api/registers/current');
    currentRegister = reg;
    renderRegisterBanner(reg);
  } catch { renderRegisterBanner(null); }
}

function renderRegisterBanner(reg) {
  const banner = document.getElementById('register-banner');
  if (!banner) return;
  if (!reg) {
    banner.className = 'register-banner sin-caja';
    banner.innerHTML = `
      <span>⚠️ No hay caja abierta</span>
      <div class="register-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="openModal('modal-apertura')">Abrir caja</button>
      </div>`;
  } else {
    const desde = new Date(reg.opened_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
    banner.className = 'register-banner abierta';
    banner.innerHTML = `
      <span>✅ Caja abierta desde ${desde} — Fondo inicial: ${fmt(reg.opening_balance)}</span>
      <div class="register-banner-actions">
        <button class="btn btn-outline btn-sm" onclick="openModal('modal-apertura')" style="display:none">Abrir</button>
        <button class="btn btn-danger btn-sm" onclick="prepararCierre()">Cerrar caja</button>
      </div>`;
  }
}

async function confirmarApertura() {
  const opening_balance = parseFloat(document.getElementById('apertura-fondo').value) || 0;
  const userNotes = document.getElementById('apertura-notes').value.trim();
  const turnoLabel = _turno === 'tarde' ? 'Turno tarde 🌙' : 'Turno mañana ☀️';
  const notes = [turnoLabel, userNotes].filter(Boolean).join(' — ');
  try {
    const reg = await api('POST', '/api/registers', { opening_balance, notes });
    currentRegister = reg;
    closeModal('modal-apertura');
    toast(`Caja abierta · ${turnoLabel}`, 'success');
    renderRegisterBanner(reg);
    setPOSLock(false);
  } catch (e) { toast(e.message, 'error'); }
}

var _cierreSummary = null;

async function prepararCierre() {
  if (!currentRegister) { toast('No hay caja abierta', 'error'); return; }
  try {
    const summary = await api('GET', '/api/registers/current/summary');
    _cierreSummary = summary;
    renderCierreModal(summary);
    openModal('modal-cierre');
    setTimeout(() => {
      const inp = document.getElementById('cierre-contado');
      if (inp) inp.focus();
    }, 120);
  } catch (e) { toast(e.message, 'error'); }
}

function renderCierreModal(s) {
  const desde = new Date(s.opened_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
  document.getElementById('cierre-turno').textContent = 'Turno desde: ' + desde;
  document.getElementById('cierre-header-totals').innerHTML =
    `${s.total_orders} pedido${s.total_orders !== 1 ? 's' : ''}: <span style="color:var(--primary)">${fmt(s.total_amount)}</span>`;

  const sbm = s.sales_by_method || {};
  const cashData  = sbm['efectivo']      || { total: 0, count: 0 };
  const cardData  = sbm['tarjeta']       || { total: 0, count: 0 };
  const transData = sbm['transferencia'] || { total: 0, count: 0 };

  const expectedEfectivo = s.opening_balance + cashData.total + s.manual_in - s.manual_out;

  // key: payment method slug, used for input/diff IDs
  function metodoPagoSection(icon, title, expected, showCount, methodKey) {
    const isEfectivo = methodKey === 'efectivo';
    const inputId  = `cierre-contado-${methodKey}`;
    const diffId   = `cierre-diff-val-${methodKey}`;
    const pagosLabel = showCount ? `Pagos (${showCount})` : 'Pagos';
    const contadorBtn = isEfectivo
      ? `<button class="btn-contador" onclick="abrirContadorBilletes()" title="Contar billetes">🧮</button>`
      : '';

    return `
      <div class="cierre-metodo-section">
        <div class="cierre-metodo-header">
          <span>${icon} ${title}</span>
          <strong>${fmt(expected)}</strong>
        </div>
        ${isEfectivo ? `
        <div class="cierre-metodo-row">
          <span class="cierre-metodo-label">Apertura</span>
          <span>${fmt(s.opening_balance)}</span>
        </div>` : ''}
        <div class="cierre-metodo-row">
          <span class="cierre-metodo-label">${pagosLabel}</span>
          <span>+${fmt(isEfectivo ? cashData.total : expected)}</span>
        </div>
        ${isEfectivo && (s.manual_in > 0 || s.manual_out > 0) ? `
        <div class="cierre-metodo-row">
          <span class="cierre-metodo-label">Entrada y salida de efectivo</span>
          <span>${s.manual_in - s.manual_out >= 0 ? '+' : ''}${fmt(s.manual_in - s.manual_out)}</span>
        </div>` : ''}
        <div class="cierre-metodo-row contado-row">
          <span class="cierre-metodo-label">Contado</span>
          <div class="contado-input-group" style="width:260px">
            <input type="number" id="${inputId}" class="input" placeholder="$0.00" step="0.01"
              style="font-size:16px;font-weight:700;text-align:right;padding:8px 12px"
              oninput="updateDiffLive('${methodKey}', ${expected})"/>
            ${contadorBtn}
          </div>
        </div>
        <div class="cierre-metodo-row diferencia-row">
          <span class="cierre-metodo-label diferencia-label">Diferencia</span>
          <strong id="${diffId}" class="diferencia-val">—</strong>
        </div>
      </div>`;
  }

  document.getElementById('modal-cierre-body').innerHTML =
    metodoPagoSection('💵', 'EFECTIVO', expectedEfectivo, cashData.count, 'efectivo') +
    (cardData.total > 0 ? metodoPagoSection('💳', 'DATAFONO / TARJETA', cardData.total, cardData.count, 'tarjeta') : '') +
    (transData.total > 0 ? metodoPagoSection('📲', 'TRANSFERENCIAS', transData.total, transData.count, 'transferencia') : '');
}

function updateDiffLive(methodKey, expected) {
  const inputId = `cierre-contado-${methodKey}`;
  const diffId  = `cierre-diff-val-${methodKey}`;
  const contado = parseFloat(document.getElementById(inputId)?.value) || 0;
  const diff = contado - expected;
  const el = document.getElementById(diffId);
  if (el) {
    el.textContent = (diff >= 0 ? '+' : '') + fmt(diff);
    el.className = 'diferencia-val ' + (diff === 0 ? 'diff-cero' : diff > 0 ? 'diff-pos' : 'diff-neg');
  }
}

async function confirmarCierre() {
  if (!currentRegister) return;
  const counted_cash = parseFloat(document.getElementById('cierre-contado-efectivo')?.value) || 0;
  const notes = document.getElementById('cierre-notes').value.trim();
  const btn = document.getElementById('btn-confirmar-cierre');
  btn.disabled = true;
  btn.textContent = 'Cerrando...';
  try {
    const result = await api('PUT', `/api/registers/${currentRegister.id}/close`, { counted_cash, notes });
    closeModal('modal-cierre');
    currentRegister = null;
    renderRegisterBanner(null);
    toast('Caja cerrada — Punto de venta bloqueado', 'success');
    setPOSLock(true);
    showCierreReport(result);
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Cerrar caja';
  }
}

function showCierreReport(reg) {
  const opened = new Date(reg.opened_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
  const closed = new Date(reg.closed_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
  const diff = reg.difference;
  const diffClass = diff >= 0 ? 'diff-pos' : 'diff-neg';
  const diffSign = diff >= 0 ? '+' : '';

  const sbm = reg.sales_by_method || {};
  const cashSales   = sbm['efectivo']      || 0;
  const cardSales   = sbm['tarjeta']       || 0;
  const transSales  = sbm['transferencia'] || 0;

  // Efectivo esperado = fondo + ventas_efectivo + ingresos_manuales - egresos
  const expectedEfectivo = reg.opening_balance + cashSales + (reg.total_in || 0) - (reg.total_out || 0);

  const metodosHTML = `
    <div style="margin-top:14px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px">Desglose por método de pago</div>
      <table class="cierre-metodos-table">
        <thead>
          <tr>
            <th>Método</th>
            <th>Esperado</th>
            <th>Contado</th>
            <th>Diferencia</th>
          </tr>
        </thead>
        <tbody>
          <tr class="metodo-efectivo">
            <td>💵 Efectivo</td>
            <td>${fmt(expectedEfectivo)}</td>
            <td>${fmt(reg.counted_cash)}</td>
            <td class="${diff >= 0 ? 'diff-pos' : 'diff-neg'}">${diffSign}${fmt(diff)}</td>
          </tr>
          ${cardSales > 0 ? `<tr>
            <td>💳 Tarjeta</td>
            <td>${fmt(cardSales)}</td>
            <td>${fmt(cardSales)}</td>
            <td class="diff-pos">+${fmt(0)}</td>
          </tr>` : ''}
          ${transSales > 0 ? `<tr>
            <td>📲 Transferencia</td>
            <td>${fmt(transSales)}</td>
            <td>${fmt(transSales)}</td>
            <td class="diff-pos">+${fmt(0)}</td>
          </tr>` : ''}
        </tbody>
      </table>
    </div>`;

  document.getElementById('modal-historial-body').innerHTML = `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted);margin-bottom:4px">
        <span>Apertura: ${opened}</span><span>Cierre: ${closed}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <div class="cierre-row"><span>Fondo inicial</span><strong>${fmt(reg.opening_balance)}</strong></div>
      <div class="cierre-row"><span>Total ventas</span><strong>${fmt(reg.total_sales)}</strong></div>
      <div class="cierre-row"><span>Ingresos manuales</span><strong>+${fmt(reg.total_in || 0)}</strong></div>
      <div class="cierre-row"><span>Egresos</span><strong>-${fmt(reg.total_out || 0)}</strong></div>
      <hr class="cierre-divider"/>
      <div class="cierre-row total"><span>Efectivo esperado</span><strong>${fmt(reg.expected_cash)}</strong></div>
      <div class="cierre-row total"><span>Efectivo contado</span><strong>${fmt(reg.counted_cash)}</strong></div>
      <div class="cierre-row ${diffClass}"><span>Diferencia efectivo</span><strong>${diffSign}${fmt(diff)}</strong></div>
    </div>
    ${metodosHTML}
    ${reg.notes ? `<div style="margin-top:12px;padding:8px 12px;background:#f8fafc;border-radius:8px;font-size:13px">📝 ${reg.notes}</div>` : ''}
  `;
  openModal('modal-historial-cierres');
}

function switchCajaTab(tab) {
  document.getElementById('caja-panel-egresos').style.display  = tab === 'egresos'  ? '' : 'none';
  document.getElementById('caja-panel-cierres').style.display  = tab === 'cierres'  ? '' : 'none';
  document.getElementById('tab-egresos').classList.toggle('active', tab === 'egresos');
  document.getElementById('tab-cierres').classList.toggle('active', tab === 'cierres');
  document.getElementById('btn-nuevo-egreso').style.display  = tab === 'egresos' ? '' : 'none';
  document.getElementById('btn-nuevo-ingreso').style.display = tab === 'egresos' ? '' : 'none';
  if (tab === 'cierres') loadCierres();
}

var _cierresData = [];

async function loadCierres() {
  try {
    _cierresData = await api('GET', '/api/registers');
    const tbody = document.querySelector('#cierres-table tbody');
    if (!_cierresData.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Sin cierres registrados</td></tr>';
      return;
    }
    tbody.innerHTML = _cierresData.map((reg, i) => {
      const opened = new Date(reg.opened_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
      const closed = reg.closed_at
        ? new Date(reg.closed_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' })
        : '—';
      const statusBadge = reg.status === 'abierta'
        ? '<span class="badge badge-success">Abierta</span>'
        : '<span class="badge" style="background:#f1f5f9;color:#64748b">Cerrada</span>';
      const diff = reg.difference;
      const diffStr = diff != null
        ? `<span style="color:${diff >= 0 ? '#16a34a' : '#dc2626'};font-weight:700">${diff >= 0 ? '+' : ''}${fmt(diff)}</span>`
        : '—';
      return `<tr class="cierre-row-clickable" onclick="verDetalleCierre(${i})" title="Ver detalle">
        <td>${opened} ${statusBadge}</td>
        <td>${closed}</td>
        <td>${fmt(reg.total_sales)}</td>
        <td>${reg.counted_cash != null ? fmt(reg.counted_cash) : '—'}</td>
        <td>${diffStr}</td>
      </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function verDetalleCierre(i) {
  showCierreReport(_cierresData[i]);
}

// ═══════════════════════════════════════════════════════
//  CONTADOR DE BILLETES
// ═══════════════════════════════════════════════════════

const BILLETES = [
  { valor: 200000, emoji: '💵', color: '#e8f5e9' },
  { valor: 100000, emoji: '💵', color: '#fff3e0' },
  { valor:  50000, emoji: '💵', color: '#fce4ec' },
  { valor:  20000, emoji: '💵', color: '#e3f2fd' },
  { valor:  10000, emoji: '💵', color: '#f3e5f5' },
  { valor:   5000, emoji: '💵', color: '#e0f7fa' },
  { valor:   2000, emoji: '💵', color: '#fff9c4' },
  { valor:   1000, emoji: '💵', color: '#f1f8e9' },
];

const MONEDAS = [
  { valor: 1000, emoji: '🪙', color: '#e8eaf6' },
  { valor:  500, emoji: '🪙', color: '#fff9c4' },
  { valor:  200, emoji: '🪙', color: '#fce4ec' },
  { valor:  100, emoji: '🪙', color: '#f5f5f5' },
  { valor:   50, emoji: '🪙', color: '#fff8e1' },
];

function abrirContadorBilletes() {
  renderDenomGrid('billetes-grid', BILLETES);
  renderDenomGrid('monedas-grid', MONEDAS);
  calcBilletesTotal();
  openModal('modal-billetes');
}

function renderDenomGrid(containerId, denoms) {
  document.getElementById(containerId).innerHTML = denoms.map(d => `
    <div class="billete-item" style="background:${d.color}">
      <div class="billete-denom">
        <span class="billete-label">${fmt(d.valor)}</span>
        <span class="billete-emoji">${d.emoji}</span>
      </div>
      <div class="billete-controls">
        <button class="billete-btn" onclick="changeDenom(${d.valor}, -1)">−</button>
        <input class="billete-input" id="denom-${String(d.valor).replace('.','_')}"
          type="number" min="0" value="0" oninput="calcBilletesTotal()"/>
        <button class="billete-btn" onclick="changeDenom(${d.valor}, 1)">+</button>
      </div>
      <div class="billete-subtotal" id="sub-${String(d.valor).replace('.','_')}"></div>
    </div>
  `).join('');
}

function changeDenom(valor, delta) {
  const id = 'denom-' + String(valor).replace('.', '_');
  const input = document.getElementById(id);
  const current = parseInt(input.value) || 0;
  input.value = Math.max(0, current + delta);
  calcBilletesTotal();
}

function calcBilletesTotal() {
  let total = 0;
  [...BILLETES, ...MONEDAS].forEach(d => {
    const id = 'denom-' + String(d.valor).replace('.', '_');
    const subId = 'sub-' + String(d.valor).replace('.', '_');
    const input = document.getElementById(id);
    if (!input) return;
    const qty = parseInt(input.value) || 0;
    const sub = qty * d.valor;
    total += sub;
    const subEl = document.getElementById(subId);
    if (subEl) subEl.textContent = sub > 0 ? fmt(sub) : '';
  });
  document.getElementById('billetes-total').textContent = fmt(total);
}

function aplicarConteo() {
  const totalText = document.getElementById('billetes-total').textContent;
  const valor = parseFloat(totalText.replace(/[^0-9.]/g, '')) || 0;
  const input = document.getElementById('cierre-contado-efectivo');
  if (input) {
    input.value = Math.round(valor);
    if (_cierreSummary) {
      const s = _cierreSummary;
      const sbm = s.sales_by_method || {};
      const cashTotal = (sbm['efectivo'] || { total: 0 }).total;
      const expectedEfectivo = s.opening_balance + cashTotal + s.manual_in - s.manual_out;
      updateDiffLive('efectivo', expectedEfectivo);
    }
  }
  closeModal('modal-billetes');
}

// ═══════════════════════════════════════════════════════
//  PÉRDIDAS
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//  DEVOLUCIONES
// ═══════════════════════════════════════════════════════

var _returnSale = null;

async function openReturnModal(saleId) {
  try {
    const sale = await api('GET', `/api/sales/${saleId}`);
    _returnSale = sale;
    document.getElementById('modal-return-title').textContent = `Devolución — Venta #${sale.id}`;
    document.getElementById('return-reason').value = '';
    document.getElementById('modal-return-body').innerHTML = `
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
        Selecciona los productos a devolver y la cantidad.
      </p>
      <table class="data-table">
        <thead><tr><th>Producto</th><th>Precio</th><th style="width:100px">Devolver</th></tr></thead>
        <tbody>
          ${sale.items.map((item, i) => `
            <tr>
              <td>${item.product_name}</td>
              <td>${fmt(item.price)}</td>
              <td>
                <input type="number" class="input" id="ret-qty-${i}"
                  min="0" max="${item.quantity}" step="1" value="0"
                  style="width:80px;text-align:center;padding:4px 8px"
                  oninput="updateReturnTotal()"/>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:10px 12px;background:#fee2e2;border-radius:8px">
        <span style="font-weight:600">Total a devolver:</span>
        <strong id="return-total-val" style="font-size:18px;color:#dc2626">$0.00</strong>
      </div>
    `;
    openModal('modal-return');
  } catch (e) { toast(e.message, 'error'); }
}

function updateReturnTotal() {
  if (!_returnSale) return;
  let total = 0;
  _returnSale.items.forEach((item, i) => {
    const qty = parseFloat(document.getElementById(`ret-qty-${i}`)?.value) || 0;
    total += item.price * Math.min(qty, item.quantity);
  });
  document.getElementById('return-total-val').textContent = fmt(total);
}

async function confirmarDevolucion() {
  if (!_returnSale) return;
  const reason = document.getElementById('return-reason').value.trim();
  if (!reason) { toast('Escribe el motivo de la devolución', 'error'); return; }

  const items = _returnSale.items.map((item, i) => {
    const qty = parseFloat(document.getElementById(`ret-qty-${i}`)?.value) || 0;
    return qty > 0 ? { ...item, quantity: Math.min(qty, item.quantity) } : null;
  }).filter(Boolean);

  if (!items.length) { toast('Selecciona al menos un producto', 'error'); return; }

  try {
    await api('POST', '/api/returns', { sale_id: _returnSale.id, items, reason });
    closeModal('modal-return');
    toast('Devolución registrada', 'success');
    loadSales();
  } catch (e) { toast(e.message, 'error'); }
}

var _lossProducts = [];

async function loadLosses() {
  try {
    const losses = await api('GET', '/api/losses');
    const tbody = document.querySelector('#losses-table tbody');
    if (!losses.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Sin pérdidas registradas</td></tr>';
      return;
    }
    tbody.innerHTML = losses.map(l => {
      const fecha = new Date(l.created_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
      return `<tr>
        <td>${fecha}</td>
        <td><strong>${l.product_name}</strong></td>
        <td>${l.quantity} ${l.unit}</td>
        <td><span class="loss-reason-badge">${l.reason}</span></td>
        <td>${l.responsible}</td>
        <td>
          ${l.notes ? `<span style="font-size:12px;color:var(--text-muted)" title="${l.notes}">📝</span> ` : ''}
          <button class="btn btn-outline btn-sm" style="color:#dc2626;border-color:#dc2626"
            onclick="deleteLoss(${l.id})">Eliminar</button>
        </td>
      </tr>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function openLossModal() {
  // Cargar productos frescos
  try {
    _lossProducts = await api('GET', '/api/products');
    const sel = document.getElementById('loss-product');
    sel.innerHTML = '<option value="">— Seleccionar producto —</option>' +
      _lossProducts.map(p =>
        `<option value="${p.id}" data-unit="${p.unit}" data-name="${p.name}">${p.name} (${p.stock} ${p.unit})</option>`
      ).join('');
    // reset fields
    document.getElementById('loss-quantity').value = '';
    document.getElementById('loss-reason-select').value = 'Caducidad';
    document.getElementById('loss-reason-other').style.display = 'none';
    document.getElementById('loss-reason-other').value = '';
    document.getElementById('loss-responsible').value = '';
    document.getElementById('loss-notes').value = '';
    document.getElementById('loss-unit-label').textContent = '';
    openModal('modal-loss');
  } catch (e) { toast(e.message, 'error'); }
}

function updateLossUnit() {
  const sel = document.getElementById('loss-product');
  const opt = sel.options[sel.selectedIndex];
  const unit = opt?.dataset?.unit || '';
  document.getElementById('loss-unit-label').textContent = unit ? `(${unit})` : '';
}

function toggleLossReasonOther() {
  const sel = document.getElementById('loss-reason-select');
  document.getElementById('loss-reason-other').style.display = sel.value === 'Otro' ? 'block' : 'none';
}

async function saveLoss() {
  const sel = document.getElementById('loss-product');
  const productId = sel.value ? parseInt(sel.value) : null;
  const opt = sel.options[sel.selectedIndex];
  const productName = productId ? opt.dataset.name : '';
  const unit = productId ? opt.dataset.unit : 'unidad';
  const quantity = parseFloat(document.getElementById('loss-quantity').value);
  const reasonSel = document.getElementById('loss-reason-select').value;
  const reason = reasonSel === 'Otro'
    ? (document.getElementById('loss-reason-other').value.trim() || 'Otro')
    : reasonSel;
  const responsible = document.getElementById('loss-responsible').value.trim();
  const notes = document.getElementById('loss-notes').value.trim();

  if (!productId) { toast('Selecciona un producto', 'error'); return; }
  if (!quantity || quantity <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }
  if (!responsible) { toast('Ingresa el nombre del responsable', 'error'); return; }

  try {
    await api('POST', '/api/losses', { product_id: productId, product_name: productName, quantity, unit, reason, responsible, notes });
    closeModal('modal-loss');
    toast('Pérdida registrada', 'success');
    loadLosses();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteLoss(id) {
  if (!confirm('¿Eliminar este registro? El stock del producto se restaurará.')) return;
  try {
    await api('DELETE', `/api/losses/${id}`);
    toast('Registro eliminado', 'success');
    loadLosses();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════════════════════

async function openSettingsModal() {
  try {
    const cfg = await api('GET', '/api/settings');
    document.getElementById('cfg-nombre').value = cfg.negocio_nombre || '';
    document.getElementById('cfg-pin-admin').value  = cfg.pin_admin  || '1234';
    document.getElementById('cfg-pin-worker').value = cfg.pin_worker || '0000';
    // Green API
    document.getElementById('cfg-greenapi-instance').value = cfg.greenapi_instance || '';
    document.getElementById('cfg-greenapi-token').value    = cfg.greenapi_token    || '';
    document.getElementById('cfg-greenapi-phone').value    = cfg.whatsapp_phone    || '';
    document.getElementById('cfg-greenapi-enabled').checked = cfg.greenapi_enabled == '1' || cfg.greenapi_enabled === true || cfg.greenapi_enabled === 1;
    openModal('modal-settings');
  } catch (e) { toast(e.message, 'error'); }
}

async function saveSettings() {
  const data = {
    negocio_nombre:    document.getElementById('cfg-nombre').value.trim() || 'Delicias del Rey',
    pin_admin:         document.getElementById('cfg-pin-admin').value  || '1234',
    pin_worker:        document.getElementById('cfg-pin-worker').value || '0000',
    whatsapp_phone:    document.getElementById('cfg-greenapi-phone').value.trim(),
    greenapi_instance: document.getElementById('cfg-greenapi-instance').value.trim(),
    greenapi_token:    document.getElementById('cfg-greenapi-token').value.trim(),
    greenapi_enabled:  document.getElementById('cfg-greenapi-enabled').checked ? '1' : '0',
  };
  try {
    await api('POST', '/api/settings', data);
    closeModal('modal-settings');
    toast('Configuración guardada', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function probarWhatsapp() {
  const phone    = document.getElementById('cfg-greenapi-phone').value.trim();
  const instance = document.getElementById('cfg-greenapi-instance').value.trim();
  const token    = document.getElementById('cfg-greenapi-token').value.trim();
  if (!phone || !instance || !token) { toast('Completa el número, ID y token primero', 'error'); return; }
  try {
    await api('POST', '/api/settings/test-whatsapp', { phone, greenapi_instance: instance, greenapi_token: token });
    toast('Mensaje de prueba enviado — revisa tu WhatsApp ✓', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  CONTABILIDAD
// ═══════════════════════════════════════════════════════

var _accTab = 'dashboard';
var _accAccounts = [];

const ACC_TYPE_LABELS = {
  'ingreso': 'Ventas',
  'costo': 'Costo de Ventas',
  'gasto_operativo': 'Gastos Fijos y Variables',
  'gasto_admin': 'Gastos Financieros',
  'otro_ingreso': 'Otro Ingreso',
  'otro_gasto': 'Otros Gastos / Impuestos',
};

const ACC_TAB_TITLES = {
  dashboard: 'Dashboard',
  ventas: 'Ventas por Día',
  asientos: 'Asientos Contables',
  mayor: 'Libro Mayor',
  edr: 'Estado de Resultados',
};

function switchAccTab(tab) {
  _accTab = tab;
  ['dashboard','ventas','asientos','mayor','edr'].forEach(t => {
    document.getElementById(`acc-panel-${t}`).style.display = t === tab ? '' : 'none';
    const nav = document.getElementById(`acc-nav-${t}`);
    if (nav) nav.classList.toggle('active', t === tab);
  });
  document.getElementById('acc-main-title').textContent = ACC_TAB_TITLES[tab] || tab;
  document.getElementById('btn-nuevo-asiento').style.display = tab === 'asientos' ? '' : 'none';
  loadAccountingTab();
}

function loadAccountingTab() {
  if (_accTab === 'dashboard') loadAccDashboard();
  else if (_accTab === 'ventas') loadAccVentas();
  else if (_accTab === 'asientos') loadJournal();
  else if (_accTab === 'mayor') loadMayor();
  else if (_accTab === 'edr') loadEDR();
}

// ── Dashboard ─────────────────────────────────────────

async function loadAccDashboard() {
  const from = document.getElementById('acc-from').value;
  const to   = document.getElementById('acc-to').value;
  const qs   = (from && to) ? `?from=${from}&to=${to}` : '';

  const set = (id, val, cls) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = fmt(val);
    el.className = 'acc-stat-value' + (cls ? ' ' + cls : '');
  };

  try {
    const [edr, summary] = await Promise.all([
      api('GET', '/api/income-statement' + qs),
      api('GET', '/api/acc-summary' + qs),
    ]);

    // Operaciones
    set('acc-dash-ventas', summary.total_ventas, 'green');
    const numEl = document.getElementById('acc-dash-num-ventas');
    if (numEl) numEl.textContent = summary.num_ventas + ' ventas';
    set('acc-dash-egresos', summary.total_egresos, 'red');
    set('acc-dash-caja', summary.dinero_en_caja, summary.dinero_en_caja >= 0 ? 'green' : 'red');

    // Contabilidad
    set('acc-dash-ingresos', edr.total_ingresos, 'green');
    set('acc-dash-costos', edr.total_costos, 'red');
    set('acc-dash-gastos-op', edr.total_gastos_op, 'red');
    set('acc-dash-gastos-admin', edr.total_gastos_admin, 'red');
    set('acc-dash-utilidad-bruta', edr.utilidad_bruta, edr.utilidad_bruta >= 0 ? 'green' : 'red');
    set('acc-dash-utilidad-neta', edr.utilidad_neta, edr.utilidad_neta >= 0 ? 'green' : 'red');

    // Últimos asientos
    const entries = await api('GET', '/api/journal?limit=8' + (qs ? '&' + qs.slice(1) : ''));
    const tbody = document.querySelector('#acc-dash-recent-table tbody');
    tbody.innerHTML = entries.length ? entries.map(e => `
      <tr>
        <td style="color:#64748b;font-size:12px">${e.date}</td>
        <td style="font-size:12px;color:#334155">${e.account_name}</td>
        <td style="color:#475569">${e.description}</td>
        <td style="color:#16a34a;font-weight:700;text-align:right">${e.entry_type === 'ingreso' ? fmt(e.amount) : ''}</td>
        <td style="color:#dc2626;font-weight:700;text-align:right">${e.entry_type === 'egreso' ? fmt(e.amount) : ''}</td>
      </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">Sin asientos en este período</td></tr>';
  } catch(e) { toast(e.message, 'error'); }
}

// ── Ventas por día ────────────────────────────────────

async function loadAccVentas() {
  const from = document.getElementById('acc-from').value;
  const to   = document.getElementById('acc-to').value;
  try {
    let url = '/api/acc-ventas-dia';
    if (from && to) url += `?from=${from}&to=${to}`;
    const data = await api('GET', url);
    const tbody = document.querySelector('#acc-ventas-table tbody');
    const tfoot = document.getElementById('acc-ventas-tfoot');
    if (!data.rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Sin ventas en este período</td></tr>';
      tfoot.innerHTML = '';
      return;
    }
    const fmtDia = d => {
      const [y,m,day] = d.split('-');
      const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      return `${parseInt(day)} de ${meses[parseInt(m)-1]}`;
    };
    tbody.innerHTML = data.rows.map(r => `
      <tr>
        <td>${fmtDia(r.dia)}</td>
        <td style="text-align:right;color:#16a34a;font-weight:600">${r.efectivo > 0 ? fmt(r.efectivo) : '—'}</td>
        <td style="text-align:right;color:#B45309;font-weight:600">${r.transferencia > 0 ? fmt(r.transferencia) : '—'}</td>
        <td style="text-align:right;font-weight:700;color:#1a1a1a">${fmt(r.total)}</td>
      </tr>`).join('');
    tfoot.innerHTML = `
      <tr style="background:#FC4C02;font-weight:800;color:#fff">
        <td>Total (${data.rows.length} días)</td>
        <td style="text-align:right;color:#fff">${fmt(data.total_efectivo)}</td>
        <td style="text-align:right;color:#fff">${fmt(data.total_transferencia)}</td>
        <td style="text-align:right;color:#fff">${fmt(data.total_monto)}</td>
      </tr>`;
  } catch(e) { toast(e.message, 'error'); }
}

// ── Asientos ──────────────────────────────────────────

async function loadJournal() {
  const from = document.getElementById('acc-from').value;
  const to   = document.getElementById('acc-to').value;
  try {
    let url = '/api/journal';
    if (from && to) url += `?from=${from}&to=${to}`;
    const entries = await api('GET', url);
    const tbody = document.querySelector('#journal-table tbody');
    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Sin asientos en este período</td></tr>';
      return;
    }
    tbody.innerHTML = entries.map(e => {
      const isIng = e.entry_type === 'ingreso';
      return `<tr>
        <td>${e.date}</td>
        <td><span style="font-size:11px;color:#64748b">${e.code}</span> ${e.account_name}</td>
        <td>${e.description}</td>
        <td style="font-size:12px;color:#94a3b8">${e.reference || '—'}</td>
        <td style="color:#16a34a;font-weight:600">${isIng ? fmt(e.amount) : ''}</td>
        <td style="color:#dc2626;font-weight:600">${!isIng ? fmt(e.amount) : ''}</td>
        <td><button class="btn-icon" onclick="deleteJournalEntry(${e.id})" title="Eliminar">🗑️</button></td>
      </tr>`;
    }).join('');
  } catch(e) { toast(e.message, 'error'); }
}

async function openJournalModal() {
  _accAccounts = await api('GET', '/api/accounts');
  const sel = document.getElementById('je-account');
  const groups = {
    'Ingresos': _accAccounts.filter(a => a.type === 'ingreso'),
    'Costos': _accAccounts.filter(a => a.type === 'costo'),
    'Gastos Operativos': _accAccounts.filter(a => a.type === 'gasto_operativo'),
    'Gastos Administrativos': _accAccounts.filter(a => a.type === 'gasto_admin'),
    'Otros Ingresos': _accAccounts.filter(a => a.type === 'otro_ingreso'),
    'Otros Gastos': _accAccounts.filter(a => a.type === 'otro_gasto'),
  };
  sel.innerHTML = '<option value="">— Seleccionar cuenta —</option>' +
    Object.entries(groups).map(([label, accs]) =>
      accs.length ? `<optgroup label="${label}">${accs.map(a =>
        `<option value="${a.id}" data-type="${a.type}">${a.code} - ${a.name}</option>`
      ).join('')}</optgroup>` : ''
    ).join('');
  document.getElementById('je-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('je-amount').value = '';
  document.getElementById('je-description').value = '';
  document.getElementById('je-reference').value = '';
  document.getElementById('je-type-display').value = '';
  openModal('modal-journal');
}

function updateJEType() {
  const sel = document.getElementById('je-account');
  const opt = sel.options[sel.selectedIndex];
  const type = opt?.dataset?.type || '';
  const isIng = type === 'ingreso' || type === 'otro_ingreso';
  document.getElementById('je-type-display').value = ACC_TYPE_LABELS[type] || '';
  document.getElementById('je-type-badge').innerHTML = type
    ? `<span class="badge ${isIng ? 'badge-success' : 'badge-danger'}">${isIng ? 'Ingreso' : 'Egreso'}</span>`
    : '';
}

async function saveJournalEntry() {
  const account_id  = parseInt(document.getElementById('je-account').value);
  const date        = document.getElementById('je-date').value;
  const amount      = parseFloat(document.getElementById('je-amount').value);
  const description = document.getElementById('je-description').value.trim();
  const reference   = document.getElementById('je-reference').value.trim();
  if (!account_id) { toast('Selecciona una cuenta', 'error'); return; }
  if (!date)       { toast('Selecciona una fecha', 'error'); return; }
  if (!amount || amount <= 0) { toast('Ingresa un monto válido', 'error'); return; }
  if (!description) { toast('Escribe una descripción', 'error'); return; }
  try {
    await api('POST', '/api/journal', { account_id, date, amount, description, reference });
    closeModal('modal-journal');
    toast('Asiento registrado', 'success');
    loadJournal();
  } catch(e) { toast(e.message, 'error'); }
}

async function deleteJournalEntry(id) {
  if (!confirm('¿Eliminar este asiento?')) return;
  await api('DELETE', `/api/journal/${id}`);
  toast('Asiento eliminado');
  loadJournal();
}

// ── Libro Mayor ───────────────────────────────────────

async function loadMayor() {
  const from = document.getElementById('acc-from').value;
  const to   = document.getElementById('acc-to').value;
  try {
    let url = '/api/ledger';
    if (from && to) url += `?from=${from}&to=${to}`;
    const ledger = await api('GET', url);

    const GRUPOS = [
      { label: 'VENTAS',              filter: l => l.account.type === 'ingreso' },
      { label: 'COSTOS DE VENTAS',    filter: l => l.account.type === 'costo' },
      { label: 'GASTOS OPERATIVOS',   filter: l => l.account.type === 'gasto_operativo' },
      { label: 'GASTOS FINANCIEROS',  filter: l => l.account.type === 'gasto_admin' },
      { label: 'OTROS GASTOS',        filter: l => l.account.type === 'otro_gasto' && l.account.code.startsWith('8') },
      { label: 'IMPUESTOS',           filter: l => l.account.type === 'otro_gasto' && l.account.code.startsWith('9') },
    ];

    const colHtml = ({ label, filter }) => {
      const accounts = ledger.filter(filter);
      if (!accounts.length) return '';
      const total = accounts.reduce((s, a) => s + Math.abs(a.saldo), 0);
      return `
        <div class="mayor-col">
          <div class="mayor-col-header">${label}</div>
          <table class="mayor-col-table">
            <tbody>
              ${accounts.map(a => {
                const val = Math.abs(a.saldo);
                const valHtml = val > 0
                  ? `<span style="color:#16a34a">${fmt(val)}</span>`
                  : `<span style="color:#cbd5e1">—</span>`;
                return `<tr>
                  <td>${a.account.name}</td>
                  <td style="color:#cbd5e1">$</td>
                  <td>${valHtml}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="mayor-col-total">
                <td>TOTAL</td>
                <td>$</td>
                <td>${fmt(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    };

    const cols = GRUPOS.map(colHtml).filter(Boolean).join('');
    if (!cols) {
      document.getElementById('mayor-content').innerHTML =
        '<p style="color:#64748b;text-align:center;padding:40px">Sin cuentas registradas</p>';
      return;
    }
    document.getElementById('mayor-content').innerHTML =
      `<div class="mayor-grid">${cols}</div>`;
  } catch(e) { toast(e.message, 'error'); }
}

// ── Estado de Resultados Integral ────────────────────

async function loadEDR() {
  const from = document.getElementById('acc-from').value;
  const to   = document.getElementById('acc-to').value;
  try {
    let url = '/api/income-statement';
    if (from && to) url += `?from=${from}&to=${to}`;
    const e = await api('GET', url);

    const periodoStr = (from && to)
      ? `${from.split('-').reverse().join('/')} AL ${to.split('-').reverse().join('/')}`
      : 'TODO EL PERÍODO';

    const row = (label, amount) => `
      <tr class="edr-data">
        <td>${label}</td>
        <td>$</td>
        <td>${fmt(amount)}</td>
        <td></td>
      </tr>`;
    const hl = (label, amount, pct) => `
      <tr class="edr-hl">
        <td>${label}</td>
        <td>$</td>
        <td>${fmt(amount)}</td>
        <td>${pct !== null ? pct + '%' : ''}</td>
      </tr>`;
    const spacer = () => `<tr class="edr-spacer"><td colspan="4"></td></tr>`;

    document.getElementById('edr-content').innerHTML = `
      <div class="edr-card">
        <div class="edr-title-block">
          <div class="edr-t1">Estado de Resultados Integral</div>
          <div class="edr-t2">DELICIAS DEL REY</div>
          <div class="edr-t2" style="font-size:11px;margin-top:2px">${periodoStr}</div>
        </div>
        <div style="overflow-x:auto">
        <table class="edr-table">
          <tbody>
            ${spacer()}
            ${row('VENTAS', e.total_ingresos)}
            ${row('COMPRA DE MERCANCÍA', e.total_costos)}
            ${hl('GANANCIA BRUTA', e.ganancia_bruta, e.pct_bruta)}
            ${spacer()}
            ${row('GASTOS FIJOS Y VARIABLES', e.total_gastos_op)}
            ${hl('GANANCIA OPERATIVA', e.ganancia_antes_gastos_fin, e.pct_antes_gastos_fin)}
            ${spacer()}
            ${e.total_gastos_fin > 0 ? row('GASTOS FINANCIEROS', e.total_gastos_fin) : ''}
            ${e.total_otros > 0 ? row('OTROS GASTOS', e.total_otros) : ''}
            ${hl('GANANCIA ANTES DE IMPUESTOS', e.ganancia_antes_impuestos, null)}
            ${spacer()}
            ${e.total_impuestos > 0 ? row('IMPUESTOS', e.total_impuestos) : ''}
            ${hl('GANANCIA NETA', e.ganancia_neta, e.pct_neta)}
            ${spacer()}
          </tbody>
        </table>
        </div>
      </div>
    `;
  } catch(err) { toast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
initTerminalScreen();
