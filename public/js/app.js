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
    const workersCard = `
      <div class="terminal-card" onclick="document.getElementById('terminal-screen').style.display='none';openWorkersScreen()">
        <span class="terminal-card-dot" style="background:#f59e0b"></span>
        <span class="terminal-card-icon">👷</span>
        <div class="terminal-card-name">Trabajadores</div>
      </div>`;
    document.getElementById('terminal-grid').innerHTML = termCards + contCard + workersCard;
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
  initNovedades();
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

// Permite ingresar la clave con el TECLADO FÍSICO (números, Borrar y Enter)
document.addEventListener('keydown', (e) => {
  const pinScreen = document.getElementById('pin-screen');
  if (!pinScreen || getComputedStyle(pinScreen).display === 'none') return;  // solo si la pantalla de clave está visible
  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    pinKey(e.key);
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    pinBack();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    pinConfirm();
  }
});

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
      initNovedades();
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
  // Reiniciar POS solo para admin
  const btnReset = document.getElementById('btn-reset-pos');
  if (btnReset) btnReset.style.display = isAdmin ? '' : 'none';
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
  item.addEventListener('click', async () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const page = item.dataset.page;
    document.getElementById(`page-${page}`).classList.add('active');
    if (page === 'dashboard') loadDashboard();
    if (page === 'pos') loadPOS();
    if (page === 'sales') { setDefaultDates('sales-from','sales-to'); loadSales(); }
    if (page === 'movements') { setDefaultDates('mov-from','mov-to'); await loadRegisterStatus(); loadMovements(); }
    if (page === 'inventory') loadInventory();
    if (page === 'losses') loadLosses();
    if (page === 'tasks') loadTasks();
    if (page === 'checklist') initChecklistPage();
    if (page === 'reception') initRecepcionPage();
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
async function loadDashboard(silent = false) {
  // Pre-llenar fechas de informes
  const today = new Date().toISOString().slice(0,10);
  const thisMonth = today.slice(0,7);
  const dateEl = document.getElementById('report-daily-date');
  const weekEl = document.getElementById('report-weekly-date');
  const monthEl = document.getElementById('report-monthly-month');
  if (dateEl && !dateEl.value)   dateEl.value  = today;
  if (weekEl && !weekEl.value)   weekEl.value  = today;
  if (monthEl && !monthEl.value) monthEl.value = thisMonth;

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

    // Gráfico ventas por hora
    renderHourlyChart(d.ventasPorHora || []);

    // Ventas por turno
    renderTurnos(d.turnos || []);

    // Indicador "en vivo"
    const liveEl = document.getElementById('dash-live-time');
    if (liveEl) liveEl.textContent = 'actualizado ' + new Date().toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

    // Arrancar el auto-refresco en vivo (una sola vez)
    startDashboardLive();
  } catch (e) {
    if (!silent) toast(e.message, 'error');  // en refrescos automáticos no molestar con toasts
  }
}

// ─── Dashboard en tiempo real (auto-refresco) ─────────
let _dashboardTimer = null;
function startDashboardLive() {
  if (_dashboardTimer) return;  // ya está activo
  _dashboardTimer = setInterval(() => {
    const dashActiva = document.getElementById('page-dashboard')?.classList.contains('active');
    const pestañaVisible = document.visibilityState === 'visible';
    if (dashActiva && pestañaVisible) loadDashboard(true);  // refresco silencioso
  }, 6000);  // cada 6 segundos
}

function _turnoLabel(t) {
  // Extrae "Turno mañana/tarde" de las notas, o usa la hora de apertura
  const notas = t.notes || '';
  const m = notas.match(/Turno\s+(mañana|tarde|noche)/i);
  if (m) return 'Turno ' + m[1].toLowerCase();
  try {
    const h = new Date(String(t.opened_at).replace(' ', 'T')).getHours();
    return h < 13 ? 'Turno mañana' : h < 19 ? 'Turno tarde' : 'Turno noche';
  } catch { return 'Turno'; }
}

function _horaCorta(s) {
  if (!s) return '';
  try { return new Date(String(s).replace(' ', 'T')).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function renderTurnos(turnos) {
  const cont = document.getElementById('dash-turnos');
  if (!cont) return;
  if (!turnos.length) {
    cont.innerHTML = '<div class="empty-state" style="padding:24px;color:#64748b">Aún no se ha abierto caja hoy</div>';
    return;
  }
  const totalDia = turnos.reduce((s, t) => s + (t.total || 0), 0);
  const ticketsDia = turnos.reduce((s, t) => s + (t.ventas || 0), 0);
  const iconos = { 'Turno mañana': '☀️', 'Turno tarde': '🌙', 'Turno noche': '🌃' };
  cont.innerHTML = `
    <div class="turnos-list">
      ${turnos.map((t, i) => {
        const label = _turnoLabel(t);
        const icono = iconos[label] || '🕐';
        const abierto = t.status === 'abierta';
        const rango = abierto
          ? `${_horaCorta(t.opened_at)} · en curso`
          : `${_horaCorta(t.opened_at)} – ${_horaCorta(t.closed_at)}`;
        return `
        <div class="turno-row">
          <div class="turno-icon">${icono}</div>
          <div class="turno-info">
            <div class="turno-name">${label} ${abierto ? '<span class="turno-badge-live">● ABIERTA</span>' : ''}</div>
            <div class="turno-sub">${rango} · ${t.ventas} ticket${t.ventas === 1 ? '' : 's'}</div>
          </div>
          <div class="turno-total">${fmt(t.total)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="turno-total-row">
      <span>TOTAL DEL DÍA · ${ticketsDia} ticket${ticketsDia === 1 ? '' : 's'}</span>
      <span class="turno-total-big">${fmt(totalDia)}</span>
    </div>`;
}

// ─── Descargar informes ───────────────────────────────
async function downloadReport(type) {
  let url, filename;
  if (type === 'daily') {
    const date = document.getElementById('report-daily-date')?.value;
    if (!date) { toast('Selecciona una fecha', 'error'); return; }
    url = `/api/reports/daily?date=${date}`;
    filename = `informe_diario_${date}.xlsx`;
  } else if (type === 'weekly') {
    const date = document.getElementById('report-weekly-date')?.value;
    if (!date) { toast('Selecciona una fecha de la semana', 'error'); return; }
    url = `/api/reports/weekly?date=${date}`;
    filename = `informe_semanal_${date}.xlsx`;
  } else {
    const month = document.getElementById('report-monthly-month')?.value;
    if (!month) { toast('Selecciona un mes', 'error'); return; }
    url = `/api/reports/monthly?month=${month}`;
    filename = `informe_mensual_${month}.xlsx`;
  }

  toast('⏳ Generando informe...', '');
  try {
    const res = await fetch(url);
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Error'); }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('✅ Informe descargado', 'success');
  } catch(e) {
    toast(`Error: ${e.message}`, 'error');
  }
}

// ─── Gráfico de ventas por hora ───────────────────────
let _horaChart = null;

function renderHourlyChart(data) {
  const canvas = document.getElementById('chart-ventas-hora');
  if (!canvas) return;

  const hayDatos = data.some(h => h.ventas > 0);
  const emptyEl  = document.getElementById('chart-hora-empty');

  if (!hayDatos) {
    if (emptyEl) emptyEl.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  canvas.style.display = '';

  // Solo mostrar horas entre la primera y última con ventas (+2 horas de margen)
  const activos = data.filter(h => h.ventas > 0);
  const horaMin = Math.max(0,  activos[0].hora - 1);
  const horaMax = Math.min(23, activos[activos.length - 1].hora + 1);
  const slice   = data.slice(horaMin, horaMax + 1);

  const labels  = slice.map(h => `${String(h.hora).padStart(2,'0')}:00`);
  const ventas  = slice.map(h => h.ventas);
  const totales = slice.map(h => h.total);

  // Hora pico
  const pico = data.reduce((a, b) => b.ventas > a.ventas ? b : a, data[0]);
  const picoBadge = document.getElementById('dash-hora-pico');
  if (pico.ventas > 0 && picoBadge) {
    picoBadge.textContent = `🔥 Pico: ${String(pico.hora).padStart(2,'0')}:00 (${pico.ventas} tickets)`;
    picoBadge.style.display = '';
  }

  // Si la gráfica ya existe, actualizar datos en el sitio (sin parpadeo)
  if (_horaChart) {
    _horaChart.data.labels = labels;
    _horaChart.data.datasets[0].data = totales;
    _horaChart.data.datasets[1].data = ventas;
    _horaChart.update('none');
    return;
  }

  const ctx = canvas.getContext('2d');

  // Gradiente para las barras de ingresos
  const gradTotal = ctx.createLinearGradient(0, 0, 0, 220);
  gradTotal.addColorStop(0, 'rgba(99,102,241,0.85)');
  gradTotal.addColorStop(1, 'rgba(99,102,241,0.15)');

  _horaChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Ingresos ($)',
          data: totales,
          backgroundColor: gradTotal,
          borderColor: '#6366f1',
          borderWidth: 1.5,
          borderRadius: 6,
          yAxisID: 'yTotal',
          order: 2,
        },
        {
          label: 'Tickets vendidos',
          data: ventas,
          type: 'line',
          borderColor: '#FC4C02',
          backgroundColor: 'rgba(252,76,2,0.12)',
          borderWidth: 2.5,
          pointBackgroundColor: '#FC4C02',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
          yAxisID: 'yVentas',
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: ctx => ctx.dataset.label === 'Tickets vendidos'
              ? ` ${ctx.raw} ticket${ctx.raw !== 1 ? 's' : ''}`
              : ` $${Number(ctx.raw).toLocaleString('es-CO')}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 11 } }
        },
        yVentas: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          ticks: {
            color: '#FC4C02',
            font: { size: 11 },
            stepSize: 1,
            callback: v => v % 1 === 0 ? v : ''
          },
          grid: { color: 'rgba(0,0,0,0.05)' }
        },
        yTotal: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          ticks: {
            color: '#6366f1',
            font: { size: 11 },
            callback: v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`
          },
          grid: { display: false }
        }
      }
    }
  });
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

  loadOpenAccounts();
}

function setPOSLock(locked) {
  document.getElementById('pos-lock').style.display = locked ? 'flex' : 'none';
  document.getElementById('pos-content').style.pointerEvents = locked ? 'none' : '';
  document.getElementById('pos-content').style.opacity = locked ? '0.3' : '';
}

async function irAbrirCaja() {
  // Navegar a Caja y abrir modal de apertura
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-page="movements"]').classList.add('active');
  document.getElementById('page-movements').classList.add('active');
  setDefaultDates('mov-from','mov-to');
  await loadRegisterStatus();
  loadMovements();
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
    cart.push({ product_id: product.id, product_name: product.name, price: product.price, originalPrice: product.price, quantity: 1 });
  }
  renderCart();
  scheduleAccountSave();
}

function changeQty(productId, delta) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(i => i.product_id !== productId);
  renderCart();
  scheduleAccountSave();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.product_id !== productId);
  renderCart();
  scheduleAccountSave();
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

// ═══════════════════════════════════════════════════════
//  CUENTAS ABIERTAS (varias órdenes en paralelo)
// ═══════════════════════════════════════════════════════
let _openAccounts = [];
let _activeAccountId = null;   // null = venta rápida
let _quickCart = [];           // carrito de "venta rápida" guardado al cambiar de cuenta
let _acctSaveTimer = null;

async function loadOpenAccounts() {
  try { _openAccounts = await api('GET', '/api/open-accounts'); }
  catch { _openAccounts = []; }
  if (_activeAccountId && !_openAccounts.find(a => a.id === _activeAccountId)) {
    _activeAccountId = null;
    cart = _quickCart;
    renderCart();
  }
  renderAccountsBar();
}

function renderAccountsBar() {
  const bar = document.getElementById('cart-accounts-bar');
  if (!bar) return;
  const chips = [];
  chips.push(`<button class="acct-chip ${_activeAccountId===null?'active':''}" onclick="switchAccount(null)">⚡ Venta rápida</button>`);
  _openAccounts.forEach(a => {
    const count = (a.items||[]).reduce((s,i)=>s+(Number(i.quantity)||0),0);
    chips.push(`<button class="acct-chip ${_activeAccountId===a.id?'active':''}" onclick="switchAccount(${a.id})">
        <span>🧾 ${esc(a.name)}</span>
        ${count?`<span class="acct-chip-count">${count}</span>`:''}
        <span class="acct-chip-x" onclick="event.stopPropagation();discardAccount(${a.id})" title="Descartar cuenta">×</span>
      </button>`);
  });
  chips.push(`<button class="acct-chip acct-chip-new" onclick="openNuevaCuenta()">+ Cuenta</button>`);
  bar.innerHTML = chips.join('');
}

function _cartSnapshot() { return cart.map(i => ({...i})); }

async function _persistActive() {
  if (_activeAccountId == null) return;
  try { await api('PUT', `/api/open-accounts/${_activeAccountId}`, { items: _cartSnapshot() }); } catch {}
}

function scheduleAccountSave() {
  if (_activeAccountId == null) { _quickCart = cart; return; }
  const acc = _openAccounts.find(a=>a.id===_activeAccountId);
  if (acc) acc.items = _cartSnapshot();
  renderAccountsBar();
  clearTimeout(_acctSaveTimer);
  _acctSaveTimer = setTimeout(_persistActive, 500);
}

async function switchAccount(id) {
  if (id === _activeAccountId) return;
  if (_activeAccountId == null) { _quickCart = cart; }
  else { await _persistActive(); }
  _activeAccountId = id;
  if (id == null) {
    cart = _quickCart;
  } else {
    const acc = _openAccounts.find(a=>a.id===id);
    cart = acc ? (acc.items||[]).map(i=>({...i})) : [];
  }
  renderAccountsBar();
  renderCart();
}

// Al dar "+ Cuenta" se crea una cuenta nueva automáticamente (sin pedir nombre)
async function openNuevaCuenta() {
  // Nombre automático: "Cuenta N" con el siguiente número libre
  const names = new Set(_openAccounts.map(a => a.name));
  let n = _openAccounts.length + 1;
  while (names.has('Cuenta ' + n)) n++;
  const name = 'Cuenta ' + n;
  // Si estamos en venta rápida con productos, se "parquean" en la nueva cuenta
  const parkItems = (_activeAccountId == null && cart.length) ? _cartSnapshot() : [];
  try {
    const acc = await api('POST', '/api/open-accounts', { name, items: parkItems });
    acc.items = parkItems;
    _openAccounts.push(acc);
    if (parkItems.length) _quickCart = [];
    _activeAccountId = acc.id;
    cart = parkItems.map(i => ({...i}));
    renderAccountsBar();
    renderCart();
  } catch (e) { toast('Error al crear la cuenta', 'error'); }
}

async function discardAccount(id) {
  const acc = _openAccounts.find(a=>a.id===id);
  if (!confirm(`¿Descartar la cuenta "${acc?acc.name:''}"? Se perderán sus productos.`)) return;
  try { await api('DELETE', `/api/open-accounts/${id}`); } catch {}
  _openAccounts = _openAccounts.filter(a=>a.id!==id);
  if (_activeAccountId === id) { _activeAccountId = null; cart = _quickCart; renderCart(); }
  renderAccountsBar();
}

// Tras cobrar exitosamente una cuenta, eliminarla
async function _closeAccountAfterSale() {
  if (_activeAccountId == null) return;
  const id = _activeAccountId;
  _openAccounts = _openAccounts.filter(a=>a.id!==id);
  _activeAccountId = null;
  _quickCart = [];
  renderAccountsBar();
  try { await api('DELETE', `/api/open-accounts/${id}`); } catch {}
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
    // Resetear descuento al vaciar carrito
    _orderDiscount = { type: 'percent', value: 0 };
    const discRow = document.getElementById('cart-discount-row');
    const subRow  = document.getElementById('cart-subtotal-row');
    const discInp = document.getElementById('cart-discount-input');
    const discBtn = document.getElementById('btn-add-discount');
    if (discRow)  discRow.style.display = 'none';
    if (subRow)   subRow.style.display = 'none';
    if (discInp)  discInp.value = '';
    if (discBtn)  discBtn.textContent = '🏷 desc.';
    return;
  }
  payPanel.style.display = 'flex';
  container.innerHTML = cart.map(item => {
    const isDiscounted = item.originalPrice && item.price < item.originalPrice;
    const priceHtml = isDiscounted
      ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:11px">${fmt(item.originalPrice)}</span> <span style="color:var(--primary);font-weight:700">${fmt(item.price)}</span>`
      : `${fmt(item.price)}`;
    return `
    <div class="cart-item">
      <div style="flex:1;min-width:0">
        <div class="cart-item-name">${item.product_name}</div>
        <div class="cart-item-price">${priceHtml} c/u</div>
      </div>
      <button onclick="editItemPrice(${item.product_id})" title="Modificar precio"
        style="background:none;border:1px dashed var(--border);border-radius:6px;padding:3px 7px;font-size:13px;cursor:pointer;color:var(--text-muted);margin-right:4px;flex-shrink:0"
        onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">✏️</button>
      <div class="qty-controls">
        <button class="qty-btn" onclick="changeQty(${item.product_id}, -1)">−</button>
        <span class="qty-val">${item.quantity}</span>
        <button class="qty-btn" onclick="changeQty(${item.product_id}, 1)">+</button>
      </div>
      <div class="cart-item-sub">${fmt(item.price * item.quantity)}</div>
      <button class="cart-remove" onclick="removeFromCart(${item.product_id})">×</button>
    </div>
  `}).join('');

  // Actualizar totales
  updateDiscountDisplay();
  if (document.getElementById('modal-cobro')?.classList.contains('open')) calcCobroChange();
}

// ─── MODAL DE COBRO ──────────────────────────────────
function openCobroModal() {
  if (!cart.length) { toast('Agrega productos al carrito', 'error'); return; }
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = getCartTotal();
  const discAmt = getDiscountAmount();

  // Resetear estado
  document.getElementById('cobro-total-display').textContent = fmt(total);
  // Mostrar info de descuento si aplica
  const discInfo = document.getElementById('cobro-discount-info');
  if (discAmt > 0 && discInfo) {
    discInfo.style.display = 'block';
    document.getElementById('cobro-subtotal-info').textContent = 'Subtotal ' + fmt(subtotal);
    document.getElementById('cobro-discount-val').textContent = 'Descuento ' + fmt(discAmt);
  } else if (discInfo) {
    discInfo.style.display = 'none';
  }
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
  const total = getCartTotal();
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
    const total = getCartTotal();
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

    // Crear e IMPRIMIR la comanda de cocina automáticamente al cobrar
    try {
      const comNotes = [_consumo, _salsas ? `Salsas: ${_salsas}` : '', notes].filter(Boolean).join(' | ');
      const comanda = await api('POST', '/api/comandas', {
        items: _cartSnapshot.map(i => ({ product_name: i.product_name, quantity: i.quantity })),
        customer_name: _clienteNombre,
        notes: comNotes
      });
      currentComandaForPrint = comanda;
      updateComandaBadge();
      printComanda();
    } catch (ce) { console.error('Comanda:', ce); }

    _closeAccountAfterSale();
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
          <button class="btn btn-outline btn-sm" style="color:#dc2626;border-color:#dc2626" onclick="deleteSale(${s.id})">🗑 Eliminar</button>
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

async function deleteSale(id) {
  if (!confirm(`¿Eliminar la venta #${id}?\n\nSe quitará de las ventas y del cierre, y el stock de sus productos volverá al inventario. No se puede deshacer.`)) return;
  try {
    await api('DELETE', `/api/sales/${id}`);
    toast('Venta eliminada', 'success');
    loadSales();
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
  const subtotalFactura = cart.reduce((s,i) => s + i.price * i.quantity, 0);
  const total    = getCartTotal();
  const discFactura = getDiscountAmount();

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
          ${discFactura > 0 ? `
          <div class="factura-totals-row">
            <span>Subtotal</span>
            <span>${fmt(subtotalFactura)}</span>
          </div>
          <div class="factura-totals-row" style="color:#dc2626">
            <span>Descuento</span>
            <span>-${fmt(discFactura)}</span>
          </div>` : ''}
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
  const isWorker = _userRole === 'worker';
  const filterRow  = document.getElementById('mov-filter-row');
  const actionBtns = document.getElementById('caja-header-actions');
  const tbody      = document.querySelector('#movements-table tbody');
  const labelIn    = document.getElementById('mov-label-in');
  const labelOut   = document.getElementById('mov-label-out');

  // ── MODO EMPLEADO ──────────────────────────────────────
  if (isWorker) {
    if (filterRow)  filterRow.style.display  = 'none';  // ocultar filtro de fechas

    if (!currentRegister) {
      // Sin turno activo: limpiar todo y salir
      if (actionBtns) actionBtns.style.display = 'none';
      document.getElementById('mov-total-out').textContent = '$0';
      document.getElementById('mov-total-in').textContent  = '$0';
      if (labelIn)  labelIn.textContent  = 'Ingresos del turno';
      if (labelOut) labelOut.textContent = 'Egresos del turno';
      tbody.innerHTML = `<tr><td colspan="6" class="empty-cell" style="padding:40px;font-size:15px">🔒 No hay turno activo</td></tr>`;
      return;
    }

    // Turno activo: mostrar botones de ingreso/egreso
    if (actionBtns) actionBtns.style.display = '';
  } else {
    // Admin: mostrar filtro de fechas y botones siempre
    if (filterRow)  filterRow.style.display  = '';
    if (actionBtns) actionBtns.style.display = '';
  }

  // ── CARGA DE MOVIMIENTOS ───────────────────────────────
  try {
    let url = '/api/movements';

    if (isWorker && currentRegister) {
      // Worker: traer solo desde la apertura del turno hasta hoy
      const dayStr = currentRegister.opened_at.slice(0, 10);
      url += `?from=${dayStr}&to=${dayStr}`;
    } else {
      const from = document.getElementById('mov-from').value;
      const to   = document.getElementById('mov-to').value;
      if (from && to) url += `?from=${from}&to=${to}`;
    }

    const movs = await api('GET', url);

    // Movimientos manuales: egresos + ingresos (excluye ventas automáticas)
    const allManuales = movs.filter(m =>
      m.type === 'egreso' || (m.type === 'ingreso' && !m.description.startsWith('Venta #'))
    );

    // Filtrar por turno
    const turnoStart = currentRegister?.opened_at ? new Date(currentRegister.opened_at) : null;
    // Para worker siempre filtra por turno; para admin usa todos los del rango
    const manuales = (isWorker && turnoStart)
      ? allManuales.filter(m => new Date(m.created_at) >= turnoStart)
      : allManuales;

    // Totales (siempre del turno si hay uno abierto)
    const baseTotales = turnoStart
      ? allManuales.filter(m => new Date(m.created_at) >= turnoStart)
      : allManuales;
    const totalOut = baseTotales.filter(m => m.type === 'egreso').reduce((s, m) => s + m.amount, 0);
    const totalIn  = baseTotales.filter(m => m.type === 'ingreso').reduce((s, m) => s + m.amount, 0);
    document.getElementById('mov-total-out').textContent = fmt(totalOut);
    document.getElementById('mov-total-in').textContent  = fmt(totalIn);
    if (labelIn)  labelIn.textContent  = turnoStart ? 'Ingresos manuales del turno' : 'Ingresos manuales del día';
    if (labelOut) labelOut.textContent = turnoStart ? 'Total egresos del turno'     : 'Total egresos del día';

    if (!manuales.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Sin movimientos en este período</td></tr>';
      return;
    }

    // Agrupar por día
    const byDay = {};
    manuales.forEach(m => {
      const dia = m.created_at.slice(0, 10);
      if (!byDay[dia]) byDay[dia] = [];
      byDay[dia].push(m);
    });

    const diasOrdenados = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
    const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fmtDiaLabel = iso => {
      const [y, mo, d] = iso.split('-');
      const hoy  = new Date().toISOString().slice(0, 10);
      const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (iso === hoy)  return `Hoy — ${parseInt(d)} de ${MESES[parseInt(mo)-1]}`;
      if (iso === ayer) return `Ayer — ${parseInt(d)} de ${MESES[parseInt(mo)-1]}`;
      return `${parseInt(d)} de ${MESES[parseInt(mo)-1]} de ${y}`;
    };

    tbody.innerHTML = diasOrdenados.map(dia => {
      const movsDia  = byDay[dia];
      const totalDia = movsDia.reduce((s, m) => s + (m.type === 'egreso' ? -m.amount : m.amount), 0);
      const totalSign = totalDia >= 0 ? '+' : '';
      const rowsDia  = movsDia.map(m => {
        const isIngreso = m.type === 'ingreso';
        const hora = new Date(m.created_at).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
        return `<tr>
          <td style="color:#94a3b8;font-size:12px;padding-left:20px">${hora}</td>
          <td><span class="badge ${isIngreso ? 'badge-success' : 'badge-danger'}">${isIngreso ? 'ingreso' : 'egreso'}</span></td>
          <td>${m.description}</td>
          <td><span class="badge badge-blue">${m.category}</span></td>
          <td><strong style="color:${isIngreso ? '#16a34a' : '#dc2626'}">${isIngreso ? '+' : '-'}${fmt(m.amount)}</strong></td>
          <td><button class="btn-icon" title="Eliminar" onclick="deleteMovement(${m.id})">🗑️</button></td>
        </tr>`;
      }).join('');

      return `
        <tr style="background:#f8fafc;border-top:2px solid var(--border)">
          <td colspan="5" style="padding:8px 12px;font-size:12px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:.4px">
            📅 ${fmtDiaLabel(dia)}
          </td>
          <td style="padding:8px 12px;text-align:right;font-size:12px;font-weight:800;color:${totalDia>=0?'#16a34a':'#dc2626'}">
            ${totalSign}${fmt(Math.abs(totalDia))}
          </td>
        </tr>
        ${rowsDia}`;
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
    allProducts = products;  // mantener el cache global sincronizado
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
          <td>
            <div class="stock-ctl">
              <button class="stock-btn" onclick="adjustStock(${p.id},-1)" title="Restar 1" ${p.infinite_stock ? 'disabled' : ''}>−</button>
              <input class="stock-inp" id="stk-${p.id}" type="number" min="0" step="1" value="${p.infinite_stock ? '' : p.stock}"
                placeholder="${p.infinite_stock ? '∞' : ''}" onfocus="this.select()" onchange="setStockExact(${p.id}, this.value)" ${p.infinite_stock ? 'disabled' : ''}/>
              <button class="stock-btn" onclick="adjustStock(${p.id},1)" title="Sumar 1" ${p.infinite_stock ? 'disabled' : ''}>+</button>
              <span class="stock-unit">${p.unit}</span>
              <button class="stock-inf-btn ${p.infinite_stock ? 'active' : ''}" id="stkinf-${p.id}"
                onclick="toggleInfiniteStockRow(${p.id})"
                title="${p.infinite_stock ? 'Stock infinito activo — toca para controlar cantidad' : 'Activar stock infinito (sin control de cantidad)'}">∞</button>
            </div>
          </td>
          <td><span class="badge ${stockStatus}" id="stkbadge-${p.id}">${stockLabel}</span></td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="editProduct(${p.id})">Editar</button>
            <button class="btn-icon" onclick="deleteProduct(${p.id})" title="Eliminar">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

// ── Ajuste rápido de stock desde el inventario ──
function adjustStock(id, delta) {
  const inp = document.getElementById('stk-' + id);
  if (!inp) return;
  const nuevo = Math.max(0, (parseFloat(inp.value) || 0) + delta);
  inp.value = nuevo;
  _saveStock(id, nuevo);
}

function setStockExact(id, value) {
  const nuevo = Math.max(0, parseFloat(value) || 0);
  const inp = document.getElementById('stk-' + id);
  if (inp) inp.value = nuevo;
  _saveStock(id, nuevo);
}

let _stockSaveTimers = {};
function _saveStock(id, value) {
  // Guarda con un pequeño retraso para agrupar clics rápidos en +/−
  clearTimeout(_stockSaveTimers[id]);
  _stockSaveTimers[id] = setTimeout(async () => {
    try {
      const prod = await api('POST', `/api/products/${id}/stock`, { stock: value });
      const idx = allProducts.findIndex(p => p.id === id);
      if (idx >= 0) allProducts[idx] = prod;
      _updateStockBadge(prod);
      const inp = document.getElementById('stk-' + id);
      if (inp) { inp.classList.add('stock-saved'); setTimeout(() => inp.classList.remove('stock-saved'), 700); }
    } catch (e) {
      toast('Error al actualizar la cantidad', 'error');
      loadInventory();
    }
  }, 350);
}

async function toggleInfiniteStockRow(id) {
  // Estado actual desde el botón (robusto aunque el cache no esté cargado)
  const btn = document.getElementById('stkinf-' + id);
  const esInfinitoAhora = btn ? btn.classList.contains('active')
    : !!(allProducts.find(p => p.id === id) || {}).infinite_stock;
  const nuevoInfinito = !esInfinitoAhora;
  try {
    const updated = await api('POST', `/api/products/${id}/stock`, { infinite_stock: nuevoInfinito });
    const idx = allProducts.findIndex(p => p.id === id);
    if (idx >= 0) allProducts[idx] = updated;
    loadInventory();  // re-renderiza la fila con/ sin controles
    toast(nuevoInfinito ? 'Stock infinito activado' : 'Control de cantidad activado', 'success');
  } catch (e) { toast('Error al cambiar el modo de stock', 'error'); }
}

function _updateStockBadge(p) {
  const badge = document.getElementById('stkbadge-' + p.id);
  if (!badge) return;
  const cls = p.infinite_stock ? 'badge-success' : p.stock === 0 ? 'badge-danger' : p.stock <= p.low_stock_alert ? 'badge-warning' : 'badge-success';
  const lbl = p.infinite_stock ? '∞ Infinito' : p.stock === 0 ? 'Sin stock' : p.stock <= p.low_stock_alert ? 'Stock bajo' : 'OK';
  badge.className = 'badge ' + cls;
  badge.textContent = lbl;
}

function toggleInfiniteStock(checkbox) {
  // El campo de stock permanece visible siempre; el infinito solo indica
  // que no se descuenta al vender.
  document.getElementById('prod-stock-section').style.display = '';
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
  // El campo de stock SIEMPRE visible para poder cambiar la cantidad al editar
  document.getElementById('prod-stock-section').style.display = '';
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

async function previewProductImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.getElementById('prod-img-preview');
  const placeholder = document.getElementById('prod-img-placeholder');
  try {
    // Procesar (convierte HEIC y comprime) para que la vista previa sea fiel
    const blob = await _processImageForUpload(file);
    preview.src = URL.createObjectURL(blob);
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  } catch (e) {
    toast('No se pudo leer esa imagen. Intenta con otra foto (JPG o PNG).', 'error');
    preview.style.display = 'none';
    placeholder.style.display = 'flex';
    event.target.value = '';
  }
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
  const stock = parseFloat(document.getElementById('prod-stock').value) || 0;
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
    // Subir imagen si se seleccionó una (convertida a JPEG, con aviso si falla)
    const fileInput = document.getElementById('prod-image-file');
    if (fileInput.files[0]) {
      try {
        const blob = await _processImageForUpload(fileInput.files[0]);
        const formData = new FormData();
        formData.append('image', blob, 'foto.jpg');
        const res = await fetch(`/api/products/${saved.id}/image`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('rechazada');
      } catch (imgErr) {
        toast('⚠️ El producto se guardó, pero la foto no se pudo subir. Intenta con otra imagen.', 'error');
      }
    }
    closeModal('modal-product');
    loadInventory();
  } catch (e) { toast(e.message, 'error'); }
}

// Convierte cualquier foto (incluido HEIC del iPhone) a JPEG comprimido y del
// tamaño adecuado, para que siempre cargue y no pese de más.
async function _processImageForUpload(file, maxSize = 900, quality = 0.85) {
  let src = file;
  // Convertir HEIC/HEIF a JPEG si hace falta
  const esHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');
  if (esHeic && window.heic2any) {
    try {
      src = await heic2any({ blob: file, toType: 'image/jpeg', quality });
      if (Array.isArray(src)) src = src[0];
    } catch (e) { /* si falla, intentamos con el archivo original */ }
  }
  // Redibujar en canvas para redimensionar y exportar JPEG
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(src);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (Math.max(width, height) > maxSize) {
        const escala = maxSize / Math.max(width, height);
        width = Math.round(width * escala);
        height = Math.round(height * escala);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('formato no soportado')); };
    img.src = url;
  });
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
  const d = new Date(String(c.created_at).replace(' ', 'T'));
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const notas = c.notes ? c.notes.split(' | ').filter(Boolean) : [];
  // Misma estructura que la impresión (vista previa fiel)
  document.getElementById('modal-comanda-body').innerHTML = `
    <div class="cmd80-preview">
      <div class="cmd80-title">COMANDA COCINA</div>
      <div class="cmd80-num">#${c.id}</div>
      <div class="cmd80-time">${fecha} &nbsp; ${hora}</div>
      ${c.customer_name ? `<div class="cmd80-cliente">${c.customer_name}</div>` : ''}
      <div class="cmd80-rule"></div>
      <div class="cmd80-items">
        ${c.items.map(i => `
          <div class="cmd80-item">
            <span class="cmd80-qty">${i.quantity}×</span>
            <span class="cmd80-name">${i.product_name}</span>
          </div>`).join('')}
      </div>
      ${notas.length ? `<div class="cmd80-rule"></div><div class="cmd80-notes">${notas.map(n => `<div class="cmd80-note">${n}</div>`).join('')}</div>` : ''}
    </div>`;
  openModal('modal-comanda');
}

function printComanda() {
  const c = currentComandaForPrint;
  if (!c) return;
  const d = new Date(String(c.created_at).replace(' ', 'T'));
  const fecha = d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora  = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const notas = c.notes ? c.notes.split(' | ').filter(Boolean) : [];
  document.getElementById('ticket-content').innerHTML = `
    <div class="cmd80">
      <div class="cmd80-title">COMANDA COCINA</div>
      <div class="cmd80-num">#${c.id}</div>
      <div class="cmd80-time">${fecha} &nbsp; ${hora}</div>
      ${c.customer_name ? `<div class="cmd80-cliente">${c.customer_name}</div>` : ''}
      <div class="cmd80-rule"></div>
      <div class="cmd80-items">
        ${c.items.map(i => `
          <div class="cmd80-item">
            <span class="cmd80-qty">${i.quantity}×</span>
            <span class="cmd80-name">${i.product_name}</span>
          </div>`).join('')}
      </div>
      <div class="cmd80-rule"></div>
      ${notas.length ? `<div class="cmd80-notes">${notas.map(n => `<div class="cmd80-note">${n}</div>`).join('')}</div>` : ''}
      <div class="cmd80-foot">* * *  FIN  * * *</div>
      <div class="cmd80-feed"></div>
    </div>
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

// ── Contador de turno ─────────────────────────────────
var _turnoCounterInterval = null;

function _fmtElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`;
  return `${s}s`;
}

function _startTurnoCounter(openedAt) {
  if (_turnoCounterInterval) clearInterval(_turnoCounterInterval);
  // Reemplazar espacio por 'T' para que TODOS los navegadores (incl. Safari)
  // lo interpreten como hora local de forma consistente.
  const start = new Date(String(openedAt).replace(' ', 'T'));
  const tick = () => {
    const el = document.getElementById('turno-elapsed');
    if (!el) { clearInterval(_turnoCounterInterval); return; }
    const ms = Date.now() - start.getTime();
    el.textContent = _fmtElapsed(isNaN(ms) || ms < 0 ? 0 : ms);
  };
  tick();
  _turnoCounterInterval = setInterval(tick, 1000);
}

function renderRegisterBanner(reg) {
  const banner = document.getElementById('register-banner');
  if (!banner) return;
  if (_turnoCounterInterval) { clearInterval(_turnoCounterInterval); _turnoCounterInterval = null; }

  if (!reg) {
    banner.className = 'register-banner sin-caja';
    banner.innerHTML = `
      <span>⚠️ No hay caja abierta</span>
      <div class="register-banner-actions">
        <button class="btn btn-primary btn-sm" onclick="openModal('modal-apertura')">Abrir caja</button>
      </div>`;
  } else {
    const desde = new Date(reg.opened_at).toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
    const turnoIcon = _turno === 'tarde' ? '🌙' : '☀️';
    banner.className = 'register-banner abierta';
    banner.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px">
        <span>✅ Caja abierta desde ${desde} — Fondo: ${fmt(reg.opening_balance)}</span>
        <div style="display:flex;align-items:center;gap:10px;margin-top:2px">
          <span style="font-size:12px;color:#64748b">${turnoIcon} Turno activo</span>
          <span style="display:inline-flex;align-items:center;gap:5px;background:#0f172a;color:#4ade80;font-size:13px;font-weight:800;font-family:monospace;padding:3px 10px;border-radius:20px;letter-spacing:.5px">
            <span style="width:7px;height:7px;background:#4ade80;border-radius:50%;display:inline-block;animation:pulse-dot 1.2s infinite"></span>
            <span id="turno-elapsed">0s</span>
          </span>
        </div>
      </div>
      <div class="register-banner-actions">
        <button class="btn btn-danger btn-sm" onclick="prepararCierre()">Cerrar caja</button>
      </div>`;
    _startTurnoCounter(reg.opened_at);
  }
}

function selectResponsable(btn, context) {
  const containerId = context === 'apertura' ? 'apertura-responsable-btns' : 'cierre-responsable-btns';
  document.querySelectorAll(`#${containerId} .responsable-btn`).forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function confirmarApertura() {
  const opening_balance = parseFloat(document.getElementById('apertura-fondo').value) || 0;
  const userNotes = document.getElementById('apertura-notes').value.trim();
  const turnoLabel = _turno === 'tarde' ? 'Turno tarde 🌙' : 'Turno mañana ☀️';
  const activeBtn = document.querySelector('#apertura-responsable-btns .responsable-btn.active');
  const responsable = activeBtn ? activeBtn.textContent.trim() : '';
  const notes = [turnoLabel, responsable, userNotes].filter(Boolean).join(' — ');
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
      const inp = document.getElementById('cierre-contado-efectivo');
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
    const pagosLabel = showCount ? `Ventas en efectivo (${showCount})` : 'Ventas en efectivo';
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

  // Solo se CUENTA el efectivo. Transferencia y tarjeta son electrónicos:
  // se muestran como referencia (no se cuentan, no generan descuadre).
  function _infoMetodo(icon, title, data) {
    if (!data || !data.total) return '';
    return `
      <div class="cierre-info-metodo">
        <span>${icon} ${title} <small style="color:var(--text-muted)">(${data.count} pago${data.count === 1 ? '' : 's'})</small></span>
        <strong>${fmt(data.total)}</strong>
      </div>`;
  }

  document.getElementById('modal-cierre-body').innerHTML =
    metodoPagoSection('💵', 'EFECTIVO EN CAJA', expectedEfectivo, cashData.count, 'efectivo') +
    ((transData.total > 0 || cardData.total > 0)
      ? `<div class="cierre-info-titulo">Pagos electrónicos (solo referencia — no se cuentan)</div>
         ${_infoMetodo('📲', 'Transferencias', transData)}
         ${_infoMetodo('💳', 'Tarjeta / Datáfono', cardData)}`
      : '');
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
  const userNotes = document.getElementById('cierre-notes').value.trim();
  const activeBtn = document.querySelector('#cierre-responsable-btns .responsable-btn.active');
  const responsable = activeBtn ? activeBtn.textContent.trim() : '';
  const notes = [responsable, userNotes].filter(Boolean).join(' — ');
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
    // El reporte no debe romper el cierre: si falla, lo ignoramos.
    try { await showCierreReport(result); } catch (e) { console.error('Reporte de cierre:', e); }
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    // Siempre reiniciar el botón, pase lo que pase.
    btn.disabled = false;
    btn.textContent = 'Cerrar caja';
  }
}

async function showCierreReport(reg) {
  openModal('modal-historial-cierres');
  document.getElementById('modal-historial-body').innerHTML =
    '<div style="text-align:center;padding:48px 0;color:#94a3b8;font-size:14px">⏳ Cargando reporte...</div>';

  // ── Datos básicos ────────────────────────────────────
  const openedDate = reg.opened_at ? new Date(String(reg.opened_at).replace(' ', 'T')) : new Date();
  const closedDate = reg.closed_at ? new Date(String(reg.closed_at).replace(' ', 'T')) : new Date();
  const opened   = openedDate.toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
  const closed   = reg.closed_at ? closedDate.toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' }) : '—';
  const dayStr   = openedDate.toISOString().slice(0,10);
  const monthFrom = dayStr.slice(0,7) + '-01';
  const monthTo   = dayStr.slice(0,7) + '-31';

  // ── Extraer responsable de notas ─────────────────────
  const noteParts  = (reg.notes || '').split(' — ');
  const responsable = noteParts.find(p => /🏢|👩|👨/.test(p)) || '';
  const turnoLabel  = noteParts.find(p => /Turno/.test(p)) || '';
  const notaExtra   = noteParts.filter(p => !/🏢|👩|👨|Turno/.test(p)).join(' — ');

  // ── Ventas por método (acepta {total,count} o número) ──
  const sbm        = reg.sales_by_method || {};
  const _mTotal = v => (v && typeof v === 'object') ? (v.total || 0) : (v || 0);
  const _mCount = v => (v && typeof v === 'object') ? (v.count || 0) : 0;
  const cashSales  = _mTotal(sbm['efectivo']);
  const transSales = _mTotal(sbm['transferencia']);
  const cardSales  = _mTotal(sbm['tarjeta']);
  const cashCount  = _mCount(sbm['efectivo']);
  const transCount = _mCount(sbm['transferencia']);
  const cardCount  = _mCount(sbm['tarjeta']);
  const diff       = reg.difference ?? 0;
  const diffSign   = diff >= 0 ? '+' : '';
  const expectedEf = reg.opening_balance + cashSales + (reg.total_in || 0) - (reg.total_out || 0);

  // ── Fetch: movimientos del turno + ventas del mes ────
  let egresosDelTurno = [];
  let evaluacion = null;
  try {
    const [movs, ventasMes] = await Promise.all([
      api('GET', `/api/movements?from=${dayStr}&to=${dayStr}`),
      api('GET', `/api/acc-ventas-dia?from=${monthFrom}&to=${monthTo}`),
    ]);

    // Solo movimientos dentro del rango de este turno
    egresosDelTurno = movs.filter(m => {
      const t = new Date(m.created_at);
      return t >= openedDate && t <= closedDate &&
        (m.type === 'egreso' || (m.type === 'ingreso' && !m.description.startsWith('Venta #')));
    });

    // Evaluación del día vs mes
    const rows = (ventasMes.rows || []).filter(r => r.total > 0);
    if (rows.length > 0 && reg.total_sales > 0) {
      const totales = rows.map(r => r.total);
      const maxVal  = Math.max(...totales);
      const avg     = totales.reduce((s,v) => s+v, 0) / totales.length;
      const ratio   = reg.total_sales / avg;
      if (reg.total_sales >= maxVal) {
        evaluacion = { emoji:'🏆', color:'#f59e0b', bg:'#fffbeb', label:'¡Mejor día del mes!',
          sub:`Récord mensual superado — ${fmt(reg.total_sales)}` };
      } else if (ratio >= 1.2) {
        evaluacion = { emoji:'🔥', color:'#16a34a', bg:'#f0fdf4', label:'Excelente día',
          sub:`${Math.round(ratio*100-100)}% por encima del promedio mensual` };
      } else if (ratio >= 0.85) {
        evaluacion = { emoji:'✅', color:'#2563eb', bg:'#eff6ff', label:'Día normal',
          sub:`Dentro del promedio del mes (${fmt(Math.round(avg))}/día)` };
      } else if (ratio >= 0.5) {
        evaluacion = { emoji:'📉', color:'#d97706', bg:'#fffbeb', label:'Por debajo del promedio',
          sub:`${Math.round(100-ratio*100)}% menos que el promedio mensual` };
      } else {
        evaluacion = { emoji:'😔', color:'#dc2626', bg:'#fef2f2', label:'Día difícil',
          sub:`Ventas muy bajas comparado al resto del mes` };
      }
    }
  } catch(e) { console.error(e); }

  // ── Render compacto (todo en pantalla, sin scroll) ──
  const fmtHora = iso => new Date(iso).toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });

  const evalBanner = evaluacion ? `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;background:${evaluacion.bg};border:1.5px solid ${evaluacion.color}33;margin-bottom:10px">
      <span style="font-size:26px;line-height:1">${evaluacion.emoji}</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:800;color:${evaluacion.color};line-height:1.2">${evaluacion.label}</div>
        <div style="font-size:11px;color:#64748b">${evaluacion.sub}</div>
      </div>
    </div>` : '';

  const egresosHTML = egresosDelTurno.length ? `
    <div style="margin-top:8px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:4px">💸 Salidas</div>
      ${egresosDelTurno.map(m => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
          <span style="color:#94a3b8;white-space:nowrap;min-width:38px">${fmtHora(m.created_at)}</span>
          <span style="flex:1;color:#334155;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.description}</span>
          <span style="font-weight:800;color:${m.type==='egreso'?'#dc2626':'#16a34a'};white-space:nowrap">${m.type==='egreso'?'−':'+'}${fmt(m.amount)}</span>
        </div>`).join('')}
    </div>` : '';

  document.getElementById('modal-historial-body').innerHTML = `
    <div style="font-size:13px">

      ${evalBanner}

      <!-- Responsable + duración -->
      <div style="display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-radius:8px;padding:8px 12px;margin-bottom:10px;gap:8px">
        <div>
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px">Responsable</div>
          <div style="font-size:14px;font-weight:800;margin-top:1px">${responsable || '—'}</div>
          ${turnoLabel ? `<div style="font-size:11px;color:#94a3b8">${turnoLabel}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.4px">Turno</div>
          <div style="font-size:11px;font-weight:600;margin-top:1px">${opened}</div>
          <div style="font-size:11px;color:#94a3b8">→ ${closed}</div>
        </div>
      </div>

      <!-- Ventas por método (fila compacta) -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
        <div style="background:#f0fdf4;border-radius:8px;padding:8px 6px;text-align:center;border:1px solid #bbf7d0">
          <div style="font-size:9px;font-weight:700;color:#16a34a;text-transform:uppercase;margin-bottom:2px">💵 Efectivo</div>
          <div style="font-size:15px;font-weight:900;color:#15803d">${fmt(cashSales)}</div>
          <div style="font-size:10px;color:#16a34a;font-weight:600;margin-top:1px">${cashCount} venta${cashCount===1?'':'s'}</div>
        </div>
        <div style="background:#eff6ff;border-radius:8px;padding:8px 6px;text-align:center;border:1px solid #bfdbfe">
          <div style="font-size:9px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:2px">📲 Transfer.</div>
          <div style="font-size:15px;font-weight:900;color:#1d4ed8">${fmt(transSales)}</div>
          <div style="font-size:10px;color:#2563eb;font-weight:600;margin-top:1px">${transCount} venta${transCount===1?'':'s'}</div>
        </div>
        <div style="background:#faf5ff;border-radius:8px;padding:8px 6px;text-align:center;border:1px solid #e9d5ff">
          <div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:2px">💳 Tarjeta</div>
          <div style="font-size:15px;font-weight:900;color:#6d28d9">${fmt(cardSales)}</div>
          <div style="font-size:10px;color:#7c3aed;font-weight:600;margin-top:1px">${cardCount} venta${cardCount===1?'':'s'}</div>
        </div>
      </div>

      <!-- Total vendido -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:#0f172a;border-radius:8px;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Total vendido</span>
        <span style="font-size:22px;font-weight:900;color:#FC4C02">${fmt(reg.total_sales)}</span>
      </div>

      <!-- Arqueo: 2 columnas -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
        <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">🏦 Arqueo</div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:#64748b">Fondo</span><strong>${fmt(reg.opening_balance)}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:#64748b">Ef. ventas</span><strong style="color:#16a34a">+${fmt(cashSales)}</strong></div>
          ${(reg.total_out||0)>0?`<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="color:#64748b">Salidas</span><strong style="color:#dc2626">-${fmt(reg.total_out||0)}</strong></div>`:''}
          <div style="border-top:1px dashed var(--border);margin:5px 0"></div>
          <div style="display:flex;justify-content:space-between"><span style="color:#64748b;font-size:11px">Esperado</span><strong style="font-size:12px">${fmt(expectedEf)}</strong></div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">✅ Conteo</div>
          <div style="text-align:center;padding:8px 0">
            <div style="font-size:22px;font-weight:900;color:#0f172a">${fmt(reg.counted_cash ?? 0)}</div>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px">Efectivo contado</div>
          </div>
          <div style="border-top:1px dashed var(--border);margin:5px 0"></div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="color:#64748b;font-size:11px">Diferencia</span>
            <strong style="font-size:14px;color:${diff>=0?'#16a34a':'#dc2626'}">${diffSign}${fmt(diff)}</strong>
          </div>
        </div>
      </div>

      ${egresosHTML}
      ${notaExtra ? `<div style="margin-top:8px;padding:7px 10px;background:#f8fafc;border-radius:7px;font-size:11px;color:#64748b">📝 ${notaExtra}</div>` : ''}
    </div>
  `;
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
  { valor: 100000, emoji: '💵', color: '#fff3e0' },
  { valor:  50000, emoji: '💵', color: '#fce4ec' },
  { valor:  20000, emoji: '💵', color: '#e3f2fd' },
  { valor:  10000, emoji: '💵', color: '#f3e5f5' },
  { valor:   5000, emoji: '💵', color: '#e0f7fa' },
  { valor:   2000, emoji: '💵', color: '#fff9c4' },
];

const MONEDAS = [
  { valor: 1000, emoji: '🪙', color: '#e8eaf6' },
  { valor:  500, emoji: '🪙', color: '#fff9c4' },
  { valor:  200, emoji: '🪙', color: '#fce4ec' },
  { valor:  100, emoji: '🪙', color: '#f5f5f5' },
  { valor:   50, emoji: '🪙', color: '#fff8e1' },
];

var _billetesTarget = 'cierre'; // 'cierre' | 'apertura'

function abrirContadorBilletes() {
  _billetesTarget = 'cierre';
  renderDenomGrid('billetes-grid', BILLETES);
  renderDenomGrid('monedas-grid', MONEDAS);
  calcBilletesTotal();
  openModal('modal-billetes');
}

function abrirContadorApertura() {
  _billetesTarget = 'apertura';
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

var _billetesTotalRaw = 0; // valor numérico exacto (evitar parsear texto formateado)

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
  _billetesTotalRaw = total;
  document.getElementById('billetes-total').textContent = fmt(total);
}

function aplicarConteo() {
  const valor = _billetesTotalRaw || 0;

  if (_billetesTarget === 'apertura') {
    const inp = document.getElementById('apertura-fondo');
    if (inp) inp.value = valor;
    closeModal('modal-billetes');
    return;
  }

  // Target: cierre
  const input = document.getElementById('cierre-contado-efectivo');
  if (input) {
    input.value = valor;
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
  try {
    _lossProducts = await api('GET', '/api/products');
    const sel = document.getElementById('loss-product');
    sel.innerHTML = '<option value="">— Seleccionar producto —</option>' +
      _lossProducts.map(p =>
        `<option value="${p.id}" data-unit="${p.unit}" data-name="${p.name}" data-price="${p.price}">${p.name} (${p.stock} ${p.unit})</option>`
      ).join('');
    document.getElementById('loss-quantity').value = '';
    document.getElementById('loss-reason-select').value = 'Caducidad';
    document.getElementById('loss-reason-other').style.display = 'none';
    document.getElementById('loss-reason-other').value = '';
    document.getElementById('loss-responsible').value = '';
    document.getElementById('loss-notes').value = '';
    document.getElementById('loss-unit-label').textContent = '';
    document.getElementById('loss-value-preview').textContent = '';
    document.getElementById('loss-category').value = 'General';
    openModal('modal-loss');
  } catch (e) { toast(e.message, 'error'); }
}

function updateLossUnit() {
  const sel = document.getElementById('loss-product');
  const opt = sel.options[sel.selectedIndex];
  const unit = opt?.dataset?.unit || '';
  document.getElementById('loss-unit-label').textContent = unit ? `(${unit})` : '';
  updateLossValue();
}

function updateLossValue() {
  const sel = document.getElementById('loss-product');
  const opt = sel.options[sel.selectedIndex];
  const price = parseFloat(opt?.dataset?.price || 0);
  const qty   = parseFloat(document.getElementById('loss-quantity').value || 0);
  const preview = document.getElementById('loss-value-preview');
  if (price > 0 && qty > 0) {
    preview.textContent = `= ${fmt(price * qty)}`;
  } else {
    preview.textContent = '';
  }
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
  const unit  = productId ? opt.dataset.unit  : 'unidad';
  const price = parseFloat(opt?.dataset?.price || 0);
  const quantity = parseFloat(document.getElementById('loss-quantity').value);
  const reasonSel = document.getElementById('loss-reason-select').value;
  const reason = reasonSel === 'Otro'
    ? (document.getElementById('loss-reason-other').value.trim() || 'Otro')
    : reasonSel;
  const responsible = document.getElementById('loss-responsible').value.trim();
  const notes    = document.getElementById('loss-notes').value.trim();
  const category = document.getElementById('loss-category').value || 'General';
  const sale_value = price > 0 && quantity > 0 ? price * quantity : 0;

  if (!productId) { toast('Selecciona un producto', 'error'); return; }
  if (!quantity || quantity <= 0) { toast('Ingresa una cantidad válida', 'error'); return; }
  if (!responsible) { toast('Ingresa el nombre del responsable', 'error'); return; }

  try {
    await api('POST', '/api/losses', { product_id: productId, product_name: productName, quantity, unit, reason, responsible, notes, sale_value, category });
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
//  TAREAS
// ═══════════════════════════════════════════════════════
async function loadTasks() {
  const isAdmin = _userRole === 'admin';
  document.getElementById('tasks-admin-view').style.display = isAdmin ? '' : 'none';
  document.getElementById('tasks-worker-view').style.display = isAdmin ? 'none' : '';

  const tasks = await api('GET', '/api/tasks');

  if (isAdmin) {
    const tbody = document.querySelector('#tasks-admin-table tbody');
    tbody.innerHTML = tasks.length === 0
      ? '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px">Sin tareas creadas</td></tr>'
      : tasks.map(t => `
        <tr style="opacity:${t.status==='realizado'?'0.6':'1'}">
          <td>${t.funcion}</td>
          <td>${t.area || '—'}</td>
          <td>${t.assigned_to || '—'}</td>
          <td><span class="badge ${t.status==='realizado'?'badge-success':'badge-warning'}">${t.status==='realizado'?'✅ Realizado':'⏳ Pendiente'}</span></td>
          <td style="font-size:12px;color:var(--text-muted)">${fmtDate(t.created_at)}</td>
          <td><button class="btn btn-outline btn-sm" style="color:#ef4444;border-color:#ef4444" onclick="deleteTask(${t.id})">🗑</button></td>
        </tr>`).join('');
  } else {
    const grid = document.getElementById('tasks-worker-grid');
    const empty = document.getElementById('tasks-worker-empty');
    const pending = tasks.filter(t => t.status === 'pendiente');
    const done = tasks.filter(t => t.status === 'realizado');

    if (tasks.length === 0) {
      grid.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = [...pending, ...done].map(t => `
      <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);border-left:4px solid ${t.status==='realizado'?'#22c55e':'#f59e0b'};opacity:${t.status==='realizado'?'0.65':'1'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <span class="badge ${t.status==='realizado'?'badge-success':'badge-warning'}">${t.status==='realizado'?'✅ Realizado':'⏳ Pendiente'}</span>
        </div>
        <div style="font-weight:700;font-size:15px;margin-bottom:8px">${t.funcion}</div>
        ${t.area ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:4px">📍 Área: <strong>${t.area}</strong></div>` : ''}
        ${t.assigned_to ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">👤 Para: <strong>${t.assigned_to}</strong></div>` : ''}
        ${t.status === 'pendiente'
          ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-top:8px" onclick="completeTask(${t.id})">✅ Marcar como realizado</button>`
          : `<div style="font-size:12px;color:#16a34a;margin-top:8px">Completada ${t.completed_at ? fmtDate(t.completed_at) : ''}</div>`
        }
      </div>`).join('');
  }
}

async function createTask() {
  const funcion = document.getElementById('task-funcion').value.trim();
  const area    = document.getElementById('task-area').value.trim();
  const assigned_to = document.getElementById('task-assigned').value.trim();
  if (!funcion) { toast('Ingresa la función o descripción', 'error'); return; }
  await api('POST', '/api/tasks', { funcion, area, assigned_to });
  document.getElementById('task-funcion').value = '';
  document.getElementById('task-area').value = '';
  document.getElementById('task-assigned').value = '';
  toast('Tarea creada', 'success');
  loadTasks();
}

async function completeTask(id) {
  await api('PUT', `/api/tasks/${id}/status`, { status: 'realizado' });
  toast('¡Tarea completada!', 'success');
  loadTasks();
}

async function deleteTask(id) {
  await api('DELETE', `/api/tasks/${id}`);
  toast('Tarea eliminada', '');
  loadTasks();
}

// ═══════════════════════════════════════════════════════
//  TRABAJADORES
// ═══════════════════════════════════════════════════════
var _activeWorkerId   = null;
var _activeWorkerName = '';
var _activeWorkerTab  = 'resumen';

const WORKER_AVATARS = { 'Camila':'👩', 'Daniela':'👩‍🦱', 'Juan':'👨' };
const WORKER_COLORS  = { 'Camila':'#e11d48', 'Daniela':'#7c3aed', 'Juan':'#0284c7' };

function openWorkersScreen() {
  document.getElementById('workers-screen').style.display = 'flex';
  loadWorkers();
}

function closeWorkersScreen() {
  document.getElementById('workers-screen').style.display = 'none';
  document.getElementById('terminal-screen').style.display = 'flex';
}

async function loadWorkers() {
  const workers = await api('GET', '/api/workers');
  const grid = document.getElementById('workers-grid');
  if (!workers.length) {
    grid.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;font-size:15px">Sin trabajadores</div>';
    return;
  }
  // Cargar stats de todos en paralelo
  const statsArr = await Promise.all(workers.map(w => api('GET', `/api/workers/${w.id}/stats`).catch(() => null)));
  grid.innerHTML = workers.map((w, i) => {
    const s = statsArr[i] || {};
    const avatar = WORKER_AVATARS[w.name] || '👤';
    const color  = WORKER_COLORS[w.name] || 'var(--primary)';
    const descuadres = s.descuadres?.count ?? 0;
    const perdidas   = s.perdidas?.count ?? 0;
    const tareas     = s.tareas?.pendientes ?? 0;
    return `
    <div class="worker-card" style="border-top-color:${color}" onclick="openWorkerDetail(${w.id},'${w.name.replace(/'/g,"\\'")}','${w.cargo || ''}')">
      <span class="worker-card-avatar">${avatar}</span>
      <div class="worker-card-name">${w.name}</div>
      <div class="worker-card-cargo">💼 ${w.cargo || 'Empleado/a'}</div>
      <div class="worker-card-stats">
        <div class="worker-card-stat ${descuadres > 0 ? 'danger' : ''}">
          <div class="worker-card-stat-num">${descuadres}</div>
          <div class="worker-card-stat-lbl">Descuadres</div>
        </div>
        <div class="worker-card-stat ${perdidas > 0 ? 'warn' : ''}">
          <div class="worker-card-stat-num">${perdidas}</div>
          <div class="worker-card-stat-lbl">Pérdidas</div>
        </div>
        <div class="worker-card-stat ${tareas > 0 ? 'ok' : ''}">
          <div class="worker-card-stat-num">${tareas}</div>
          <div class="worker-card-stat-lbl">Tareas</div>
        </div>
      </div>
      <div class="worker-card-cta">Ver perfil →</div>
    </div>`;
  }).join('');
}

async function openWorkerDetail(id, name, cargo) {
  _activeWorkerId   = id;
  _activeWorkerName = name;
  const avatar = WORKER_AVATARS[name] || '👤';
  const color  = WORKER_COLORS[name] || 'var(--primary)';
  document.getElementById('worker-detail-header').style.background = color;
  document.getElementById('worker-detail-avatar').textContent = avatar;
  document.getElementById('worker-detail-name').textContent   = name;
  document.getElementById('worker-detail-cargo').textContent  = cargo || 'Empleado/a';
  document.getElementById('worker-detail-screen').style.display = 'flex';
  switchWorkerTab('resumen');
}

function closeWorkerDetail() {
  document.getElementById('worker-detail-screen').style.display = 'none';
  loadWorkers(); // refrescar stats al volver
}

function switchWorkerTab(tab) {
  _activeWorkerTab = tab;
  ['resumen','notas','hoja'].forEach(t => {
    document.getElementById(`wtab-${t}`).classList.toggle('active', t === tab);
    document.getElementById(`wpanel-${t}`).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'resumen') loadWorkerStats();
  if (tab === 'notas')   loadWorkerNotesList();
  if (tab === 'hoja')    { loadWorkerAnnotations(); loadWorkerDocuments(); }
}

async function loadWorkerStats() {
  try {
    const s = await api('GET', `/api/workers/${_activeWorkerId}/stats`);
    document.getElementById('ws-descuadres-count').textContent = s.descuadres.count;
    document.getElementById('ws-descuadres-total').textContent = s.descuadres.total > 0 ? `Total: ${fmt(s.descuadres.total)}` : '';
    document.getElementById('ws-perdidas-count').textContent = s.perdidas.count;
    document.getElementById('ws-perdidas-valor').textContent  = s.perdidas.valor > 0 ? fmt(s.perdidas.valor) : '';
    document.getElementById('ws-tareas-pend').textContent = s.tareas.pendientes;
    document.getElementById('ws-tareas-total').textContent = `De ${s.tareas.total} totales`;

    const listEl = document.getElementById('ws-descuadres-list');
    let html = '';

    // Pérdidas
    if (s.perdidas_list && s.perdidas_list.length) {
      const REASON_ICON = { 'Caducidad':'🗓️','Daño':'💥','Robo':'🚨','Error de preparación':'👨‍🍳','Merma':'📉' };
      html += `
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:10px;margin-top:4px">📦 Pérdidas registradas</div>
        <div style="background:#fff;border-radius:12px;overflow:hidden;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06)">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Producto</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Categoría</th>
                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Motivo</th>
                <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Cantidad</th>
                <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Valor</th>
              </tr>
            </thead>
            <tbody>
              ${s.perdidas_list.map(p => `
                <tr style="border-bottom:1px solid #f1f5f9">
                  <td style="padding:10px 14px;font-weight:600;color:#0f172a">${p.product_name}</td>
                  <td style="padding:10px 14px;color:#64748b">${p.category || '—'}</td>
                  <td style="padding:10px 14px">
                    <span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700">
                      ${REASON_ICON[p.reason] || '⚠️'} ${p.reason}
                    </span>
                  </td>
                  <td style="padding:10px 14px;text-align:right;color:#64748b">${p.quantity} ${p.unit}</td>
                  <td style="padding:10px 14px;text-align:right;font-weight:700;color:${p.sale_value > 0 ? '#dc2626' : '#94a3b8'}">
                    ${p.sale_value > 0 ? fmt(p.sale_value) : '—'}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Descuadres
    if (s.ultimos_descuadres && s.ultimos_descuadres.length) {
      html += `
        <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:10px">💸 Últimos descuadres de caja</div>
        ${s.ultimos_descuadres.map(d => `
          <div style="background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.06);display:flex;justify-content:space-between;align-items:center;border-left:4px solid #ef4444">
            <div>
              <div style="font-size:13px;font-weight:700;color:#0f172a">${fmtDate(d.closed_at || d.opened_at)}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px">${d.notes || ''}</div>
            </div>
            <div style="font-weight:800;color:#ef4444;font-size:16px">-${fmt(Math.abs(d.difference))}</div>
          </div>`).join('')}`;
    }

    if (!html) {
      html = `<div style="text-align:center;padding:32px;color:#94a3b8;font-size:14px">✅ Sin incidentes registrados</div>`;
    }
    listEl.innerHTML = html;
  } catch(e) { /* ignore */ }
}

// tipos de cada sección
const NOTAS_TYPES = ['nota', 'llamado', 'logro'];
const HOJA_TYPES  = ['llegada_tarde', 'ausencia_inj', 'ausencia_just', 'incidente', 'observacion', 'felicitacion'];

async function loadWorkerNotesList() {
  const allNotes = await api('GET', `/api/workers/${_activeWorkerId}/notes`);
  // Solo mostrar notas del tab "Notas" (no anotaciones de hoja de vida)
  const notes = allNotes.filter(n => !HOJA_TYPES.includes(n.note_type));
  const list = document.getElementById('worker-notes-list');
  if (!notes.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">Sin notas aún</div>';
    return;
  }
  const typeLabel = { nota:'📝 Nota general', llamado:'⚠️ Llamado de atención', logro:'🏆 Logro' };
  list.innerHTML = notes.map(n => `
    <div style="background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px;border-left:4px solid #3b82f6;box-shadow:0 1px 4px rgba(0,0,0,.06);position:relative"
      class="${n.note_type === 'llamado' ? 'note-type-llamado' : n.note_type === 'logro' ? 'note-type-logro' : 'note-type-nota'}">
      <span class="note-type-badge ${n.note_type || 'nota'}">${typeLabel[n.note_type] || '📝 Nota'}</span>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;padding-right:28px;margin-top:4px">${n.content}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${fmtDate(n.created_at)}</div>
      <button onclick="deleteWorkerNote(${n.id})"
        style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;color:#cbd5e1;font-size:16px;line-height:1">✕</button>
    </div>`).join('');
}

async function saveWorkerNote() {
  const content   = document.getElementById('worker-note-input').value.trim();
  const note_type = document.getElementById('worker-note-type')?.value || 'nota';
  if (!content) { toast('Escribe una nota primero', 'error'); return; }
  await api('POST', `/api/workers/${_activeWorkerId}/notes`, { content, note_type });
  document.getElementById('worker-note-input').value = '';
  toast('Nota guardada', 'success');
  await loadWorkerNotesList();
}

async function deleteWorkerNote(id) {
  if (!confirm('¿Eliminar esta nota?')) return;
  await api('DELETE', `/api/workers/notes/${id}`);
  await loadWorkerNotesList();
}

// ── Hoja de vida: anotaciones ────────────────────────
const ANN_CONFIG = {
  llegada_tarde:  { icon:'🕐', label:'Llegada tarde',          color:'#f97316', bg:'#fff7ed', border:'#f97316' },
  ausencia_inj:   { icon:'❌', label:'Ausencia injustificada',  color:'#ef4444', bg:'#fef2f2', border:'#ef4444' },
  ausencia_just:  { icon:'✅', label:'Ausencia justificada',    color:'#16a34a', bg:'#f0fdf4', border:'#16a34a' },
  incidente:      { icon:'⚠️', label:'Incidente',              color:'#d97706', bg:'#fffbeb', border:'#d97706' },
  observacion:    { icon:'📋', label:'Observación general',    color:'#6366f1', bg:'#f5f3ff', border:'#6366f1' },
  felicitacion:   { icon:'🌟', label:'Felicitación / Logro',   color:'#0284c7', bg:'#f0f9ff', border:'#0284c7' },
};

async function loadWorkerAnnotations() {
  const allNotes = await api('GET', `/api/workers/${_activeWorkerId}/notes`);
  const anns = allNotes.filter(n => HOJA_TYPES.includes(n.note_type));
  const list = document.getElementById('worker-ann-list');
  if (!anns.length) {
    list.innerHTML = '<div style="text-align:center;padding:28px;color:var(--text-muted);font-size:14px">Sin anotaciones aún</div>';
    return;
  }
  list.innerHTML = anns.map(n => {
    const cfg = ANN_CONFIG[n.note_type] || { icon:'📌', label:n.note_type, color:'#64748b', bg:'#f8fafc', border:'#e2e8f0' };
    return `
    <div style="background:${cfg.bg};border-radius:10px;padding:14px 16px;margin-bottom:10px;border-left:4px solid ${cfg.border};position:relative;box-shadow:0 1px 3px rgba(0,0,0,.05)">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
        <span style="font-size:16px">${cfg.icon}</span>
        <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:${cfg.color}">${cfg.label}</span>
      </div>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;padding-right:28px;color:#1e293b">${n.content}</div>
      <div style="font-size:11px;color:${cfg.color};margin-top:6px;font-weight:600">${fmtDate(n.created_at)}</div>
      <button onclick="deleteWorkerAnnotation(${n.id})"
        style="position:absolute;top:10px;right:10px;background:none;border:none;cursor:pointer;color:#cbd5e1;font-size:16px;line-height:1">✕</button>
    </div>`;
  }).join('');
}

async function saveWorkerAnnotation() {
  const content   = document.getElementById('wann-content').value.trim();
  const note_type = document.getElementById('wann-type').value;
  if (!content) { toast('Escribe una descripción', 'error'); return; }
  await api('POST', `/api/workers/${_activeWorkerId}/notes`, { content, note_type });
  document.getElementById('wann-content').value = '';
  toast('Anotación guardada', 'success');
  await loadWorkerAnnotations();
}

async function deleteWorkerAnnotation(id) {
  if (!confirm('¿Eliminar esta anotación?')) return;
  await api('DELETE', `/api/workers/notes/${id}`);
  await loadWorkerAnnotations();
}

// ── Hoja de vida: documentos ─────────────────────────
async function loadWorkerDocuments() {
  const docs = await api('GET', `/api/workers/${_activeWorkerId}/documents`);
  const list = document.getElementById('worker-docs-list');
  if (!docs.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:14px">Sin documentos aún</div>';
    return;
  }
  const docIcons = { descargo:'📄', llamado:'⚠️', contrato:'📋', certificado:'🏅', general:'📁' };
  const docLabels = { descargo:'Descargo', llamado:'Llamado de atención', contrato:'Contrato / Acuerdo', certificado:'Certificado', general:'Otro documento' };
  list.innerHTML = docs.map(d => `
    <div class="wdoc-item">
      <div class="wdoc-icon">${docIcons[d.doc_type] || '📁'}</div>
      <div class="wdoc-body">
        <div class="wdoc-type">${docLabels[d.doc_type] || d.doc_type}</div>
        <div class="wdoc-desc">${d.description || '—'}</div>
        <div class="wdoc-date">${fmtDate(d.created_at)}</div>
        ${d.filename ? `<a href="/uploads/workers/${d.filename}" target="_blank"
          style="font-size:12px;color:var(--primary);font-weight:600;text-decoration:none;margin-top:4px;display:inline-block">
          📎 Ver / Descargar: ${d.original_name || d.filename}</a>` : ''}
      </div>
      <div class="wdoc-actions">
        <button onclick="deleteWorkerDocument(${d.id})" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:18px" title="Eliminar">🗑️</button>
      </div>
    </div>`).join('');
}

async function saveWorkerDocument() {
  const doc_type    = document.getElementById('wdoc-type').value;
  const description = document.getElementById('wdoc-desc').value.trim();
  const fileInput   = document.getElementById('wdoc-file');
  const file        = fileInput.files[0];
  if (!description && !file) { toast('Agrega descripción o archivo', 'error'); return; }

  const fd = new FormData();
  fd.append('doc_type', doc_type);
  fd.append('description', description);
  if (file) fd.append('file', file);

  try {
    await fetch(`/api/workers/${_activeWorkerId}/documents`, { method: 'POST', body: fd });
    document.getElementById('wdoc-desc').value = '';
    fileInput.value = '';
    toast('Documento guardado', 'success');
    await loadWorkerDocuments();
  } catch(e) { toast('Error al guardar', 'error'); }
}

async function deleteWorkerDocument(id) {
  if (!confirm('¿Eliminar este documento?')) return;
  await api('DELETE', `/api/workers/documents/${id}`);
  toast('Documento eliminado', '');
  await loadWorkerDocuments();
}

// ═══════════════════════════════════════════════════════
//  DESCUENTOS Y MODIFICACIÓN DE PRECIOS
// ═══════════════════════════════════════════════════════

var _orderDiscount = { type: 'percent', value: 0 }; // type: 'percent' | 'fixed'
var _editPriceProductId = null;

// Total con descuento aplicado
function getCartTotal() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  if (!_orderDiscount.value) return subtotal;
  if (_orderDiscount.type === 'percent') {
    const pct = Math.min(100, Math.max(0, _orderDiscount.value));
    return Math.max(0, subtotal * (1 - pct / 100));
  } else {
    return Math.max(0, subtotal - _orderDiscount.value);
  }
}

function getDiscountAmount() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  return Math.max(0, subtotal - getCartTotal());
}

// Actualizar display de subtotal, descuento y total en el carrito
function updateDiscountDisplay() {
  const subtotal  = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discAmt   = getDiscountAmount();
  const total     = getCartTotal();
  const subEl     = document.getElementById('cart-subtotal');
  const discAmtEl = document.getElementById('cart-discount-amount');
  const totalEl   = document.getElementById('cart-total');
  if (subEl)     subEl.textContent    = fmt(subtotal);
  if (discAmtEl) discAmtEl.textContent = discAmt > 0 ? '-' + fmt(discAmt) : '-$0';
  if (totalEl)   totalEl.textContent  = fmt(total);
}

// Mostrar/ocultar panel de descuento del pedido
function toggleDiscountPanel() {
  const row     = document.getElementById('cart-discount-row');
  const subRow  = document.getElementById('cart-subtotal-row');
  const btn     = document.getElementById('btn-add-discount');
  const isOpen  = row.style.display !== 'none';
  if (isOpen) {
    clearOrderDiscount();
  } else {
    row.style.display = '';
    subRow.style.display = '';
    if (btn) btn.textContent = '🏷 desc. ✓';
    setTimeout(() => document.getElementById('cart-discount-input')?.focus(), 50);
  }
}

// Alternar tipo % / $ fijo
function toggleDiscountType() {
  const btn = document.getElementById('disc-type-btn');
  if (_orderDiscount.type === 'percent') {
    _orderDiscount.type = 'fixed';
    if (btn) { btn.textContent = '$'; btn.style.background = '#8b5cf6'; }
  } else {
    _orderDiscount.type = 'percent';
    if (btn) { btn.textContent = '%'; btn.style.background = 'var(--primary)'; }
  }
  document.getElementById('cart-discount-input').value = '';
  _orderDiscount.value = 0;
  updateDiscountDisplay();
}

// Aplicar descuento desde input manual
function applyOrderDiscount() {
  _orderDiscount.value = parseFloat(document.getElementById('cart-discount-input').value) || 0;
  updateDiscountDisplay();
}

// Descuentos rápidos de pedido
function quickDiscount(pct) {
  _orderDiscount.type  = 'percent';
  _orderDiscount.value = pct;
  const btn = document.getElementById('disc-type-btn');
  if (btn) { btn.textContent = '%'; btn.style.background = 'var(--primary)'; }
  document.getElementById('cart-discount-input').value = pct;
  updateDiscountDisplay();
}

// Quitar descuento del pedido
function clearOrderDiscount() {
  _orderDiscount = { type: 'percent', value: 0 };
  const row    = document.getElementById('cart-discount-row');
  const subRow = document.getElementById('cart-subtotal-row');
  const inp    = document.getElementById('cart-discount-input');
  const btn    = document.getElementById('btn-add-discount');
  const typeBtn= document.getElementById('disc-type-btn');
  if (row)    row.style.display = 'none';
  if (subRow) subRow.style.display = 'none';
  if (inp)    inp.value = '';
  if (btn)    btn.textContent = '🏷 desc.';
  if (typeBtn){ typeBtn.textContent = '%'; typeBtn.style.background = 'var(--primary)'; }
  updateDiscountDisplay();
}

// ── POR ITEM ──────────────────────────────────────────

// Abrir modal de edición de precio para un item
function editItemPrice(productId) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  _editPriceProductId = productId;
  document.getElementById('edit-price-product-name').textContent = item.product_name;
  document.getElementById('edit-price-input').value = item.price;
  document.getElementById('edit-price-original').textContent = fmt(item.originalPrice || item.price);
  // Limpiar estado activo de botones rápidos
  document.querySelectorAll('#modal-edit-price .disc-quick-btn').forEach(b => b.classList.remove('active'));
  openModal('modal-edit-price');
  setTimeout(() => {
    const inp = document.getElementById('edit-price-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 100);
}

// Aplicar nuevo precio del item
function applyEditPrice() {
  const item = cart.find(i => i.product_id === _editPriceProductId);
  if (!item) return;
  const newPrice = parseFloat(document.getElementById('edit-price-input').value);
  if (isNaN(newPrice) || newPrice < 0) { toast('Precio inválido', 'error'); return; }
  if (!item.originalPrice) item.originalPrice = item.price;
  item.price = newPrice;
  closeModal('modal-edit-price');
  renderCart();
  scheduleAccountSave();
  toast('Precio modificado', 'success');
}

// Aplicar % de descuento al item en el modal
function applyItemDiscountPct(pct) {
  const item = cart.find(i => i.product_id === _editPriceProductId);
  if (!item) return;
  const orig = item.originalPrice || item.price;
  const newPrice = Math.round(orig * (1 - pct / 100));
  document.getElementById('edit-price-input').value = newPrice;
  document.querySelectorAll('#modal-edit-price .disc-quick-btn').forEach(b => b.classList.remove('active'));
  // Marcar el botón activo (buscar por texto)
  document.querySelectorAll('#modal-edit-price .disc-quick-btn').forEach(b => {
    if (b.textContent.trim() === pct + '%') b.classList.add('active');
  });
}

// Restablecer precio original del item
function resetItemPrice() {
  const item = cart.find(i => i.product_id === _editPriceProductId);
  if (!item) return;
  document.getElementById('edit-price-input').value = item.originalPrice || item.price;
  document.querySelectorAll('#modal-edit-price .disc-quick-btn').forEach(b => b.classList.remove('active'));
}

// ═══════════════════════════════════════════════════════
//  CHECKLIST DE TURNO
// ═══════════════════════════════════════════════════════
let _checklistTurno = 'apertura'; // turno activo del checklist

function initChecklistPage() {
  // Poner fecha de hoy
  const today = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById('cl-date');
  if (dateEl) dateEl.value = today;

  // Mostrar u ocultar badge "Hoy"
  _updateTodayBadge();

  // Mostrar botón agregar solo para admin
  const adminActions = document.getElementById('cl-admin-actions');
  if (adminActions) adminActions.style.display = _userRole === 'admin' ? '' : 'none';

  // Cargar tab apertura por defecto
  _checklistTurno = 'apertura';
  document.getElementById('ctab-apertura').classList.add('active');
  document.getElementById('ctab-cierre').classList.remove('active');
  loadChecklist();
}

function toggleAddForm(show) {
  const form = document.getElementById('cl-add-form');
  if (!form) return;
  form.style.display = show ? '' : 'none';
  if (show) {
    // Pre-llenar la sección con la primera sección del tab activo
    const firstSection = document.querySelector('.cl-section-header span:first-child');
    const secEl = document.getElementById('cl-new-section');
    if (secEl && firstSection) secEl.value = firstSection.textContent.trim();
    document.getElementById('cl-new-text')?.focus();
  }
}

async function saveChecklistItem() {
  const text    = document.getElementById('cl-new-text')?.value.trim();
  const section = document.getElementById('cl-new-section')?.value.trim() || '';
  if (!text) { toast('Escribe la descripción', 'error'); return; }

  try {
    await api('POST', '/api/checklist/items', { turno: _checklistTurno, section, text });
    toast('✅ Función agregada', 'success');
    document.getElementById('cl-new-text').value = '';
    toggleAddForm(false);
    loadChecklist();
  } catch(e) {
    toast('Error al agregar', 'error');
  }
}

async function deleteChecklistItem(itemId, e) {
  e.stopPropagation(); // no toggle el ítem
  if (!confirm('¿Eliminar esta función del checklist?')) return;
  try {
    await api('DELETE', `/api/checklist/items/${itemId}`);
    toast('Función eliminada', 'success');
    loadChecklist();
  } catch(e) {
    toast('Error al eliminar', 'error');
  }
}

function switchChecklistTab(turno) {
  _checklistTurno = turno;
  document.getElementById('ctab-apertura').classList.toggle('active', turno === 'apertura');
  document.getElementById('ctab-cierre').classList.toggle('active',   turno === 'cierre');
  document.getElementById('ctab-aseo').classList.toggle('active',     turno === 'aseo');

  // Mostrar/ocultar secciones
  const clContent   = document.getElementById('checklist-content');
  const aseoContent = document.getElementById('aseo-content');
  const clAddForm   = document.getElementById('cl-add-form');
  const adminActions = document.getElementById('cl-admin-actions');

  if (turno === 'aseo') {
    if (clContent)   clContent.style.display   = 'none';
    if (aseoContent) aseoContent.style.display  = '';
    if (clAddForm)   clAddForm.style.display    = 'none';
    if (adminActions) adminActions.style.display = 'none';
    initAseoSection();
  } else {
    if (clContent)   clContent.style.display   = '';
    if (aseoContent) aseoContent.style.display  = 'none';
    if (adminActions) adminActions.style.display = _userRole === 'admin' ? '' : 'none';
    loadChecklist();
  }
}

function _updateTodayBadge() {
  const today = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById('cl-date');
  const badge = document.getElementById('cl-today-badge');
  if (!dateEl || !badge) return;
  badge.style.display = (dateEl.value === today) ? '' : 'none';
}

async function loadChecklist() {
  const dateEl = document.getElementById('cl-date');
  const date = dateEl ? dateEl.value : new Date().toISOString().slice(0, 10);
  _updateTodayBadge();

  const sectionsEl = document.getElementById('cl-sections');
  if (!sectionsEl) return;
  sectionsEl.innerHTML = `<div class="cl-empty"><div class="cl-empty-icon">⏳</div><div class="cl-empty-msg">Cargando...</div></div>`;

  try {
    const data = await api('GET', `/api/checklist?turno=${_checklistTurno}&date=${date}`);
    _renderChecklist(Array.isArray(data) ? data : (data.items || []));
  } catch(e) {
    sectionsEl.innerHTML = `<div class="cl-empty"><div class="cl-empty-icon">⚠️</div><div class="cl-empty-msg">Error cargando checklist</div></div>`;
  }
}

function _renderChecklist(items) {
  const sectionsEl = document.getElementById('cl-sections');
  if (!items.length) {
    sectionsEl.innerHTML = `<div class="cl-empty"><div class="cl-empty-icon">📋</div><div class="cl-empty-msg">Sin ítems</div><div class="cl-empty-sub">No hay ítems configurados para este turno</div></div>`;
    _updateProgress(0, 0);
    return;
  }

  const total = items.length;
  const done = items.filter(i => i.completed).length;
  _updateProgress(done, total);

  // Agrupar por sección
  const sections = {};
  items.forEach(item => {
    const sec = item.section || '';
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(item);
  });

  let html = '';
  Object.entries(sections).forEach(([sec, secItems]) => {
    const secDone = secItems.filter(i => i.completed).length;
    html += `<div class="cl-section">`;
    if (sec) {
      html += `<div class="cl-section-header">
        <span>${sec}</span>
        <span class="cl-section-count">${secDone}/${secItems.length}</span>
      </div>`;
    }
    secItems.forEach(item => {
      const cls = item.completed ? 'cl-item completed' : 'cl-item';
      const meta = item.completed && item.completed_by
        ? `✓ ${item.completed_by}` + (item.completed_at ? ` · ${item.completed_at.slice(11,16)}` : '')
        : '';
      const delBtn = _userRole === 'admin'
        ? `<button class="cl-item-del" onclick="deleteChecklistItem(${item.id}, event)" title="Eliminar">🗑</button>`
        : '';
      html += `<div class="${cls}" onclick="toggleChecklistItem(${item.id}, ${item.completed ? 'false' : 'true'})">
        <div class="cl-checkbox"><span class="cl-checkbox-tick">✓</span></div>
        <div class="cl-item-body">
          <div class="cl-item-text">${item.text}</div>
          ${meta ? `<div class="cl-item-meta">${meta}</div>` : ''}
        </div>
        ${delBtn}
      </div>`;
    });
    html += `</div>`;
  });

  sectionsEl.innerHTML = html;
}

function _updateProgress(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const fill = document.getElementById('cl-progress-fill');
  const label = document.getElementById('cl-progress-label');
  const pctBadge = document.getElementById('cl-progress-pct');

  if (label) label.textContent = `${done} de ${total} tareas completadas`;
  if (pctBadge) {
    pctBadge.textContent = `${pct}%`;
    pctBadge.classList.toggle('done', pct === 100);
  }
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.classList.toggle('done', pct === 100);
  }
}

async function toggleChecklistItem(itemId, completed) {
  const dateEl = document.getElementById('cl-date');
  const date = dateEl ? dateEl.value : new Date().toISOString().slice(0, 10);
  const completedBy = _userRole === 'admin' ? 'Admin' : 'Trabajador';

  try {
    await api('POST', '/api/checklist/toggle', {
      item_id: itemId,
      date,
      turno: _checklistTurno,
      completed,
      completed_by: completedBy
    });
    loadChecklist();
  } catch(e) {
    toast('Error al actualizar ítem', 'error');
  }
}


// ═══════════════════════════════════════════════════════
//  IMPORTAR INVENTARIO EXCEL
// ═══════════════════════════════════════════════════════
let _importFile = null;

function openImportModal() {
  _importFile = null;
  document.getElementById('import-file-name').textContent = 'Ningún archivo seleccionado';
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-submit-btn').disabled = true;
  document.getElementById('import-drop-area').classList.remove('has-file');
  document.getElementById('import-result').style.display = 'none';
  openModal('modal-import');
}

function handleImportFileSelect(e) {
  const file = e.target.files[0];
  if (file) _setImportFile(file);
}

function handleImportDrop(e) {
  e.preventDefault();
  document.getElementById('import-drop-area').classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file) _setImportFile(file);
}

function _setImportFile(file) {
  _importFile = file;
  document.getElementById('import-file-name').textContent = `📄 ${file.name}`;
  document.getElementById('import-drop-area').classList.add('has-file');
  document.getElementById('import-submit-btn').disabled = false;
  document.getElementById('import-result').style.display = 'none';
}

async function submitImport() {
  if (!_importFile) return;
  const btn = document.getElementById('import-submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Importando...';

  const formData = new FormData();
  formData.append('file', _importFile);

  try {
    const res = await fetch('/api/products/import', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Error al importar');

    // Mostrar resultado
    const resultEl = document.getElementById('import-result');
    let html = `
      <div class="import-result-ok">
        <div class="import-result-ok-title">✅ Importación completada</div>
        <div class="import-result-stats">
          <div class="import-stat">
            <div class="import-stat-num">${data.total}</div>
            <div class="import-stat-label">Total procesados</div>
          </div>
          <div class="import-stat">
            <div class="import-stat-num">${data.created}</div>
            <div class="import-stat-label">Productos nuevos</div>
          </div>
          <div class="import-stat orange">
            <div class="import-stat-num">${data.updated}</div>
            <div class="import-stat-label">Actualizados</div>
          </div>
        </div>`;
    if (data.errors && data.errors.length) {
      html += `<div class="import-errors">
        <div class="import-errors-title">⚠️ ${data.errors.length} advertencia(s)</div>
        ${data.errors.map(e => `<div class="import-error-item">· ${e}</div>`).join('')}
      </div>`;
    }
    html += '</div>';
    resultEl.innerHTML = html;
    resultEl.style.display = '';

    // Recargar inventario
    loadInventory();
    toast(`✅ ${data.created} nuevos · ${data.updated} actualizados`, 'success');

  } catch(err) {
    document.getElementById('import-result').innerHTML = `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;color:#dc2626;font-size:13px;font-weight:600">
        ⚠️ ${err.message}
      </div>`;
    document.getElementById('import-result').style.display = '';
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 Importar';
  }
}


// ═══════════════════════════════════════════════════════
//  NOVEDADES
// ═══════════════════════════════════════════════════════
let _novedadesTimer = null;
let _novTipo    = 'agotado';
let _novPersona = '';

const NOV_LABELS = {
  agotado:      { icon: '🛒', label: 'Se agotó' },
  dañado:       { icon: '🔧', label: 'Se dañó' },
  recordatorio: { icon: '🔔', label: 'Recordatorio' },
  otro:         { icon: '📋', label: 'Otro' },
};

function initNovedades() {
  // Mostrar FAB siempre (ambos roles)
  const fab = document.getElementById('nov-fab');
  if (fab) fab.style.display = 'flex';

  // Para admin: chequear novedades nuevas cada 30s
  if (_userRole === 'admin') {
    checkNuevasNovedades();
    _novedadesTimer = setInterval(checkNuevasNovedades, 30000);
  }
}

async function checkNuevasNovedades() {
  try {
    const items = await api('GET', '/api/novedades?nuevas=1');
    const count = items.length;
    _updateNovedadesBadges(count);
  } catch(e) {}
}

function _updateNovedadesBadges(count) {
  const badge    = document.getElementById('nov-fab-badge');
  const sideBadge = document.getElementById('nov-sidebar-badge');
  if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
  if (sideBadge) { sideBadge.textContent = count; sideBadge.style.display = count > 0 ? '' : 'none'; }
}

async function openNovedadesPanel() {
  if (_userRole === 'admin') {
    // Admin: abre panel lateral con listado
    document.getElementById('nov-panel-overlay').style.display = '';
    document.getElementById('nov-panel').style.display         = 'flex';
    document.getElementById('nov-panel').style.flexDirection   = 'column';
    await loadNovedadesPanel();
  } else {
    // Trabajador: abre modal de registro directo
    openModalNovedad();
  }
}

function closeNovedadesPanel() {
  document.getElementById('nov-panel-overlay').style.display = 'none';
  document.getElementById('nov-panel').style.display         = 'none';
}

async function loadNovedadesPanel() {
  const listEl = document.getElementById('nov-panel-list');
  const subEl  = document.getElementById('nov-panel-sub');
  listEl.innerHTML = '<div class="nov-empty">Cargando...</div>';

  try {
    const items = await api('GET', '/api/novedades');
    const nuevas = items.filter(n => !n.visto).length;

    subEl.textContent = nuevas > 0
      ? `${nuevas} novedad${nuevas > 1 ? 'es' : ''} nueva${nuevas > 1 ? 's' : ''}`
      : 'Todo al día ✓';

    if (!items.length) {
      listEl.innerHTML = '<div class="nov-empty">Sin novedades registradas</div>';
      return;
    }

    // Botón "Nueva novedad" arriba
    let html = `<button class="nov-panel-new-btn" onclick="openModalNovedad()">+ Registrar nueva novedad</button>`;

    items.forEach(n => {
      const cfg = NOV_LABELS[n.tipo] || NOV_LABELS.otro;
      const fecha = n.created_at ? n.created_at.slice(5,16).replace('T',' ') : '';
      html += `
      <div class="nov-item ${n.visto ? '' : 'nueva'}">
        <div class="nov-item-header">
          <span class="nov-tipo-chip ${n.tipo}">${cfg.icon} ${cfg.label}</span>
          <span class="nov-item-time">${fecha}</span>
        </div>
        <div class="nov-item-desc">${n.descripcion}</div>
        <div class="nov-item-footer">
          <span class="nov-item-author">👤 ${n.reportado_por || 'Anónimo'}</span>
          <button class="nov-item-del" onclick="deleteNovedad(${n.id})" title="Eliminar">🗑</button>
        </div>
      </div>`;
    });
    listEl.innerHTML = html;

    // Marcar todas como vistas
    await api('POST', '/api/novedades/marcar-vistas');
    _updateNovedadesBadges(0);

  } catch(e) {
    listEl.innerHTML = '<div class="nov-empty">Error al cargar novedades</div>';
  }
}

async function deleteNovedad(id) {
  if (!confirm('¿Eliminar esta novedad?')) return;
  try {
    await api('DELETE', `/api/novedades/${id}`);
    toast('Novedad eliminada', 'success');
    loadNovedadesPanel();
  } catch(e) { toast('Error al eliminar', 'error'); }
}

function openModalNovedad() {
  // Reset tipo
  _novTipo = 'agotado';
  document.querySelectorAll('.nov-tipo-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.nov-tipo-btn[data-tipo="agotado"]')?.classList.add('active');
  document.getElementById('nov-descripcion').value = '';

  // Persona: si es admin pre-seleccionar Admin, si es worker dejar sin selección
  _novPersona = _userRole === 'admin' ? 'Admin' : '';
  document.querySelectorAll('.nov-persona-btn').forEach(b => b.classList.remove('active'));
  if (_userRole === 'admin') {
    document.querySelector('.nov-persona-btn[data-nombre="Admin"]')?.classList.add('active');
  }

  openModal('modal-novedad');
  setTimeout(() => document.getElementById('nov-descripcion')?.focus(), 150);
}

function selectNovedadTipo(btn) {
  document.querySelectorAll('.nov-tipo-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _novTipo = btn.dataset.tipo;
}

function selectNovedadPersona(btn) {
  document.querySelectorAll('.nov-persona-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _novPersona = btn.dataset.nombre;
}

async function saveNovedad() {
  const desc = document.getElementById('nov-descripcion')?.value.trim();
  if (!desc) { toast('Escribe la descripción', 'error'); return; }
  if (!_novPersona) { toast('Selecciona quién reporta', 'error'); return; }

  try {
    await api('POST', '/api/novedades', {
      tipo: _novTipo,
      descripcion: desc,
      reportado_por: _novPersona
    });
    closeModal('modal-novedad');
    toast('✅ Novedad registrada', 'success');
    if (document.getElementById('nov-panel').style.display !== 'none') {
      loadNovedadesPanel();
    }
  } catch(e) { toast('Error al registrar', 'error'); }
}


// ═══════════════════════════════════════════════════════
//  RECEPCIÓN DE INSUMOS
// ═══════════════════════════════════════════════════════
let _recTab = 'pendiente';
let _recAll = [];
let _recFotoFile = null;
let _recibirId = null;
let _recibirPersona = '';

function initRecepcionPage() {
  const adminActions = document.getElementById('rec-admin-actions');
  if (adminActions) adminActions.style.display = _userRole === 'admin' ? '' : 'none';
  switchRecepcionTab(_recTab);
}

function switchRecepcionTab(tab) {
  _recTab = tab;
  document.getElementById('rtab-pendiente')?.classList.toggle('active', tab === 'pendiente');
  document.getElementById('rtab-recibido')?.classList.toggle('active', tab === 'recibido');
  loadRecepciones();
}

async function loadRecepciones() {
  const listEl = document.getElementById('rec-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="rec-empty">Cargando…</div>';
  try {
    _recAll = await api('GET', '/api/recepciones');
    const pend = _recAll.filter(r => r.estado === 'pendiente');
    const reci = _recAll.filter(r => r.estado === 'recibido');
    document.getElementById('rec-count-pendiente').textContent = pend.length;
    document.getElementById('rec-count-recibido').textContent  = reci.length;
    _updateRecepcionBadge(pend.length);
    _renderRecepciones(_recTab === 'pendiente' ? pend : reci);
  } catch(e) {
    listEl.innerHTML = '<div class="rec-empty">Error al cargar</div>';
  }
}

function _updateRecepcionBadge(n) {
  const badge = document.getElementById('nav-reception-badge');
  if (!badge) return;
  if (n > 0 && _userRole !== 'admin') {
    badge.textContent = n;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function _renderRecepciones(items) {
  const listEl = document.getElementById('rec-list');
  const isAdmin = _userRole === 'admin';
  if (!items.length) {
    listEl.innerHTML = `<div class="rec-empty">${_recTab === 'pendiente'
      ? '🎉 No hay insumos pendientes por llegar'
      : 'Aún no se ha recibido nada'}</div>`;
    return;
  }
  listEl.innerHTML = items.map(r => {
    const foto = r.foto
      ? `<img class="rec-card-photo" src="/uploads/recepciones/${r.foto}" onclick="window.open('/uploads/recepciones/${r.foto}','_blank')"/>`
      : `<div class="rec-card-photo rec-card-photo-empty">📦</div>`;
    const meta = [];
    if (r.cantidad)  meta.push(`<span class="rec-chip">📦 ${esc(r.cantidad)}</span>`);
    if (r.proveedor) meta.push(`<span class="rec-chip">🚚 ${esc(r.proveedor)}</span>`);
    if (r.fecha_esperada && r.estado === 'pendiente') {
      meta.push(`<span class="rec-chip rec-chip-date">📅 ${_recFmtFecha(r.fecha_esperada)}</span>`);
    }
    let footer = '';
    if (r.estado === 'pendiente') {
      footer = `<button class="btn btn-primary rec-recibir-btn" onclick="openRecibirModal(${r.id})">✅ Marcar recibido</button>`;
    } else {
      const nota = r.nota_recepcion ? `<div class="rec-nota">📝 ${esc(r.nota_recepcion)}</div>` : '';
      footer = `<div class="rec-recibido-info">✅ Recibido por <b>${esc(r.recibido_por || '—')}</b>
                  <span class="rec-recibido-time">${r.recibido_at ? fmtDate(r.recibido_at) : ''}</span>${nota}</div>`;
    }
    const del = isAdmin
      ? `<button class="rec-del-btn" onclick="deleteRecepcion(${r.id})" title="Eliminar">🗑</button>`
      : '';
    return `<div class="rec-card ${r.estado}">
      ${foto}
      <div class="rec-card-body">
        <div class="rec-card-top">
          <span class="rec-card-title">${esc(r.descripcion)}</span>
          ${del}
        </div>
        ${meta.length ? `<div class="rec-card-meta">${meta.join('')}</div>` : ''}
        <div class="rec-card-footer">${footer}</div>
      </div>
    </div>`;
  }).join('');
}

function _recFmtFecha(f) {
  try {
    const d = new Date(f + 'T00:00:00');
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const diff = Math.round((d - hoy) / 86400000);
    const txt = d.toLocaleDateString('es-MX', { weekday:'short', day:'numeric', month:'short' });
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff < 0)   return txt + ' (atrasado)';
    return txt;
  } catch { return f; }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Modal registrar (admin) ──
function openRecepcionModal() {
  _recFotoFile = null;
  document.getElementById('rec-descripcion').value = '';
  document.getElementById('rec-cantidad').value = '';
  document.getElementById('rec-proveedor').value = '';
  document.getElementById('rec-fecha').value = new Date().toISOString().slice(0,10);
  document.getElementById('rec-foto-input').value = '';
  document.getElementById('rec-photo-preview').style.display = 'none';
  document.getElementById('rec-photo-placeholder').style.display = '';
  openModal('modal-recepcion');
  setTimeout(() => document.getElementById('rec-descripcion')?.focus(), 150);
}

function handleRecPhotoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  _recFotoFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = document.getElementById('rec-photo-preview');
    img.src = ev.target.result;
    img.style.display = '';
    document.getElementById('rec-photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function saveRecepcion() {
  const desc = document.getElementById('rec-descripcion').value.trim();
  if (!desc) { toast('Escribe qué va a llegar', 'error'); return; }
  const btn = document.getElementById('rec-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const fd = new FormData();
    fd.append('descripcion', desc);
    fd.append('cantidad', document.getElementById('rec-cantidad').value.trim());
    fd.append('proveedor', document.getElementById('rec-proveedor').value.trim());
    fd.append('fecha_esperada', document.getElementById('rec-fecha').value);
    fd.append('created_by', 'Admin');
    if (_recFotoFile) fd.append('foto', _recFotoFile);
    const res = await fetch('/api/recepciones', { method: 'POST', body: fd });
    if (!res.ok) throw new Error();
    closeModal('modal-recepcion');
    toast('✅ Insumo registrado', 'success');
    _recTab = 'pendiente';
    switchRecepcionTab('pendiente');
  } catch(e) {
    toast('Error al registrar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Registrar';
  }
}

async function deleteRecepcion(id) {
  if (!confirm('¿Eliminar este insumo?')) return;
  try {
    await api('DELETE', `/api/recepciones/${id}`);
    toast('Eliminado', 'success');
    loadRecepciones();
  } catch(e) { toast('Error al eliminar', 'error'); }
}

// ── Modal marcar recibido (trabajador) ──
function openRecibirModal(id) {
  _recibirId = id;
  const r = _recAll.find(x => x.id === id);
  if (!r) return;
  document.getElementById('recibir-resumen').innerHTML =
    `<b>${esc(r.descripcion)}</b>${r.cantidad ? ' · ' + esc(r.cantidad) : ''}`;
  document.getElementById('recibir-nota').value = '';
  // Persona grid
  _recibirPersona = _userRole === 'admin' ? 'Admin' : '';
  const personas = ['Camila', 'Daniela', 'Juan', 'Admin'];
  document.getElementById('recibir-persona-grid').innerHTML = personas.map(p =>
    `<button class="nov-persona-btn${p === _recibirPersona ? ' active' : ''}" data-nombre="${p}" onclick="selectRecibirPersona(this)">
       ${WORKER_AVATARS[p] || '👤'} ${p}
     </button>`).join('');
  openModal('modal-recibir');
}

function selectRecibirPersona(btn) {
  document.querySelectorAll('#recibir-persona-grid .nov-persona-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _recibirPersona = btn.dataset.nombre;
}

async function confirmarRecepcion() {
  if (!_recibirPersona) { toast('Selecciona quién recibe', 'error'); return; }
  try {
    await api('POST', `/api/recepciones/${_recibirId}/recibir`, {
      recibido_por: _recibirPersona,
      nota: document.getElementById('recibir-nota').value.trim()
    });
    closeModal('modal-recibir');
    toast('✅ Insumo recibido', 'success');
    loadRecepciones();
  } catch(e) { toast('Error al confirmar', 'error'); }
}


// ═══════════════════════════════════════════════════════
//  ASEO SEMANAL
// ═══════════════════════════════════════════════════════
const DIAS_MAP = {
  lunes:     'Lunes',
  martes:    'Martes',
  miercoles: 'Miércoles',
  jueves:    'Jueves',
  viernes:   'Viernes',
  sabado:    'Sábado'
};
const DIAS_ORDER = ['lunes','martes','miercoles','jueves','viernes','sabado'];

let _aseoDia = 'lunes'; // día activo

function _getTodayDia() {
  const map = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  return map[new Date().getDay()] || 'lunes';
}

function initAseoSection() {
  const todayDia = _getTodayDia();

  // Marcar botones con .today
  DIAS_ORDER.forEach(dia => {
    const btn = document.querySelector(`.aseo-day-btn[data-dia="${dia}"]`);
    if (btn) btn.classList.toggle('today', dia === todayDia);
  });

  // Mostrar botón agregar solo para admin
  const addBtn = document.getElementById('aseo-add-btn');
  if (addBtn) addBtn.style.display = _userRole === 'admin' ? '' : 'none';

  // Ir al día de hoy (o lunes si domingo)
  const startDia = DIAS_ORDER.includes(todayDia) ? todayDia : 'lunes';
  switchAseoDia(startDia);
}

function switchAseoDia(dia) {
  _aseoDia = dia;
  DIAS_ORDER.forEach(d => {
    const btn = document.querySelector(`.aseo-day-btn[data-dia="${d}"]`);
    if (btn) btn.classList.toggle('active', d === dia);
  });
  toggleAseoAddForm(false);
  loadAseo();
}

async function loadAseo() {
  const today = new Date().toISOString().slice(0, 10);
  const listEl = document.getElementById('aseo-items-list');
  if (!listEl) return;
  listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted)">⏳ Cargando...</div>`;

  // Actualizar label del día
  const labelEl = document.getElementById('aseo-dia-label');
  if (labelEl) labelEl.textContent = DIAS_MAP[_aseoDia] || _aseoDia;

  try {
    const items = await api('GET', `/api/aseo?dia=${_aseoDia}&date=${today}`);
    _renderAseoItems(items || []);
  } catch(e) {
    listEl.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444">⚠️ Error cargando</div>`;
  }
}

function _renderAseoItems(items) {
  const listEl = document.getElementById('aseo-items-list');
  const countEl = document.getElementById('aseo-section-count');

  const total = items.length;
  const done  = items.filter(i => i.completed).length;

  // Progreso
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  const fill  = document.getElementById('aseo-progress-fill');
  const label = document.getElementById('aseo-progress-label');
  const pctBadge = document.getElementById('aseo-progress-pct');
  if (label) label.textContent = `${done} de ${total} tareas completadas`;
  if (pctBadge) { pctBadge.textContent = `${pct}%`; pctBadge.classList.toggle('done', pct===100); }
  if (fill) { fill.style.width = `${pct}%`; fill.classList.toggle('done', pct===100); }
  if (countEl) countEl.textContent = `${done}/${total}`;

  if (!total) {
    listEl.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-muted)">Sin tareas para este día</div>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  let html = '';
  items.forEach(item => {
    const cls = item.completed ? 'cl-item completed' : 'cl-item';
    const meta = item.completed && item.completed_by
      ? `✓ ${item.completed_by}` + (item.completed_at ? ` · ${item.completed_at.slice(11,16)}` : '')
      : '';
    const delBtn = _userRole === 'admin'
      ? `<button class="cl-item-del" onclick="deleteAseoItem(${item.id}, event)" title="Eliminar">🗑</button>`
      : '';
    html += `<div class="${cls}" onclick="toggleAseoItem(${item.id}, ${item.completed ? 'false' : 'true'})">
      <div class="cl-checkbox"><span class="cl-checkbox-tick">✓</span></div>
      <div class="cl-item-body">
        <div class="cl-item-text">${item.text}</div>
        ${meta ? `<div class="cl-item-meta">${meta}</div>` : ''}
      </div>
      ${delBtn}
    </div>`;
  });
  listEl.innerHTML = html;
}

async function toggleAseoItem(itemId, completed) {
  const today = new Date().toISOString().slice(0, 10);
  const completedBy = _userRole === 'admin' ? 'Admin' : 'Trabajador';
  try {
    await api('POST', '/api/aseo/toggle', {
      item_id: itemId, date: today, dia: _aseoDia,
      completed, completed_by: completedBy
    });
    loadAseo();
  } catch(e) { toast('Error al actualizar', 'error'); }
}

function toggleAseoAddForm(show) {
  const form = document.getElementById('aseo-add-form');
  if (!form) return;
  form.style.display = show ? '' : 'none';
  if (show) setTimeout(() => document.getElementById('aseo-new-text')?.focus(), 50);
}

async function saveAseoItem() {
  const text = document.getElementById('aseo-new-text')?.value.trim();
  if (!text) { toast('Escribe la descripción', 'error'); return; }
  try {
    await api('POST', '/api/aseo/items', { dia: _aseoDia, text });
    toast('✅ Tarea de aseo agregada', 'success');
    document.getElementById('aseo-new-text').value = '';
    toggleAseoAddForm(false);
    loadAseo();
  } catch(e) { toast('Error al agregar', 'error'); }
}

async function deleteAseoItem(itemId, e) {
  e.stopPropagation();
  if (!confirm('¿Eliminar esta tarea de aseo?')) return;
  try {
    await api('DELETE', `/api/aseo/items/${itemId}`);
    toast('Tarea eliminada', 'success');
    loadAseo();
  } catch(e) { toast('Error al eliminar', 'error'); }
}


// ═══════════════════════════════════════════════════════
//  RESET POS
// ═══════════════════════════════════════════════════════
function openResetModal() {
  document.getElementById('reset-pin').value = '';
  openModal('modal-reset');
  setTimeout(() => document.getElementById('reset-pin').focus(), 100);
}

async function confirmReset() {
  const pin = document.getElementById('reset-pin').value.trim();
  if (!pin) { toast('Ingresa tu clave', 'error'); return; }
  try {
    await api('POST', '/api/reset', { pin });
    closeModal('modal-reset');
    toast('✅ Transacciones reiniciadas (inventario conservado)', 'success');
    setTimeout(() => location.reload(), 1200);
  } catch(err) {
    toast(err.message || 'PIN incorrecto', 'error');
    document.getElementById('reset-pin').value = '';
    document.getElementById('reset-pin').focus();
  }
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
initTerminalScreen();
