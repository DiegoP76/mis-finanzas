const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// In-memory WebAuthn challenges (expire on server restart)
const webauthnChallenges = {};

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
    saveUserData(username, { transactions: [], customCategories: { expense: [], income: [] }, pin: '', credentials: [] });
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

// ─── WebAuthn ───────────────────────────────────────────
function getWebAuthnConfig(req) {
    const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const host = req.get('host');
    const rpID = host?.includes(':') ? host.split(':')[0] : host;
    return { origin, rpID };
}

app.get('/api/webauthn/has-credentials/:username', (req, res) => {
    const users = getUsers();
    if (!users[req.params.username]) return res.json({ hasCredentials: false });
    const data = getUserData(req.params.username);
    res.json({ hasCredentials: (data.credentials || []).length > 0 });
});

app.post('/api/webauthn/register/begin', requireAuth, async (req, res) => {
    const data = getUserData(req.session.user);
    const { origin, rpID } = getWebAuthnConfig(req);
    const userID = Buffer.from(req.session.user);
    const opts = await generateRegistrationOptions({
        rpName: 'Mis Finanzas',
        rpID,
        userName: req.session.user,
        userID,
        attestationType: 'none',
        excludeCredentials: (data.credentials || []).map(c => ({
            id: c.id,
            type: 'public-key',
            transports: c.transports || ['internal'],
        })),
    });
    webauthnChallenges[req.session.user] = opts.challenge;
    res.json(opts);
});

app.post('/api/webauthn/register/complete', requireAuth, async (req, res) => {
    try {
        const data = getUserData(req.session.user);
        const { origin, rpID } = getWebAuthnConfig(req);
        const challenge = webauthnChallenges[req.session.user];
        if (!challenge) return res.status(400).json({ error: 'Challenge expirado, intentá de nuevo' });
        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });
        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ error: 'No se pudo verificar la huella' });
        }
        delete webauthnChallenges[req.session.user];
        const { credential } = verification.registrationInfo;
        if (!data.credentials) data.credentials = [];
        data.credentials.push({
            id: credential.id,
            publicKey: Buffer.from(credential.publicKey).toString('base64url'),
            counter: credential.counter,
            transports: req.body.response.transports || ['internal'],
        });
        saveUserData(req.session.user, data);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/webauthn/remove', requireAuth, (req, res) => {
    const data = getUserData(req.session.user);
    data.credentials = [];
    saveUserData(req.session.user, data);
    res.json({ success: true });
});

app.post('/api/webauthn/login/begin', async (req, res) => {
    const { username } = req.body;
    const users = getUsers();
    if (!users[username]) return res.status(400).json({ error: 'Usuario no encontrado' });
    const data = getUserData(username);
    const { rpID } = getWebAuthnConfig(req);
    const creds = data.credentials || [];
    if (!creds.length) return res.status(400).json({ error: 'Este usuario no tiene huella registrada' });
    const opts = await generateAuthenticationOptions({
        rpID,
        allowCredentials: creds.map(c => ({
            id: c.id,
            type: 'public-key',
            transports: c.transports || ['internal'],
        })),
        userVerification: 'required',
    });
    webauthnChallenges[username] = opts.challenge;
    res.json(opts);
});

app.post('/api/webauthn/login/complete', async (req, res) => {
    try {
        const { username, credential: assertion } = req.body;
        const challenge = webauthnChallenges[username];
        if (!challenge) return res.status(400).json({ error: 'Challenge expirado, intentá de nuevo' });
        const users = getUsers();
        if (!users[username]) return res.status(400).json({ error: 'Usuario no encontrado' });
        const data = getUserData(username);
        const creds = data.credentials || [];
        const storedCred = creds.find(c => c.id === assertion.id);
        if (!storedCred) return res.status(400).json({ error: 'Credencial no encontrada' });
        const { origin, rpID } = getWebAuthnConfig(req);
        const verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: storedCred.id,
                publicKey: Buffer.from(storedCred.publicKey, 'base64url'),
                counter: storedCred.counter,
                transports: storedCred.transports || ['internal'],
            },
        });
        if (!verification.verified) {
            return res.status(400).json({ error: 'Huella no válida' });
        }
        delete webauthnChallenges[username];
        storedCred.counter = verification.authenticationInfo.newCounter;
        saveUserData(username, data);
        req.session.user = username;
        res.json({ success: true, username });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ─── Start ──────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mis Finanzas corriendo en http://localhost:${PORT}`);
    console.log(`Desde el celular: http://${require('os').networkInterfaces()['Ethernet']?.[0]?.address || '192.168.1.101'}:${PORT}`);
});
