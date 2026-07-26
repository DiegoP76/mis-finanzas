const DEFAULT_CATEGORIES = {
    expense: [
        { id: 'alimentacion', label: 'Alimentación', color: '#FF6B6B', icon: '🛒' },
        { id: 'transporte', label: 'Transporte', color: '#6C63FF', icon: '🚗' },
        { id: 'vivienda', label: 'Vivienda', color: '#FFC107', icon: '🏠' },
        { id: 'servicios', label: 'Servicios', color: '#00B894', icon: '📱' },
        { id: 'entretenimiento', label: 'Entretenimiento', color: '#FF8A65', icon: '🎬' },
        { id: 'salud', label: 'Salud', color: '#E040FB', icon: '💊' },
        { id: 'educacion', label: 'Educación', color: '#448AFF', icon: '📚' },
        { id: 'impuestos', label: 'Impuestos', color: '#78909C', icon: '📋' },
        { id: 'ropa', label: 'Ropa', color: '#F06292', icon: '👕' },
        { id: 'otros', label: 'Otros', color: '#A0A4B8', icon: '📦' }
    ],
    income: [
        { id: 'salario', label: 'Salario', color: '#00B894', icon: '💼' },
        { id: 'freelance', label: 'Freelance', color: '#6C63FF', icon: '💻' },
        { id: 'inversiones', label: 'Inversiones', color: '#FFC107', icon: '📈' },
        { id: 'venta', label: 'Venta', color: '#FF8A65', icon: '🛍️' },
        { id: 'otros', label: 'Otros', color: '#A0A4B8', icon: '📦' }
    ]
};

let CATEGORY_MAP = {};
let transactions = [];
let customUserCategories = { expense: [], income: [] };
let currentUser = null;
let userPattern = '';
let expenseChart = null;
let monthlyChart = null;
let currentFilter = 'all';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── API helper ─────────────────────────────────────────
async function api(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error de conexión');
    return data;
}

// ─── Pattern ────────────────────────────────────────────
const PATTERN_MIN = 4;
let patternNodes = [];
let patternAttempts = 0;
let patternMode = ''; // 'create' or 'unlock'

const PATTERN_SIZE = 260;
const PATTERN_PADDING = 42;
const PATTERN_RADIUS = 20;
const PATTERN_HIT_RADIUS = 50;

function getPatternPoints() {
    const spacing = (PATTERN_SIZE - PATTERN_PADDING * 2) / 2;
    const points = [];
    let idx = 0;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            points.push({
                idx,
                x: PATTERN_PADDING + col * spacing,
                y: PATTERN_PADDING + row * spacing,
                r: PATTERN_RADIUS
            });
            idx++;
        }
    }
    return points;
}

function svgCoord(clientX, clientY) {
    const svg = document.querySelector('.pattern-svg');
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
}

function getPatternNodeAt(clientX, clientY) {
    const coord = svgCoord(clientX, clientY);
    if (!coord) return null;
    const points = getPatternPoints();
    for (const p of points) {
        const dx = coord.x - p.x, dy = coord.y - p.y;
        if (dx * dx + dy * dy <= PATTERN_HIT_RADIUS * PATTERN_HIT_RADIUS) return p;
    }
    return null;
}

function drawPattern(seq) {
    const svg = document.querySelector('.pattern-svg');
    svg.setAttribute('viewBox', `0 0 ${PATTERN_SIZE} ${PATTERN_SIZE}`);
    const points = getPatternPoints();

    let html = points.map(p =>
        `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" class="pattern-dot${seq.includes(p.idx) ? ' active' : ''}" data-idx="${p.idx}"/>`
    ).join('');

    if (seq.length > 1) {
        for (let i = 0; i < seq.length - 1; i++) {
            const a = points[seq[i]], b = points[seq[i + 1]];
            if (a && b) {
                html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="pattern-line"/>`;
            }
        }
    }

    const last = seq.length > 0 ? points[seq[seq.length - 1]] : null;
    if (last) {
        html += `<circle cx="${last.x}" cy="${last.y}" r="${last.r}" class="pattern-dot last" data-idx="${last.idx}"/>`;
    }

    svg.innerHTML = html;
}

function getPatternSequence(clientX, clientY) {
    const node = getPatternNodeAt(clientX, clientY);
    if (!node) return false;
    if (patternNodes.includes(node.idx)) return true;
    patternNodes.push(node.idx);
    drawPattern(patternNodes);
    return true;
}

function patternStart(e) {
    e.preventDefault();
    const pt = e.touches ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY } : { clientX: e.clientX, clientY: e.clientY };
    patternNodes = [];
    getPatternSequence(pt.clientX, pt.clientY);
}

function patternMove(e) {
    e.preventDefault();
    if (patternNodes.length === 0) return;
    const pt = e.touches ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY } : { clientX: e.clientX, clientY: e.clientY };
    getPatternSequence(pt.clientX, pt.clientY);
}

function patternEnd(e) {
    e.preventDefault();
    if (patternNodes.length === 0) return;
    const seq = patternNodes.join('-');
    patternNodes = [];

    if (patternMode === 'create') {
        verifyPatternCreate(seq);
    } else {
        verifyPatternUnlock(seq);
    }
}

let firstPattern = '';

function verifyPatternCreate(seq) {
    if (seq.split('-').length < PATTERN_MIN) {
        document.getElementById('pattern-error').textContent = 'Conectá al menos 4 puntos';
        drawPattern([]);
        return;
    }
    if (!firstPattern) {
        firstPattern = seq;
        drawPattern([]);
        document.getElementById('pattern-error').textContent = 'Repetí el patrón';
        document.getElementById('pattern-title').textContent = 'Repetí el patrón';
        return;
    }
    if (seq === firstPattern) {
        setUserPattern(seq);
        firstPattern = '';
        hidePattern();
        updatePatternBtn();
        initApp();
    } else {
        firstPattern = '';
        drawPattern([]);
        document.getElementById('pattern-error').textContent = 'Los patrones no coinciden';
        document.getElementById('pattern-title').textContent = 'Creá tu patrón';
    }
}

function verifyPatternUnlock(seq) {
    if (seq === userPattern) {
        hidePattern();
        initApp();
    } else {
        patternAttempts++;
        drawPattern([]);
        if (patternAttempts >= 3) {
            document.getElementById('pattern-error').textContent = 'Demasiados intentos';
            setTimeout(() => {
                localStorage.removeItem('finanzas_last_user');
                localStorage.removeItem('finanzas_last_pattern');
                hidePattern();
                showAuth();
            }, 1000);
        } else {
            document.getElementById('pattern-error').textContent = 'Patrón incorrecto';
        }
    }
}

function showPattern() {
    const screen = document.getElementById('pattern-screen');
    screen.classList.remove('hidden');
    document.getElementById('pattern-error').textContent = '';

    if (userPattern) {
        patternMode = 'unlock';
        patternAttempts = 0;
        document.getElementById('pattern-title').textContent = 'Dibujá tu patrón';
        document.getElementById('pattern-subtitle').textContent = currentUser || '';
        document.getElementById('pattern-switch-user').style.display = '';
        document.getElementById('pattern-setup-container').style.display = 'none';
    } else {
        patternMode = 'create';
        firstPattern = '';
        document.getElementById('pattern-title').textContent = 'Creá tu patrón';
        document.getElementById('pattern-subtitle').textContent = 'Conectá al menos 4 puntos';
        document.getElementById('pattern-switch-user').style.display = 'none';
        document.getElementById('pattern-setup-container').style.display = '';
    }
    drawPattern([]);
    const svg = document.querySelector('.pattern-svg');
    if (svg) {
        svg.addEventListener('touchstart', patternStart, { passive: false });
        svg.addEventListener('touchmove', patternMove, { passive: false });
        svg.addEventListener('touchend', patternEnd, { passive: false });
        svg.addEventListener('mousedown', patternStart);
        svg.addEventListener('mousemove', patternMove);
        svg.addEventListener('mouseup', patternEnd);
        svg.addEventListener('mouseleave', patternEnd);
    }
}

function hidePattern() {
    const screen = document.getElementById('pattern-screen');
    screen.classList.add('hidden');
    const svg = document.querySelector('.pattern-svg');
    if (svg) {
        svg.removeEventListener('touchstart', patternStart);
        svg.removeEventListener('touchmove', patternMove);
        svg.removeEventListener('touchend', patternEnd);
        svg.removeEventListener('mousedown', patternStart);
        svg.removeEventListener('mousemove', patternMove);
        svg.removeEventListener('mouseup', patternEnd);
        svg.removeEventListener('mouseleave', patternEnd);
    }
}

function switchPatternUser() {
    localStorage.removeItem('finanzas_last_user');
    localStorage.removeItem('finanzas_last_pattern');
    hidePattern();
    showAuth();
}

function skipPattern() {
    firstPattern = '';
    hidePattern();
    updatePatternBtn();
    initApp();
}

async function setUserPattern(pattern) {
    try {
        await api('/api/pattern', { method: 'POST', body: { pattern } });
    } catch {}
    userPattern = pattern;
    if (currentUser) {
        localStorage.setItem('finanzas_last_user', currentUser);
        localStorage.setItem('finanzas_last_pattern', pattern);
    }
}

async function removeUserPattern() {
    try {
        await api('/api/pattern', { method: 'DELETE' });
    } catch {}
    userPattern = '';
    if (currentUser) {
        localStorage.removeItem('finanzas_last_user');
        localStorage.removeItem('finanzas_last_pattern');
    }
}

function togglePattern() {
    if (userPattern) {
        if (confirm('¿Desactivar el acceso con patrón?')) {
            removeUserPattern();
            updatePatternBtn();
            showToast('Patrón desactivado');
        }
    } else {
        patternMode = 'create';
        firstPattern = '';
        document.getElementById('pattern-title').textContent = 'Creá tu patrón';
        document.getElementById('pattern-subtitle').textContent = 'Conectá al menos 4 puntos';
        document.getElementById('pattern-error').textContent = '';
        document.getElementById('pattern-switch-user').style.display = 'none';
        document.getElementById('pattern-setup-container').style.display = '';
        document.getElementById('pattern-screen').classList.remove('hidden');
        drawPattern([]);
        const svg = document.querySelector('.pattern-svg');
        if (svg) {
            svg.addEventListener('touchstart', patternStart, { passive: false });
            svg.addEventListener('touchmove', patternMove, { passive: false });
            svg.addEventListener('touchend', patternEnd, { passive: false });
            svg.addEventListener('mousedown', patternStart);
            svg.addEventListener('mousemove', patternMove);
            svg.addEventListener('mouseup', patternEnd);
            svg.addEventListener('mouseleave', patternEnd);
        }
    }
}

// ─── Auth ───────────────────────────────────────────────
async function checkSession() {
    const lastUser = localStorage.getItem('finanzas_last_user');
    const lastPattern = localStorage.getItem('finanzas_last_pattern');

    try {
        const data = await api('/api/me');
        if (data.user) {
            currentUser = data.user;
            await loadAllData();
            if (userPattern) showPattern(); else initApp();
        } else if (lastUser && lastPattern) {
            currentUser = lastUser;
            userPattern = lastPattern;
            showPattern();
        } else {
            showAuth();
        }
    } catch {
        if (lastUser && lastPattern) {
            currentUser = lastUser;
            userPattern = lastPattern;
            showPattern();
        } else {
            showAuth();
        }
    }
}

async function login(username, password) {
    const data = await api('/api/login', { method: 'POST', body: { username, password } });
    currentUser = data.username;
    await loadAllData();
    hideAuth();
    if (userPattern) showPattern(); else maybeSetPattern();
}

async function register(username, password) {
    const data = await api('/api/register', { method: 'POST', body: { username, password } });
    currentUser = data.username;
    await loadAllData();
    hideAuth();
    maybeSetPattern();
}

function maybeSetPattern() {
    localStorage.setItem('finanzas_last_user', currentUser);
    patternMode = 'create';
    firstPattern = '';
    document.getElementById('pattern-title').textContent = 'Creá tu patrón de acceso rápido';
    document.getElementById('pattern-subtitle').textContent = 'Conectá al menos 4 puntos';
    document.getElementById('pattern-error').textContent = '';
    document.getElementById('pattern-switch-user').style.display = 'none';
    document.getElementById('pattern-setup-container').style.display = '';
    document.getElementById('pattern-screen').classList.remove('hidden');
    drawPattern([]);
    const svg = document.querySelector('.pattern-svg');
    if (svg) {
        svg.addEventListener('touchstart', patternStart, { passive: false });
        svg.addEventListener('touchmove', patternMove, { passive: false });
        svg.addEventListener('touchend', patternEnd, { passive: false });
        svg.addEventListener('mousedown', patternStart);
        svg.addEventListener('mousemove', patternMove);
        svg.addEventListener('mouseup', patternEnd);
        svg.addEventListener('mouseleave', patternEnd);
    }
}

async function logout() {
    await api('/api/logout', { method: 'POST' });
    localStorage.removeItem('finanzas_last_user');
    localStorage.removeItem('finanzas_last_pattern');
    currentUser = null;
    transactions = [];
    customUserCategories = { expense: [], income: [] };
    userPattern = '';
    CATEGORY_MAP = {};
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-dashboard').classList.add('active');
    document.querySelector('.nav-btn[data-page="dashboard"]').classList.add('active');
    showAuth();
}

// ─── Auth UI ────────────────────────────────────────────
function showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

function hideAuth() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}

let authMode = 'login';

function switchAuth(mode) {
    authMode = mode;
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.auth-tab[data-auth="' + mode + '"]').classList.add('active');
    document.getElementById('auth-error').textContent = '';
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    const btn = document.getElementById('auth-submit-btn');
    if (mode === 'login') {
        btn.textContent = 'Ingresar';
        document.getElementById('auth-title').textContent = 'Iniciar sesión';
        document.getElementById('auth-subtitle').textContent = 'Ingresá tu usuario y contraseña';
    } else {
        btn.textContent = 'Crear cuenta';
        document.getElementById('auth-title').textContent = 'Crear cuenta';
        document.getElementById('auth-subtitle').textContent = 'Elegí un usuario y contraseña';
    }
}

async function handleAuth(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit-btn');
    btn.disabled = true; btn.textContent = '...';
    errorEl.textContent = '';
    try {
        if (authMode === 'login') await login(username, password);
        else await register(username, password);
    } catch (err) { errorEl.textContent = err.message; }
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Ingresar' : 'Crear cuenta';
}

// ─── Data loading ───────────────────────────────────────
async function loadAllData() {
    try {
        const [txs, cats, patternData] = await Promise.all([
            api('/api/transactions'),
            api('/api/categories'),
            api('/api/pattern')
        ]);
        transactions = txs;
        customUserCategories = cats;
        userPattern = patternData.pattern || '';
        if (currentUser) {
            if (userPattern) {
                localStorage.setItem('finanzas_last_user', currentUser);
                localStorage.setItem('finanzas_last_pattern', userPattern);
            } else {
                localStorage.removeItem('finanzas_last_user');
                localStorage.removeItem('finanzas_last_pattern');
            }
        }
    } catch {
        const lastPattern = localStorage.getItem('finanzas_last_pattern');
        if (lastPattern) userPattern = lastPattern;
    }
    rebuildCategoryMap();
}

async function addTransactionAPI(tx) {
    const saved = await api('/api/transactions', { method: 'POST', body: tx });
    transactions.push(saved);
}

async function deleteTransactionAPI(id) {
    await api(`/api/transactions/${id}`, { method: 'DELETE' });
    transactions = transactions.filter(tx => tx.id !== id);
}

async function addCategoryAPI(type, label, icon) {
    const data = await api('/api/categories', { method: 'POST', body: { type, label, icon: icon || '📌' } });
    const colors = { expense: '#A0A4B8', income: '#00B894' };
    customUserCategories[type].push({ id: data.id, label, icon: icon || '📌', color: colors[type] });
    rebuildCategoryMap();
}

async function removeCategoryAPI(type, id) {
    await api(`/api/categories/${type}/${id}`, { method: 'DELETE' });
    customUserCategories[type] = customUserCategories[type].filter(c => c.id !== id);
    rebuildCategoryMap();
}

// ─── Categories ────────────────────────────────────────
function getCustomCategories() { return customUserCategories; }

function getAllCategories(type) {
    const defaults = DEFAULT_CATEGORIES[type];
    const custom = customUserCategories[type] || [];
    return [...defaults, ...custom];
}

function rebuildCategoryMap() {
    CATEGORY_MAP = {};
    [...getAllCategories('expense'), ...getAllCategories('income')].forEach(c => { CATEGORY_MAP[c.id] = c; });
}

function addCategory(type, label, icon) { addCategoryAPI(type, label, icon); }
function removeCategory(type, id) { removeCategoryAPI(type, id); }

rebuildCategoryMap();

// ─── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('auth-form').addEventListener('submit', handleAuth);
    document.getElementById('auth-username').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('auth-password').focus();
    });
    document.getElementById('auth-password').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('auth-form').dispatchEvent(new Event('submit'));
    });
    document.getElementById('cat-manager-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') addCategoryFromManager();
    });
    checkSession();
});

function initApp() {
    populateCategories();
    setDefaultDate();
    setupForm();
    setupTypeToggle();
    updateDate();
    updateAll();
    setPeriod('this-month');
}

// ─── UI ─────────────────────────────────────────────────
function updateDate() {
    const now = new Date();
    document.getElementById('current-date').textContent = now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    document.getElementById('month-label').textContent = MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    const userEl = document.getElementById('current-user');
    if (userEl && currentUser) userEl.textContent = currentUser;
}

function setDefaultDate() {
    const now = new Date();
    document.getElementById('tx-date').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function populateCategories() {
    const select = document.getElementById('tx-category');
    const currentType = document.querySelector('.type-btn.active').dataset.type;
    select.innerHTML = '<option value="">Seleccionar</option>';
    getAllCategories(currentType).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.icon + ' ' + c.label;
        select.appendChild(opt);
    });
    const mostUsed = getMostUsedCategory(currentType);
    if (mostUsed) select.value = mostUsed;
}

function getMostUsedCategory(type) {
    const usage = {};
    transactions.filter(tx => tx.type === type).forEach(tx => { usage[tx.category] = (usage[tx.category] || 0) + 1; });
    const entries = Object.entries(usage);
    return entries.length ? entries.sort((a, b) => b[1] - a[1])[0][0] : null;
}

function setupTypeToggle() {
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            populateCategories();
            document.getElementById('tx-amount').focus();
        });
    });
}

function setupForm() {
    document.getElementById('transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const type = document.querySelector('.type-btn.active').dataset.type;
        const category = document.getElementById('tx-category').value;
        const amount = parseFloat(document.getElementById('tx-amount').value);
        const description = document.getElementById('tx-description').value.trim();
        const date = document.getElementById('tx-date').value;
        if (!category || !amount || !description || !date) return;
        try {
            await addTransactionAPI({ type, category, amount, description, date });
        } catch (err) { showToast('Error al guardar: ' + err.message); return; }
        e.target.reset();
        setDefaultDate();
        document.querySelector('.type-btn.expense-type').classList.add('active');
        document.querySelector('.type-btn.income-type').classList.remove('active');
        populateCategories();
        updateAll();
        showToast('Movimiento guardado');
        navigateTo('dashboard');
    });
}

function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    const navBtn = document.querySelector('.nav-btn[data-page="' + page + '"]');
    if (navBtn) navBtn.classList.add('active');
    document.getElementById('main-content').scrollTop = 0;
    document.getElementById('app').classList.toggle('add-mode', page === 'add');
    if (page === 'dashboard') updateDashboard();
    if (page === 'stats') renderStats();
    if (page === 'add') { populateCategories(); setDefaultDate(); document.getElementById('tx-amount').focus(); document.getElementById('main-content').scrollTo(0, 0); }
    if (page === 'categories') renderCategories();
}

function filterTransactions(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-filter="' + filter + '"]').classList.add('active');
    renderTransactions();
}

function updateAll() { updateDashboard(); renderTransactions(); renderCategories(); }

// ─── Dashboard ──────────────────────────────────────────
function updateDashboard() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthTxs = transactions.filter(tx => { const d = parseDate(tx.date); return d.getMonth() === currentMonth && d.getFullYear() === currentYear; });
    const totalIncome = transactions.filter(tx => tx.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter(tx => tx.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;
    document.getElementById('total-balance').textContent = formatCurrency(balance);
    document.getElementById('total-balance').style.color = balance >= 0 ? '#00B894' : '#FF6B6B';
    document.getElementById('quick-income').textContent = formatCurrency(totalIncome);
    document.getElementById('quick-expense').textContent = formatCurrency(totalExpense);
    document.getElementById('quick-count').textContent = transactions.length;
    updateExpenseChart(monthTxs);
    updateMonthlyChart();
    renderRecentTransactions();
}

function updateExpenseChart(monthTxs) {
    if (typeof Chart === 'undefined') return;
    const expenseTxs = monthTxs.filter(tx => tx.type === 'expense');
    const emptyMsg = document.getElementById('expense-chart-empty');
    const canvas = document.getElementById('expenseChart');
    const ctx = canvas.getContext('2d');
    if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
    if (expenseTxs.length === 0) { canvas.style.display = 'none'; emptyMsg.style.display = 'block'; return; }
    canvas.style.display = 'block'; emptyMsg.style.display = 'none';
    const byCategory = {};
    expenseTxs.forEach(tx => { byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount; });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([id]) => { const c = CATEGORY_MAP[id]; return c ? c.label : id; });
    const data = sorted.map(([, v]) => v);
    const colors = sorted.map(([id]) => { const c = CATEGORY_MAP[id]; return c ? c.color : '#A0A4B8'; });
    expenseChart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 11 }, color: '#636e72' } } } } });
}

function updateMonthlyChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('monthlyChart');
    const ctx = canvas.getContext('2d');
    const emptyMsg = document.getElementById('monthly-chart-empty');
    if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ year: d.getFullYear(), month: d.getMonth(), label: MONTHS[d.getMonth()].slice(0, 3) }); }
    const incomes = months.map(m => transactions.filter(tx => { const d = parseDate(tx.date); return tx.type === 'income' && d.getMonth() === m.month && d.getFullYear() === m.year; }).reduce((s, t) => s + t.amount, 0));
    const expenses = months.map(m => transactions.filter(tx => { const d = parseDate(tx.date); return tx.type === 'expense' && d.getMonth() === m.month && d.getFullYear() === m.year; }).reduce((s, t) => s + t.amount, 0));
    const hasData = incomes.some(v => v > 0) || expenses.some(v => v > 0);
    if (!hasData) { canvas.style.display = 'none'; emptyMsg.style.display = 'block'; return; }
    canvas.style.display = 'block'; emptyMsg.style.display = 'none';
    monthlyChart = new Chart(ctx, { type: 'bar', data: { labels: months.map(m => m.label), datasets: [{ label: 'Ingresos', data: incomes, backgroundColor: 'rgba(0,185,148,0.85)', borderRadius: 4, barPercentage: 0.35 }, { label: 'Gastos', data: expenses, backgroundColor: 'rgba(255,107,107,0.85)', borderRadius: 4, barPercentage: 0.35 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#b2bec3' } }, y: { grid: { color: '#eef0f5' }, ticks: { font: { size: 10 }, color: '#b2bec3', callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } } } } });
}

function renderRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    const sorted = [...transactions].sort((a, b) => parseDate(b.date) - parseDate(a.date));
    const recent = sorted.slice(0, 5);
    container.innerHTML = recent.length ? recent.map(tx => renderTransactionHTML(tx)).join('') : '<p style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:14px">No hay movimientos aún</p>';
}

// ─── Transactions list ─────────────────────────────────
function renderTransactions() {
    const container = document.getElementById('all-transactions');
    let filtered = [...transactions];
    if (currentFilter === 'income') filtered = filtered.filter(tx => tx.type === 'income');
    else if (currentFilter === 'expense') filtered = filtered.filter(tx => tx.type === 'expense');
    filtered.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    if (!filtered.length) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0;font-size:14px">No hay movimientos</p>'; return; }
    let currentDate = '';
    let html = '';
    filtered.forEach(tx => {
        if (tx.date !== currentDate) {
            currentDate = tx.date;
            const d = parseDate(tx.date);
            html += '<div style="font-size:12px;font-weight:600;color:var(--text-muted);padding:8px 0 4px;text-transform:capitalize">' + d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>';
        }
        html += renderTransactionHTML(tx);
    });
    container.innerHTML = html;
}

function renderTransactionHTML(tx) {
    const cat = CATEGORY_MAP[tx.category] || { label: tx.category, icon: '📦' };
    const prefix = tx.type === 'expense' ? '-' : '+';
    return '<div class="transaction-item" data-id="' + tx.id + '">' +
        '<div class="transaction-cat-icon ' + tx.type + '"><span>' + cat.icon + '</span></div>' +
        '<div class="transaction-info">' +
            '<div class="transaction-desc">' + escapeHTML(tx.description) + '</div>' +
            '<div class="transaction-meta">' + formatDate(tx.date) + ' <span class="transaction-category">' + cat.label + '</span></div>' +
        '</div>' +
        '<span class="transaction-amount ' + tx.type + '">' + prefix + formatCurrency(tx.amount) + '</span>' +
        '<button class="delete-btn" onclick="deleteTransaction(' + tx.id + ')" title="Eliminar">&times;</button>' +
    '</div>';
}

async function deleteTransaction(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try { await deleteTransactionAPI(id); } catch (err) { showToast('Error al eliminar: ' + err.message); return; }
    updateAll();
    showToast('Movimiento eliminado');
}

// ─── Categories page ───────────────────────────────────
function renderCategories() {
    const container = document.getElementById('categories-grid');
    const expenseTxs = transactions.filter(tx => tx.type === 'expense');
    const totalExpense = expenseTxs.reduce((s, t) => s + t.amount, 0);
    if (!expenseTxs.length) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0;font-size:14px">Sin gastos registrados</p>'; return; }
    const byCategory = {};
    expenseTxs.forEach(tx => { byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.amount; });
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    const maxAmount = sorted[0][1];
    container.innerHTML = sorted.map(([id, amount]) => {
        const cat = CATEGORY_MAP[id] || { label: id, color: '#A0A4B8' };
        const percent = ((amount / totalExpense) * 100).toFixed(1);
        const width = (amount / maxAmount) * 100;
        return '<div class="category-item"><div class="category-header"><span class="category-name"><span class="category-dot" style="background:' + cat.color + '"></span> ' + cat.icon + ' ' + cat.label + '</span><span class="category-amount">' + formatCurrency(amount) + '</span></div><div class="category-bar"><div class="category-bar-fill" style="width:' + width + '%;background:' + cat.color + '"></div></div><span class="category-percent">' + percent + '% del total</span></div>';
    }).join('');
}

// ─── Stats ──────────────────────────────────────────────
let statsBarChart = null, statsDonutChart = null, statsTrendChart = null;
let statsFrom = '', statsTo = '';
let statsPreset = 'this-month';

function toLocalDateStr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }

function getDefaultRange(preset) {
    const now = new Date(); const y = now.getFullYear(), m = now.getMonth();
    switch (preset) {
        case 'this-month': return { from: toLocalDateStr(new Date(y, m, 1)), to: toLocalDateStr(new Date(y, m + 1, 0)) };
        case 'last-month': return { from: toLocalDateStr(new Date(y, m - 1, 1)), to: toLocalDateStr(new Date(y, m, 0)) };
        case 'last-3': return { from: toLocalDateStr(new Date(y, m - 2, 1)), to: toLocalDateStr(new Date(y, m + 1, 0)) };
        case 'this-year': return { from: toLocalDateStr(new Date(y, 0, 1)), to: toLocalDateStr(new Date(y, 11, 31)) };
    }
}

function setPeriod(preset) {
    statsPreset = preset;
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.preset-btn[data-period="' + preset + '"]').classList.add('active');
    const range = getDefaultRange(preset);
    statsFrom = range.from; statsTo = range.to;
    document.getElementById('stats-from').value = statsFrom; document.getElementById('stats-to').value = statsTo;
    renderStats();
}

function setCustomRange() {
    const from = document.getElementById('stats-from').value, to = document.getElementById('stats-to').value;
    if (!from || !to) return;
    statsFrom = from; statsTo = to; statsPreset = 'custom';
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    renderStats();
}

function getStatsTxs() {
    if (!statsFrom || !statsTo) return [];
    const from = parseDate(statsFrom);
    const to = new Date(parseDate(statsTo).getTime() + 86400000 - 1);
    return transactions.filter(tx => { const d = parseDate(tx.date); return d >= from && d <= to; });
}

function renderStats() { const txs = getStatsTxs(); updateStatsSummary(txs); updateStatsBarChart(txs); updateStatsDonutChart(txs); updateStatsTrendChart(txs); updateStatsProjection(txs); renderTopExpenses(txs); }

function updateStatsSummary(txs) {
    const income = txs.filter(tx => tx.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(tx => tx.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const days = statsFrom && statsTo ? Math.round((parseDate(statsTo) - parseDate(statsFrom)) / 86400000) + 1 : 1;
    const dailyAvg = days > 0 ? expense / days : 0;
    const dailyIncome = days > 0 ? income / days : 0;
    document.getElementById('stats-income').textContent = formatCurrency(income);
    document.getElementById('stats-income').style.color = '#00B894';
    document.getElementById('stats-expense').textContent = formatCurrency(expense);
    document.getElementById('stats-expense').style.color = '#FF6B6B';
    document.getElementById('stats-balance').textContent = formatCurrency(balance);
    document.getElementById('stats-balance').style.color = balance >= 0 ? '#00B894' : '#FF6B6B';
    document.getElementById('stats-daily').textContent = formatCurrency(Math.round(dailyAvg));
    document.getElementById('stats-daily').style.color = dailyAvg > 0 ? 'var(--expense)' : 'var(--text)';
    document.getElementById('stats-daily-income').textContent = formatCurrency(Math.round(dailyIncome));
    document.getElementById('stats-daily-income').style.color = dailyIncome > 0 ? '#00B894' : 'var(--text)';
    document.getElementById('stats-count').textContent = txs.length;
}

function updateStatsBarChart(txs) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('statsBarChart'), ctx = canvas.getContext('2d');
    const emptyMsg = document.getElementById('stats-bar-empty');
    if (statsBarChart) { statsBarChart.destroy(); statsBarChart = null; }
    const totalDays = statsFrom && statsTo ? Math.round((parseDate(statsTo) - parseDate(statsFrom)) / 86400000) + 1 : 1;
    const groupByMonth = totalDays > 60;
    const groups = {};
    txs.forEach(tx => {
        const d = parseDate(tx.date);
        const key = groupByMonth ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-S' + Math.ceil(d.getDate() / 7);
        if (!groups[key]) groups[key] = { income: 0, expense: 0, label: '' };
        if (tx.type === 'income') groups[key].income += tx.amount; else groups[key].expense += tx.amount;
    });
    const sortedKeys = Object.keys(groups).sort();
    if (groupByMonth) sortedKeys.forEach(k => { const p = k.split('-'); groups[k].label = MONTHS[parseInt(p[1]) - 1].slice(0, 3) + ' ' + p[0]; });
    else sortedKeys.forEach(k => { const m = k.match(/-S(\d)/); if (m) groups[k].label = 'Sem ' + m[1]; });
    const hasData = sortedKeys.some(k => groups[k].income > 0 || groups[k].expense > 0);
    if (!hasData || !sortedKeys.length) { canvas.style.display = 'none'; emptyMsg.style.display = 'block'; return; }
    canvas.style.display = 'block'; emptyMsg.style.display = 'none';
    statsBarChart = new Chart(ctx, { type: 'bar', data: { labels: sortedKeys.map(k => groups[k].label), datasets: [{ label: 'Ingresos', data: sortedKeys.map(k => groups[k].income), backgroundColor: 'rgba(0,185,148,0.85)', borderRadius: 3, barPercentage: 0.3 }, { label: 'Gastos', data: sortedKeys.map(k => groups[k].expense), backgroundColor: 'rgba(255,107,107,0.85)', borderRadius: 3, barPercentage: 0.3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#b2bec3' } }, y: { grid: { color: '#eef0f5' }, ticks: { font: { size: 9 }, color: '#b2bec3', callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } } } } });
}

function updateStatsDonutChart(txs) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('statsDonutChart'), ctx = canvas.getContext('2d');
    const emptyMsg = document.getElementById('stats-donut-empty');
    if (statsDonutChart) { statsDonutChart.destroy(); statsDonutChart = null; }
    const expenseTxs = txs.filter(tx => tx.type === 'expense');
    if (!expenseTxs.length) { canvas.style.display = 'none'; emptyMsg.style.display = 'block'; return; }
    canvas.style.display = 'block'; emptyMsg.style.display = 'none';
    const byCat = {};
    expenseTxs.forEach(tx => { byCat[tx.category] = (byCat[tx.category] || 0) + tx.amount; });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([id]) => { const c = CATEGORY_MAP[id]; return c ? c.label : id; });
    const data = sorted.map(([, v]) => v);
    const colors = sorted.map(([id]) => { const c = CATEGORY_MAP[id]; return c ? c.color : '#A0A4B8'; });
    statsDonutChart = new Chart(ctx, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 10 }, color: '#636e72' } } } } });
}

function updateStatsTrendChart(txs) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('statsTrendChart'), ctx = canvas.getContext('2d');
    const emptyMsg = document.getElementById('stats-trend-empty');
    if (statsTrendChart) { statsTrendChart.destroy(); statsTrendChart = null; }
    if (!txs.length) { canvas.style.display = 'none'; emptyMsg.style.display = 'block'; return; }
    canvas.style.display = 'block'; emptyMsg.style.display = 'none';
    const daily = {};
    const from = parseDate(statsFrom), to = parseDate(statsTo);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) daily[toLocalDateStr(d)] = 0;
    let preBalance = 0;
    const rangeStart = parseDate(statsFrom);
    transactions.forEach(tx => { const d = parseDate(tx.date); if (d < rangeStart) preBalance += tx.type === 'income' ? tx.amount : -tx.amount; });
    const dailyDelta = {};
    txs.forEach(tx => { dailyDelta[tx.date] = (dailyDelta[tx.date] || 0) + (tx.type === 'income' ? tx.amount : -tx.amount); });
    const dates = Object.keys(daily).sort();
    let cum = preBalance;
    const values = dates.map(d => { cum += dailyDelta[d] || 0; return cum; });
    const labels = dates.map(d => { const dt = parseDate(d); return dt.getDate() + '/' + (dt.getMonth() + 1); });
    statsTrendChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Balance', data: values, borderColor: '#6C63FF', backgroundColor: 'rgba(108,99,255,0.08)', fill: true, tension: 0.3, pointRadius: 2, pointBackgroundColor: '#6C63FF', borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#b2bec3', maxTicksLimit: 10 } }, y: { grid: { color: '#eef0f5' }, ticks: { font: { size: 9 }, color: '#b2bec3', callback: v => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v) } } } } });
}

function updateStatsProjection(txs) {
    const card = document.getElementById('stats-projection'), body = document.getElementById('stats-projection-body');
    const now = new Date();
    if (statsPreset !== 'this-month' || !txs.length) { card.style.display = 'none'; return; }
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate(), daysLeft = daysInMonth - dayOfMonth, daysElapsed = dayOfMonth;
    const monthExpense = txs.filter(tx => tx.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const monthIncome = txs.filter(tx => tx.type === 'income').reduce((s, t) => s + t.amount, 0);
    const dailyRate = daysElapsed > 0 ? monthExpense / daysElapsed : 0;
    const projectedExpense = Math.round(dailyRate * daysInMonth);
    const remainingBudget = Math.round((monthIncome - monthExpense) + dailyRate * daysLeft);
    const projectedBalance = monthIncome - projectedExpense;
    const cc = v => v >= 0 ? 'highlight-green' : 'highlight-red';
    body.innerHTML = '<div>Día <strong>' + dayOfMonth + '</strong> de <strong>' + daysInMonth + '</strong> &middot; <strong>' + daysLeft + '</strong> días restantes</div><div>Gasto promedio diario: <strong>' + formatCurrency(Math.round(dailyRate)) + '</strong></div><div>Proyección fin de mes: <strong>' + formatCurrency(projectedExpense) + '</strong> en gastos</div><div>Balance proyectado: <strong class="' + cc(projectedBalance) + '">' + formatCurrency(projectedBalance) + '</strong></div><div style="margin-top:6px;padding-top:8px;border-top:1px solid var(--border)">' + (remainingBudget >= 0 ? 'Te quedan <strong class="highlight-green">' + formatCurrency(remainingBudget) + '</strong> para el resto del mes' : 'Estás <strong class="highlight-red">' + formatCurrency(Math.abs(remainingBudget)) + '</strong> por encima de tu presupuesto') + '</div>';
    card.style.display = 'block';
}

function renderTopExpenses(txs) {
    const container = document.getElementById('stats-top-expenses');
    const expenses = txs.filter(tx => tx.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 10);
    if (!expenses.length) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:16px 0;font-size:13px">Sin gastos en este período</p>'; return; }
    container.innerHTML = expenses.map(tx => {
        const cat = CATEGORY_MAP[tx.category] || { label: tx.category, icon: '📦' };
        return '<div class="transaction-item"><div class="transaction-cat-icon expense"><span>' + cat.icon + '</span></div><div class="transaction-info"><div class="transaction-desc">' + escapeHTML(tx.description) + '</div><div class="transaction-meta">' + formatDate(tx.date) + ' &middot; ' + cat.label + '</div></div><span class="transaction-amount expense">-' + formatCurrency(tx.amount) + '</span></div>';
    }).join('');
}

// ─── Utils ──────────────────────────────────────────────
function formatCurrency(value) { return '$' + Math.round(value).toLocaleString('es-AR'); }
function formatDate(dateStr) { const d = parseDate(dateStr); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
function escapeHTML(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ─── Category Manager ───────────────────────────────────
let catManagerType = 'expense';

function openCategoryManager() {
    document.getElementById('cat-manager').classList.add('active');
    catManagerType = 'expense';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.cat-tab[data-cat-type="expense"]').classList.add('active');
    renderCatManager();
    document.getElementById('cat-manager-input').value = '';
    document.getElementById('cat-manager-input').focus();
}

function closeCategoryManager() { document.getElementById('cat-manager').classList.remove('active'); }

function switchCatTab(type) {
    catManagerType = type;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.cat-tab[data-cat-type="' + type + '"]').classList.add('active');
    renderCatManager();
    document.getElementById('cat-manager-input').value = '';
    document.getElementById('cat-manager-input').focus();
}

function renderCatManager() {
    const container = document.getElementById('cat-manager-list');
    const defaults = DEFAULT_CATEGORIES[catManagerType].map(c => c.id);
    const cats = getAllCategories(catManagerType);
    container.innerHTML = cats.map(c => {
        const isDefault = defaults.includes(c.id);
        const inUse = transactions.filter(tx => tx.type === catManagerType && tx.category === c.id).length;
        return '<div class="cat-manager-item"><span class="cat-info"><span class="cat-dot" style="background:' + c.color + '"></span> ' + c.icon + ' ' + c.label + (isDefault ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px">fija</span>' : '') + '</span>' + (isDefault ? '<button class="cat-remove" disabled title="No se puede eliminar"></button>' : '<button class="cat-remove" onclick="removeCat(\'' + catManagerType + '\',\'' + c.id + '\')" title="' + (inUse > 0 ? inUse + ' movimiento(s) asociado(s)' : 'Eliminar') + '">&times;</button>') + '</div>';
    }).join('');
}

function removeCat(type, id) {
    const inUse = transactions.filter(tx => tx.type === type && tx.category === id).length;
    if (!confirm(inUse > 0 ? 'Hay ' + inUse + ' movimiento(s) con esta categoría. ¿Eliminar de todas formas?' : '¿Eliminar esta categoría?')) return;
    removeCategory(type, id);
    renderCatManager(); populateCategories(); updateAll();
    showToast('Categoría eliminada');
}

function addCategoryFromManager() {
    const input = document.getElementById('cat-manager-input');
    const label = input.value.trim();
    if (!label || label.length < 2) return;
    addCategory(catManagerType, label);
    input.value = '';
    renderCatManager(); populateCategories(); updateAll();
    showToast('Categoría agregada');
    input.focus();
}

// ─── Pattern button in header ──────────────────────────
function updatePatternBtn() {
    const btn = document.querySelector('.pattern-toggle-btn');
    if (btn) btn.style.opacity = userPattern ? '1' : '0.5';
}

(function addPatternBtn() {
    const headerTop = document.querySelector('.header-top');
    if (headerTop) {
        const btn = document.createElement('button');
        btn.className = 'pattern-toggle-btn';
        btn.textContent = '🔐';
        btn.style.cssText = 'background:none;border:none;font-size:16px;cursor:pointer;padding:0 0 0 6px';
        btn.title = 'Configurar patrón';
        btn.onclick = togglePattern;
        headerTop.appendChild(btn);
        updatePatternBtn();
    }
})();
