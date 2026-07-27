const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('./db');

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
    cookie: { secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// ─── JSON helpers (fallback) ────────────────────────────
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
    catch { return { transactions: [], customCategories: { expense: [], income: [] }, pattern: '' }; }
}
function saveUserData(username, data) {
    fs.writeFileSync(getUserFile(username), JSON.stringify(data, null, 2));
}

function txFromRow(row) {
    return { id: parseInt(row.id), type: row.type, amount: parseFloat(row.amount), category: row.category, description: row.description, date: row.date, createdAt: row.created_at };
}
function catFromRow(row) {
    return { id: row.id, label: row.label, icon: row.icon, color: row.color };
}

function requireAuth(req, res, next) {
    if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
    next();
}

// ─── Auth ───────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        if (username.length < 3) return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
        if (password.length < 4) return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });

        if (db.isReady()) {
            const existing = await db.getPool().query('SELECT username FROM users WHERE username = $1', [username]);
            if (existing.rows.length > 0) return res.status(409).json({ error: 'El usuario ya existe' });
            const hash = bcrypt.hashSync(password, 10);
            await db.getPool().query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
        } else {
            const users = getUsers();
            if (users[username]) return res.status(409).json({ error: 'El usuario ya existe' });
            users[username] = { password: bcrypt.hashSync(password, 10), createdAt: new Date().toISOString() };
            saveUsers(users);
            saveUserData(username, { transactions: [], customCategories: { expense: [], income: [] }, pattern: '' });
        }
        req.session.user = username;
        res.json({ success: true, username });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Completá todos los campos' });

        if (db.isReady()) {
            const result = await db.getPool().query('SELECT password FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0 || !bcrypt.compareSync(password, result.rows[0].password)) {
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }
        } else {
            const users = getUsers();
            const user = users[username];
            if (!user || !bcrypt.compareSync(password, user.password)) {
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            }
        }
        req.session.user = username;
        res.json({ success: true, username });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
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
app.get('/api/pin', requireAuth, async (req, res) => {
    try {
        let pin = '';
        if (db.isReady()) {
            const result = await db.getPool().query('SELECT pin FROM users WHERE username = $1', [req.session.user]);
            pin = result.rows[0]?.pin || '';
        } else {
            const data = getUserData(req.session.user);
            pin = data.pattern || '';
        }
        res.json({ hasPin: !!pin, pin });
    } catch (err) {
        console.error('Get PIN error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/pin', requireAuth, async (req, res) => {
    try {
        if (db.isReady()) {
            await db.getPool().query('UPDATE users SET pin = $1 WHERE username = $2', [req.body.pin || '', req.session.user]);
        } else {
            const data = getUserData(req.session.user);
            data.pattern = req.body.pin || '';
            saveUserData(req.session.user, data);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Set PIN error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.delete('/api/pin', requireAuth, async (req, res) => {
    try {
        if (db.isReady()) {
            await db.getPool().query('UPDATE users SET pin = $1 WHERE username = $2', ['', req.session.user]);
        } else {
            const data = getUserData(req.session.user);
            data.pattern = '';
            saveUserData(req.session.user, data);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete PIN error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/pin/login', async (req, res) => {
    try {
        const { username, pin } = req.body;
        if (!username || !pin) return res.status(400).json({ error: 'Usuario y PIN requeridos' });
        let storedPin = '';
        if (db.isReady()) {
            const result = await db.getPool().query('SELECT pin FROM users WHERE username = $1', [username]);
            if (result.rows.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });
            storedPin = result.rows[0].pin || '';
        } else {
            const users = getUsers();
            if (!users[username]) return res.status(401).json({ error: 'Usuario no encontrado' });
            const data = getUserData(username);
            storedPin = data.pattern || '';
        }
        if (pin !== storedPin) return res.status(401).json({ error: 'PIN incorrecto' });
        req.session.user = username;
        res.json({ success: true, username });
    } catch (err) {
        console.error('PIN login error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ─── Transactions ───────────────────────────────────────
app.get('/api/transactions', requireAuth, async (req, res) => {
    try {
        if (db.isReady()) {
            const result = await db.getPool().query(
                'SELECT * FROM transactions WHERE username = $1 ORDER BY created_at DESC',
                [req.session.user]
            );
            return res.json(result.rows.map(txFromRow));
        }
        const data = getUserData(req.session.user);
        res.json(data.transactions);
    } catch (err) {
        console.error('Get transactions error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/transactions', requireAuth, async (req, res) => {
    try {
        const { type, amount, category, description, date } = req.body;
        const id = Date.now();
        if (db.isReady()) {
            await db.getPool().query(
                'INSERT INTO transactions (id, username, type, amount, category, description, date) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [id, req.session.user, type, amount, category, description || '', date || '']
            );
        } else {
            const data = getUserData(req.session.user);
            data.transactions.push({ id, type, amount, category, description: description || '', date: date || '', createdAt: new Date().toISOString() });
            saveUserData(req.session.user, data);
        }
        res.json({ id, type, amount, category, description: description || '', date: date || '', createdAt: new Date().toISOString() });
    } catch (err) {
        console.error('Create transaction error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.delete('/api/transactions/:id', requireAuth, async (req, res) => {
    try {
        if (db.isReady()) {
            await db.getPool().query('DELETE FROM transactions WHERE id = $1 AND username = $2', [parseInt(req.params.id), req.session.user]);
        } else {
            const data = getUserData(req.session.user);
            data.transactions = data.transactions.filter(tx => tx.id !== parseInt(req.params.id));
            saveUserData(req.session.user, data);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete transaction error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.put('/api/transactions/:id', requireAuth, async (req, res) => {
    try {
        const { type, amount, category, description, date } = req.body;
        const id = parseInt(req.params.id);
        if (db.isReady()) {
            await db.getPool().query(
                'UPDATE transactions SET type=$1, amount=$2, category=$3, description=$4, date=$5 WHERE id=$6 AND username=$7',
                [type, amount, category, description || '', date || '', id, req.session.user]
            );
        } else {
            const data = getUserData(req.session.user);
            const tx = data.transactions.find(t => t.id === id);
            if (tx) { tx.type = type; tx.amount = amount; tx.category = category; tx.description = description || ''; tx.date = date || ''; }
            saveUserData(req.session.user, data);
        }
        res.json({ success: true, id, type, amount, category, description: description || '', date: date || '' });
    } catch (err) {
        console.error('Update transaction error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ─── Categories ─────────────────────────────────────────
app.get('/api/categories', requireAuth, async (req, res) => {
    try {
        if (db.isReady()) {
            const result = await db.getPool().query(
                'SELECT * FROM categories WHERE username = $1 ORDER BY type, label',
                [req.session.user]
            );
            const grouped = { expense: [], income: [] };
            result.rows.forEach(c => {
                if (grouped[c.type]) grouped[c.type].push(catFromRow(c));
            });
            return res.json(grouped);
        }
        const data = getUserData(req.session.user);
        res.json(data.customCategories);
    } catch (err) {
        console.error('Get categories error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.post('/api/categories', requireAuth, async (req, res) => {
    try {
        const { type, label, icon } = req.body;
        const id = 'custom_' + Date.now();
        const colors = { expense: '#A0A4B8', income: '#00B894' };
        if (db.isReady()) {
            await db.getPool().query(
                'INSERT INTO categories (id, username, type, label, icon, color) VALUES ($1, $2, $3, $4, $5, $6)',
                [id, req.session.user, type, label, icon || '📌', colors[type]]
            );
        } else {
            const data = getUserData(req.session.user);
            data.customCategories[type].push({ id, label, icon: icon || '📌', color: colors[type] });
            saveUserData(req.session.user, data);
        }
        res.json({ success: true, id });
    } catch (err) {
        console.error('Create category error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.delete('/api/categories/:type/:id', requireAuth, async (req, res) => {
    try {
        if (db.isReady()) {
            await db.getPool().query('DELETE FROM categories WHERE id = $1 AND username = $2 AND type = $3',
                [req.params.id, req.session.user, req.params.type]);
        } else {
            const data = getUserData(req.session.user);
            data.customCategories[req.params.type] = data.customCategories[req.params.type].filter(c => c.id !== req.params.id);
            saveUserData(req.session.user, data);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Delete category error:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ─── Start ──────────────────────────────────────────────
db.initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Mis Finanzas corriendo en puerto ${PORT}`);
    });
});
