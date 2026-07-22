const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'mis-finanzas-secret-dev',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

function getUsers() {
    try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf-8')); }
    catch { return {}; }
}

function saveUsers(users) {
    fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
}

function getUserFile(username) {
    return path.join(DATA_DIR, `${username}.json`);
}

function getUserData(username) {
    try { return JSON.parse(fs.readFileSync(getUserFile(username), 'utf-8')); }
    catch { return { transactions: [], customCategories: { expense: [], income: [] }, pin: '' }; }
}

function saveUserData(username, data) {
    fs.writeFileSync(getUserFile(username), JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
    next();
}

// ─── Auth ───────────────────────────────────────────────
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    if (username.length < 3) return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    const users = getUsers();
    if (users[username]) return res.status(409).json({ error: 'El usuario ya existe' });
    users[username] = { password: bcrypt.hashSync(password, 10), createdAt: new Date().toISOString() };
    saveUsers(users);
    saveUserData(username, { transactions: [], customCategories: { expense: [], income: [] }, pin: '' });
    req.session.user = username;
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Completá todos los campos' });
    const users = getUsers();
    const user = users[username];
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    req.session.user = username;
    res.json({ success: true, username });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', (req, res) => {
    if (!req.session.user) return res.json({ user: null });
    res.json({ user: req.session.user });
});

// ─── PIN ────────────────────────────────────────────────
app.get('/api/pin', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    res.json({ hasPin: !!data.pin, pin: data.pin || '' });
});

app.post('/api/pin', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    data.pin = req.body.pin || '';
    saveUserData(req.session.user, data);
    res.json({ success: true });
});

app.delete('/api/pin', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    data.pin = '';
    saveUserData(req.session.user, data);
    res.json({ success: true });
});

// ─── Transactions ───────────────────────────────────────
app.get('/api/transactions', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    res.json(data.transactions);
});

app.post('/api/transactions', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    const tx = { id: Date.now(), ...req.body, createdAt: new Date().toISOString() };
    data.transactions.push(tx);
    saveUserData(req.session.user, data);
    res.json(tx);
});

app.delete('/api/transactions/:id', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    data.transactions = data.transactions.filter(tx => tx.id !== parseInt(req.params.id));
    saveUserData(req.session.user, data);
    res.json({ success: true });
});

// ─── Categories ─────────────────────────────────────────
app.get('/api/categories', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    res.json(data.customCategories);
});

app.post('/api/categories', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    const { type, label, icon } = req.body;
    const id = 'custom_' + Date.now();
    const colors = { expense: '#A0A4B8', income: '#00B894' };
    data.customCategories[type].push({ id, label, icon: icon || '📌', color: colors[type] });
    saveUserData(req.session.user, data);
    res.json({ success: true, id });
});

app.delete('/api/categories/:type/:id', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    data.customCategories[req.params.type] = data.customCategories[req.params.type].filter(c => c.id !== req.params.id);
    saveUserData(req.session.user, data);
    res.json({ success: true });
});

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mis Finanzas corriendo en http://localhost:${PORT}`);
    console.log(`Desde el celular: http://${require('os').networkInterfaces()['Ethernet']?.[0]?.address || '192.168.1.101'}:${PORT}`);
});
