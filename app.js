const SUPABASE_URL = 'https://iulwhewkgugqhelhjkeu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bHdoZXdrZ3VncWhlbGhqa2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Nzg4NjIsImV4cCI6MjEwMjM1NDg2Mn0.ejQV-tdUNz0rKvrgV_L9uSioGs3dCGziDxbv4_78ecI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
let userPin = '';
let expenseChart = null;
let monthlyChart = null;
let currentFilter = 'all';
let currentMonth = getDefaultMonth();

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function getDefaultMonth() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function getAvailableMonths() {
    const months = new Set();
    transactions.forEach(tx => {
        const d = parseDate(tx.date);
        months.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    });
    return [...months].sort();
}

function filterByMonth(txs) {
    if (currentMonth === 'all') return txs;
    const [y, m] = currentMonth.split('-').map(Number);
    return txs.filter(tx => {
        const d = parseDate(tx.date);
        return d.getFullYear() === y && d.getMonth() === m - 1;
    });
}

function setMonthFilter(month) {
    currentMonth = month;
    updateMonthLabel();
    updateAll();
}

function updateMonthLabel() {
    const label = document.getElementById('month-label');
    if (currentMonth === 'all') {
        label.textContent = 'Todos los meses';
    } else {
        const [y, m] = currentMonth.split('-').map(Number);
        label.textContent = MONTHS[m - 1] + ' ' + y;
    }
}

function populateMonthSelector() {
    const select = document.getElementById('month-select');
    const available = getAvailableMonths();
    const now = new Date();
    const current = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    select.innerHTML = '';
    available.forEach(m => {
        const [y, mo] = m.split('-').map(Number);
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = MONTH_SHORT[mo - 1] + ' ' + y;
        select.appendChild(opt);
    });
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'Todos los meses';
    select.appendChild(allOpt);
    select.value = currentMonth;
}

// ─── Supabase helpers ─────────────────────────────────────
async function supaQuery(table, options = {}) {
    let query = db.from(table).select(options.select || '*');
    if (options.filter) {
        options.filter.forEach(f => { query = query.eq(f.col, f.val); });
    }
    if (options.order) query = query.order(options.order.col, { ascending: options.order.asc || false });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
}

async function supaInsert(table, rows) {
    const { data, error } = await db.from(table).insert(rows).select();
    if (error) throw new Error(error.message);
    return data;
}

async function supaUpdate(table, updates, filters) {
    let query = db.from(table).update(updates);
    filters.forEach(f => { query = query.eq(f.col, f.val); });
    const { error } = await query;
    if (error) throw new Error(error.message);
}

async function supaDelete(table, filters) {
    let query = db.from(table).delete();
    filters.forEach(f => { query = query.eq(f.col, f.val); });
    const { error } = await query;
    if (error) throw new Error(error.message);
}

// ─── PIN ────────────────────────────────────────────────
let pinBuffer = '';
let pinAttempts = 0;
let pinMode = '';

function pinPress(n) {
    if (pinBuffer.length >= 3) return;
    pinBuffer += n;
    updatePinDots();
    if (pinBuffer.length === 3) setTimeout(checkPin, 80);
}

function pinDelete() {
    if (pinBuffer.length > 0) { pinBuffer = pinBuffer.slice(0, -1); updatePinDots(); }
}

function updatePinDots() {
    document.querySelectorAll('.pin-dot').forEach((dot, i) => dot.classList.toggle('filled', i < pinBuffer.length));
    document.getElementById('pin-error').textContent = '';
}

function checkPin() {
    if (!userPin) {
        if (!pinMode) return;
        setUserPin(pinBuffer);
        pinBuffer = ''; hidePin(); updatePinBtn(); initApp();
        return;
    }
    if (pinBuffer === userPin) {
        pinBuffer = ''; hidePin(); initApp();
    } else {
        pinAttempts++;
        updatePinDots();
        if (pinAttempts >= 3) {
            document.getElementById('pin-error').textContent = 'Demasiados intentos';
            setTimeout(() => {
                localStorage.removeItem('finanzas_last_user');
                localStorage.removeItem('finanzas_last_pin');
                hidePin(); showAuth();
            }, 1000);
        } else {
            document.getElementById('pin-error').textContent = 'PIN incorrecto';
            pinBuffer = ''; updatePinDots();
        }
    }
}

function showPin() {
    document.getElementById('auth-screen').classList.add('hidden');
    const screen = document.getElementById('pin-screen');
    screen.classList.remove('hidden');
    document.getElementById('pin-error').textContent = '';
    if (userPin) {
        pinMode = 'unlock'; pinAttempts = 0;
        document.getElementById('pin-title').textContent = 'Ingresá tu PIN';
        document.getElementById('pin-subtitle').textContent = currentUser || '';
        document.getElementById('pin-switch-user').style.display = '';
        document.getElementById('pin-setup-container').style.display = 'none';
    } else {
        pinMode = 'create';
        document.getElementById('pin-title').textContent = 'Creá tu PIN de 3 dígitos';
        document.getElementById('pin-subtitle').textContent = '';
        document.getElementById('pin-switch-user').style.display = 'none';
        document.getElementById('pin-setup-container').style.display = '';
    }
    pinBuffer = ''; updatePinDots();
}

function hidePin() {
    document.getElementById('pin-screen').classList.add('hidden');
}

function switchPinUser() {
    localStorage.removeItem('finanzas_last_user');
    localStorage.removeItem('finanzas_last_pin');
    hidePin(); showAuth();
}

function skipPin() {
    hidePin(); updatePinBtn(); initApp();
}

async function setUserPin(pin) {
    try { await supaUpdate('users', { pin }, [{ col: 'username', val: currentUser }]); } catch {}
    userPin = pin;
    if (currentUser) {
        localStorage.setItem('finanzas_last_user', currentUser);
        localStorage.setItem('finanzas_last_pin', pin);
    }
}

async function removeUserPin() {
    try { await supaUpdate('users', { pin: '' }, [{ col: 'username', val: currentUser }]); } catch {}
    userPin = '';
    if (currentUser) {
        localStorage.removeItem('finanzas_last_user');
        localStorage.removeItem('finanzas_last_pin');
    }
}

function togglePin() {
    if (userPin) {
        if (confirm('¿Desactivar el bloqueo por PIN?')) { removeUserPin(); updatePinBtn(); showToast('PIN desactivado'); }
    } else {
        pinMode = 'create';
        document.getElementById('pin-title').textContent = 'Creá tu PIN de 3 dígitos';
        document.getElementById('pin-subtitle').textContent = '';
        document.getElementById('pin-error').textContent = '';
        document.getElementById('pin-switch-user').style.display = 'none';
        document.getElementById('pin-setup-container').style.display = '';
        document.getElementById('pin-screen').classList.remove('hidden');
        pinBuffer = ''; updatePinDots();
    }
}

// ─── Auth ───────────────────────────────────────────────
async function checkSession() {
    const lastUser = localStorage.getItem('finanzas_last_user');
    const lastPin = localStorage.getItem('finanzas_last_pin');
    if (lastUser && lastPin) {
        try {
            const rows = await supaQuery('users', { filter: [{ col: 'username', val: lastUser }], select: 'username,pin' });
            if (rows.length > 0 && rows[0].pin === lastPin) {
                currentUser = lastUser;
                userPin = lastPin;
                await loadAllData();
                showPin();
                return;
            }
        } catch {}
    }
    if (lastUser) {
        try {
            const rows = await supaQuery('users', { filter: [{ col: 'username', val: lastUser }], select: 'username,pin' });
            if (rows.length > 0) {
                currentUser = lastUser;
                userPin = rows[0].pin || '';
                await loadAllData();
                showPin();
                return;
            }
        } catch {}
    }
    showAuth();
}

async function login(username, password) {
    const rows = await supaQuery('users', { filter: [{ col: 'username', val: username }], select: 'username,password,pin' });
    if (rows.length === 0) throw new Error('Usuario no encontrado');
    if (!bcrypt.compareSync(password, rows[0].password)) throw new Error('Usuario o contraseña incorrectos');
    currentUser = rows[0].username;
    userPin = rows[0].pin || '';
    await loadAllData();
    hideAuth();
    if (userPin) showPin(); else maybeSetPin();
}

async function register(username, password) {
    const existing = await supaQuery('users', { filter: [{ col: 'username', val: username }], select: 'username' });
    if (existing.length > 0) throw new Error('El usuario ya existe');
    const hash = bcrypt.hashSync(password, 10);
    await supaInsert('users', [{ username, password: hash, pin: '' }]);
    currentUser = username;
    await loadAllData();
    hideAuth();
    maybeSetPin();
}

function maybeSetPin() {
    localStorage.setItem('finanzas_last_user', currentUser);
    pinMode = 'create';
    document.getElementById('pin-title').textContent = 'Creá tu PIN de 3 dígitos';
    document.getElementById('pin-subtitle').textContent = '';
    document.getElementById('pin-error').textContent = '';
    document.getElementById('pin-switch-user').style.display = 'none';
    document.getElementById('pin-setup-container').style.display = '';
    document.getElementById('pin-screen').classList.remove('hidden');
    pinBuffer = ''; updatePinDots();
}

async function logout() {
    localStorage.removeItem('finanzas_last_user');
    localStorage.removeItem('finanzas_last_pin');
    currentUser = null; transactions = [];
    customUserCategories = { expense: [], income: [] };
    userPin = ''; CATEGORY_MAP = {};
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-dashboard').classList.add('active');
    document.querySelector('.nav-btn[data-page="dashboard"]').classList.add('active');
    showAuth();
}

// ─── Auth UI ────────────────────────────────────────────
function showAuth() {
    document.getElementById('pin-screen').classList.add('hidden');
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
        const [txs, cats, pinRows] = await Promise.all([
            supaQuery('transactions', { filter: [{ col: 'username', val: currentUser }], order: { col: 'created_at', asc: false } }),
            supaQuery('categories', { filter: [{ col: 'username', val: currentUser }], order: { col: 'label', asc: true } }),
            supaQuery('users', { filter: [{ col: 'username', val: currentUser }], select: 'pin' })
        ]);
        transactions = txs.map(t => ({ id: parseInt(t.id), type: t.type, amount: parseFloat(t.amount), category: t.category, description: t.description, date: t.date }));
        const grouped = { expense: [], income: [] };
        cats.forEach(c => {
            if (grouped[c.type]) grouped[c.type].push({ id: c.id, label: c.label, icon: c.icon, color: c.color });
        });
        customUserCategories = grouped;
        userPin = pinRows.length > 0 ? (pinRows[0].pin || '') : '';
        if (currentUser) {
            localStorage.setItem('finanzas_last_user', currentUser);
            if (userPin) {
                localStorage.setItem('finanzas_last_pin', userPin);
            } else {
                localStorage.removeItem('finanzas_last_pin');
            }
        }
    } catch {
        const lastPin = localStorage.getItem('finanzas_last_pin');
        if (lastPin) userPin = lastPin;
    }
    rebuildCategoryMap();
}

async function addTransactionAPI(tx) {
    const id = Date.now();
    await supaInsert('transactions', [{ id, username: currentUser, type: tx.type, amount: tx.amount, category: tx.category, description: tx.description || '', date: tx.date || '' }]);
    transactions.push({ id, type: tx.type, amount: tx.amount, category: tx.category, description: tx.description || '', date: tx.date || '' });
}

async function deleteTransactionAPI(id) {
    await supaDelete('transactions', [{ col: 'id', val: id }]);
    transactions = transactions.filter(tx => tx.id !== id);
}

async function editTransactionAPI(id, data) {
    await supaUpdate('transactions', { type: data.type, amount: data.amount, category: data.category, description: data.description || '', date: data.date || '' }, [{ col: 'id', val: id }]);
    const tx = transactions.find(t => t.id === id);
    if (tx) { tx.type = data.type; tx.amount = data.amount; tx.category = data.category; tx.description = data.description; tx.date = data.date; }
}

async function addCategoryAPI(type, label, icon) {
    const id = 'custom_' + Date.now();
    const colors = { expense: '#A0A4B8', income: '#00B894' };
    await supaInsert('categories', [{ id, username: currentUser, type, label, icon: icon || '📌', color: colors[type] }]);
    customUserCategories[type].push({ id, label, icon: icon || '📌', color: colors[type] });
    rebuildCategoryMap();
}

async function removeCategoryAPI(type, id) {
    await supaDelete('categories', [{ col: 'id', val: id }]);
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
    hideAuth();
    populateCategories();
    setDefaultDate();
    setupForm();
    setupTypeToggle();
    updateDate();
    updateMonthLabel();
    updateAll();
    setPeriod('this-month');
}

// ─── UI ─────────────────────────────────────────────────
function updateDate() {
    const now = new Date();
    document.getElementById('current-date').textContent = now.getDate() + ' ' + MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    const userEl = document.getElementById('current-user');
    if (userEl && currentUser) userEl.textContent = currentUser;
    updateMonthLabel();
    populateMonthSelector();
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
        opt.value = c.id; opt.textContent = c.icon + ' ' + c.label;
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
            btn.classList.add('active'); populateCategories();
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
        try { await addTransactionAPI({ type, category, amount, description, date }); }
        catch (err) { showToast('Error: ' + err.message); return; }
        e.target.reset(); setDefaultDate();
        document.querySelector('.type-btn.expense-type').classList.add('active');
        document.querySelector('.type-btn.income-type').classList.remove('active');
        populateCategories(); updateAll();
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

function updateAll() { populateMonthSelector(); updateDashboard(); renderTransactions(); renderCategories(); }

// ─── Dashboard ──────────────────────────────────────────
function updateDashboard() {
    const filtered = filterByMonth(transactions);
    const totalIncome = filtered.filter(tx => tx.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = filtered.filter(tx => tx.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = totalIncome - totalExpense;
    document.getElementById('total-balance').textContent = formatCurrency(balance);
    document.getElementById('total-balance').style.color = balance >= 0 ? '#00B894' : '#FF6B6B';
    document.getElementById('quick-income').textContent = formatCurrency(totalIncome);
    document.getElementById('quick-expense').textContent = formatCurrency(totalExpense);
    document.getElementById('quick-count').textContent = filtered.length;
    updateExpenseChart(filtered);
    updateMonthlyChart();
    renderRecentTransactions();
}

function updateExpenseChart(monthTxs) {
    if (typeof Chart === 'undefined') return;
    const expenseTxs = monthTxs.filter(tx => tx.type === 'expense');
    const emptyMsg = document.getElementById('expense-chart-empty');
    const canvas = document.getElementById('expenseChart'); const ctx = canvas.getContext('2d');
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
    const canvas = document.getElementById('monthlyChart'); const ctx = canvas.getContext('2d');
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
    const filtered = filterByMonth(transactions);
    const sorted = [...filtered].sort((a, b) => parseDate(b.date) - parseDate(a.date));
    const recent = sorted.slice(0, 5);
    container.innerHTML = recent.length ? recent.map(tx => renderTransactionHTML(tx)).join('') : '<p style="text-align:center;color:var(--text-muted);padding:24px 0;font-size:14px">No hay movimientos aún</p>';
}

// ─── Transactions list ─────────────────────────────────
function renderTransactions() {
    const container = document.getElementById('all-transactions');
    let filtered = filterByMonth(transactions);
    if (currentFilter === 'income') filtered = filtered.filter(tx => tx.type === 'income');
    else if (currentFilter === 'expense') filtered = filtered.filter(tx => tx.type === 'expense');
    filtered.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    if (!filtered.length) { container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:40px 0;font-size:14px">No hay movimientos</p>'; return; }
    let currentDate = ''; let html = '';
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
    return '<div class="transaction-item" data-id="' + tx.id + '" onclick="openEditTx(' + tx.id + ')"><div class="transaction-cat-icon ' + tx.type + '"><span>' + cat.icon + '</span></div><div class="transaction-info"><div class="transaction-desc">' + escapeHTML(tx.description) + '</div><div class="transaction-meta">' + formatDate(tx.date) + ' <span class="transaction-category">' + cat.label + '</span></div></div><span class="transaction-amount ' + tx.type + '">' + prefix + formatCurrency(tx.amount) + '</span><button class="delete-btn" onclick="event.stopPropagation();deleteTransaction(' + tx.id + ')" title="Eliminar">&times;</button></div>';
}

async function deleteTransaction(id) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try { await deleteTransactionAPI(id); } catch (err) { showToast('Error: ' + err.message); return; }
    updateAll(); showToast('Movimiento eliminado');
}

let editTxType = 'expense';

function openEditTx(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    editTxType = tx.type;
    document.getElementById('edit-tx-modal').dataset.editId = id;
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-description').value = tx.description;
    document.getElementById('edit-tx-date').value = tx.date;
    const typeBtns = document.querySelectorAll('#edit-tx-form .type-btn');
    typeBtns.forEach(b => b.classList.toggle('active', b.dataset.type === tx.type));
    const sel = document.getElementById('edit-tx-category');
    const cats = getAllCategories(tx.type);
    sel.innerHTML = cats.map(c => '<option value="' + c.id + '"' + (c.id === tx.category ? ' selected' : '') + '>' + c.icon + ' ' + c.label + '</option>').join('');
    document.getElementById('edit-tx-modal').classList.add('active');
}

function closeEditTx() { document.getElementById('edit-tx-modal').classList.remove('active'); }

function setEditType(type) {
    editTxType = type;
    document.querySelectorAll('#edit-tx-form .type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    const sel = document.getElementById('edit-tx-category');
    const cats = getAllCategories(type);
    sel.innerHTML = cats.map(c => '<option value="' + c.id + '">' + c.icon + ' ' + c.label + '</option>').join('');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('edit-tx-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = parseInt(document.getElementById('edit-tx-modal').dataset.editId);
        const data = {
            type: editTxType,
            amount: parseFloat(document.getElementById('edit-tx-amount').value),
            category: document.getElementById('edit-tx-category').value,
            description: document.getElementById('edit-tx-description').value,
            date: document.getElementById('edit-tx-date').value
        };
        try { await editTransactionAPI(id, data); } catch (err) { showToast('Error: ' + err.message); return; }
        closeEditTx(); updateAll(); showToast('Movimiento actualizado');
    });
});

// ─── Categories page ───────────────────────────────────
function renderCategories() {
    const container = document.getElementById('categories-grid');
    const filtered = filterByMonth(transactions);
    const expenseTxs = filtered.filter(tx => tx.type === 'expense');
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

function renderStats() { const txs = getStatsTxs(); updateStatsSummary(txs); updateStatsBarChart(txs); updateStatsDonutChart(txs); updateStatsTrendChart(txs); updateStatsProjection(txs); renderTopExpenses(txs); renderInsights(txs); }

function generateInsights(txs) {
    if (!txs.length) return [];
    const insights = [];
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const savingsRate = income > 0 ? ((balance / income) * 100) : 0;

    if (savingsRate >= 20) {
        insights.push({ icon: '🎉', title: 'Excelente tasa de ahorro', desc: 'Estás ahorrando el ' + Math.round(savingsRate) + '% de tus ingresos. Esto te da un margen sólido para crecer financieramente.', type: 'positive', value: Math.round(savingsRate) + '%' });
    } else if (savingsRate >= 10) {
        insights.push({ icon: '👍', title: 'Buen ahorro, pero podés mejorar', desc: 'Tu tasa de ahorro es del ' + Math.round(savingsRate) + '%. Intentá llegar al 20% reduciendo gastos en categorías donde más gastás.', type: 'info', value: Math.round(savingsRate) + '%' });
    } else if (savingsRate > 0) {
        insights.push({ icon: '⚠️', title: 'Ahorro bajo', desc: 'Solo ahorrás el ' + Math.round(savingsRate) + '% de tus ingresos. Tratá de reducir gastos fijos o buscar ingresos extra.', type: 'warning', value: Math.round(savingsRate) + '%' });
    } else {
        insights.push({ icon: '🚨', title: 'Gastás más de lo que ingresás', desc: 'Estás en déficit de ' + formatCurrency(Math.abs(balance)) + '. Es urgente reducir gastos o aumentar ingresos.', type: 'warning', value: '-' + formatCurrency(Math.abs(balance)) });
    }

    const expenses = txs.filter(t => t.type === 'expense');
    let sorted = [];
    if (expenses.length > 0) {
        const byCat = {};
        expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
        sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
        const [topCat, topAmt] = sorted[0];
        const catObj = CATEGORY_MAP[topCat] || { label: topCat, icon: '📦' };
        const pct = expense > 0 ? Math.round((topAmt / expense) * 100) : 0;
        insights.push({ icon: catObj.icon, title: 'Mayor gasto: ' + catObj.label, desc: 'Concentrás el ' + pct + '% de tus expensas en esta categoría (' + formatCurrency(topAmt) + '). Si es innecesario, considerá reducirlo.', type: 'tip', value: formatCurrency(topAmt) });
    }

    if (sorted && sorted.length >= 2) {
        const [secondCat, secondAmt] = sorted[1];
        const secObj = CATEGORY_MAP[secondCat] || { label: secondCat, icon: '📦' };
        if (expense > 0 && (secondAmt / expense) > 0.15) {
            insights.push({ icon: '📊', title: 'Segundo gasto alto: ' + secObj.label, desc: 'Esta categoría consume el ' + Math.round((secondAmt / expense) * 100) + '% de tus gastos. Evaluá si podés optimizar este rubro.', type: 'info', value: formatCurrency(secondAmt) });
        }
    }

    const months = {};
    txs.forEach(t => {
        const d = parseDate(t.date);
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (!months[key]) months[key] = { income: 0, expense: 0 };
        if (t.type === 'income') months[key].income += t.amount; else months[key].expense += t.amount;
    });
    const monthKeys = Object.keys(months).sort();
    if (monthKeys.length >= 2) {
        const prev = months[monthKeys[monthKeys.length - 2]];
        const curr = months[monthKeys[monthKeys.length - 1]];
        if (curr.expense > prev.expense * 1.2) {
            insights.push({ icon: '📈', title: 'Gastos subieron este mes', desc: 'Tus gastos crecieron un ' + Math.round(((curr.expense - prev.expense) / prev.expense) * 100) + '% comparado con el mes anterior. Revisá qué cambió.', type: 'warning', value: '+' + formatCurrency(curr.expense - prev.expense) });
        } else if (curr.expense < prev.expense * 0.8) {
            insights.push({ icon: '📉', title: 'Bajaron tus gastos', desc: 'Reduciste tus gastos un ' + Math.round(((prev.expense - curr.expense) / prev.expense) * 100) + '% respecto al mes anterior. ¡Sigue así!', type: 'positive', value: '-' + formatCurrency(prev.expense - curr.expense) });
        }
    }

    if (balance > 0) {
        const emergencyFund = expense / 3;
        if (balance >= emergencyFund) {
            insights.push({ icon: '🛡️', title: 'Fondo de emergencia', desc: 'Con tu saldo actual cubrís approx. ' + Math.round(balance / (expense / 30)) + ' días de gastos. Se recomienda tener 90 días como mínimo.', type: 'tip', value: formatCurrency(balance) });
        } else {
            const needed = emergencyFund - balance;
            insights.push({ icon: '🛡️', title: 'Construí tu fondo de emergencia', desc: 'Te faltan ' + formatCurrency(needed) + ' para tener 3 meses de gastos cubiertos. Es tu prioridad #1.', type: 'warning', value: formatCurrency(needed) });
        }
    }

    const hasIncome = txs.some(t => t.type === 'income');
    if (!hasIncome) {
        insights.push({ icon: '💡', title: 'Registrá tus ingresos', desc: 'No tenés ingresos registrados. Agregalos para obtener análisis más precisos y mejores consejos.', type: 'tip' });
    }

    const dailyExpense = expense / (statsFrom && statsTo ? Math.max(1, Math.round((parseDate(statsTo) - parseDate(statsFrom)) / 86400000) + 1) : 30);
    insights.push({ icon: '📅', title: 'Gasto promedio diario', desc: 'Gastás approx. ' + formatCurrency(dailyExpense) + ' por día. A fin de mes serían ' + formatCurrency(dailyExpense * 30) + '.', type: 'info', value: formatCurrency(dailyExpense) + '/día' });

    if (balance > expense * 0.5) {
        insights.push({ icon: '💰', title: 'Podés invertir', desc: 'Tenés un saldo de ' + formatCurrency(balance) + '. Considerá invertirlo en plazo fijo, CEDEARs, o un FCI de renta fija para que crezca.', type: 'tip', value: formatCurrency(balance) });
    }

    return insights;
}

function renderInsights(txs) {
    const container = document.getElementById('ai-insights');
    if (!container) return;
    const insights = generateInsights(txs);
    if (!insights.length) { container.innerHTML = '<p class="ai-empty">Registá movimientos para ver consejos personalizados</p>'; return; }
    container.innerHTML = insights.map(i => '<div class="ai-card ' + i.type + '"><div class="ai-card-header"><span class="ai-card-icon">' + i.icon + '</span><span class="ai-card-title">' + i.title + '</span></div><div class="ai-card-desc">' + i.desc + '</div>' + (i.value ? '<div class="ai-card-value">' + i.value + '</div>' : '') + '</div>').join('');
}

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

// ─── PIN button in header ──────────────────────────────
function updatePinBtn() {
    const btn = document.querySelector('.pin-toggle-btn');
    if (btn) btn.style.opacity = userPin ? '1' : '0.5';
}

(function addPinBtn() {
    const headerTop = document.querySelector('.header-top');
    if (headerTop) {
        const btn = document.createElement('button');
        btn.className = 'pin-toggle-btn';
        btn.textContent = '🔢';
        btn.style.cssText = 'background:none;border:none;font-size:16px;cursor:pointer;padding:0 0 0 6px';
        btn.title = 'Configurar PIN';
        btn.onclick = togglePin;
        headerTop.appendChild(btn);
        updatePinBtn();
    }
})();
